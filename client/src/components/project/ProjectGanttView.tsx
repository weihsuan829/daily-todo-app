import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  differenceInDays,
  format,
  startOfWeek,
} from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PriorityFlag } from "./PriorityPicker";
import { getEffectiveDates } from "@/lib/taskHierarchy";
import type { ProjectViewProps } from "./types";
import type { Task } from "../../../../drizzle/schema";

// ─── Constants ─────────────────────────────────────────────────────────────────
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 52;
const LEFT_PANEL_WIDTH = 280;

const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// day-width per zoom level (px per day)
const DAY_WIDTH_MAP = {
  day: 38,
  week: 20,
  month: 10,
} as const;

type ZoomMode = "day" | "week" | "month" | "auto";

// ─── Helpers ───────────────────────────────────────────────────────────────────
function toMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function isoWeekNum(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

// ─── Color helper ──────────────────────────────────────────────────────────────

function priorityColor(priority: Task["priority"]): string {
  switch (priority) {
    case "urgent": return "#ef4444";
    case "high":   return "#f59e0b";
    case "medium": return "#3b82f6";
    case "low":    return "#94a3b8";
    default:       return "#3b82f6";
  }
}

function taskBarColor(task: Task): string {
  if (task.color) return task.color;
  return priorityColor(task.priority);
}

function withOpacity(hex: string, alpha: number): string {
  // handle named colors or short hex gracefully
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) {
    return `rgba(59,130,246,${alpha})`;
  }
  let h = hex;
  if (h.length === 4) {
    h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Drag types ────────────────────────────────────────────────────────────────
type DragKind = "move" | "resize-left" | "resize-right";

interface DragState {
  taskId: number;
  kind: DragKind;
  startX: number;
  dayWidth: number;
  originalStart: Date;
  originalEnd: Date;
  currentDeltaDays: number;
}

// ─── Header cell type ──────────────────────────────────────────────────────────
interface HeaderCell {
  label: string;
  subLabel?: string;
  startIdx: number;
  endIdx: number;
  isToday: boolean;
  todayOffsetInCell?: number;
  isWeekend?: boolean;
}

// ─── Visible row type ─────────────────────────────────────────────────────────
interface VisibleRow {
  task: Task;
  isSubtask: boolean;
  effectiveStart: Date | null;
  effectiveEnd: Date | null;
  hasDates: boolean;
}

// ─── GanttBar ──────────────────────────────────────────────────────────────────
interface GanttBarProps {
  task: Task;
  effectiveStart: Date;
  effectiveEnd: Date;
  windowStart: Date;
  dayWidth: number;
  rowIndex: number;
  dragState: DragState | null;
  onDragStart: (task: Task, kind: DragKind, e: React.PointerEvent) => void;
  onBarClick: () => void;
  isSubtask?: boolean;
}

function GanttBar({
  task,
  effectiveStart,
  effectiveEnd,
  windowStart,
  dayWidth,
  rowIndex,
  dragState,
  onDragStart,
  onBarClick,
  isSubtask,
}: GanttBarProps) {
  const isThisDragging = dragState?.taskId === task.id;

  let dispStart = effectiveStart;
  let dispEnd = effectiveEnd;

  if (isThisDragging && dragState) {
    const { kind, currentDeltaDays } = dragState;
    if (kind === "move") {
      dispStart = addDays(effectiveStart, currentDeltaDays);
      dispEnd = addDays(effectiveEnd, currentDeltaDays);
    } else if (kind === "resize-left") {
      dispStart = addDays(effectiveStart, currentDeltaDays);
      if (dispStart > dispEnd) dispStart = dispEnd;
    } else {
      dispEnd = addDays(effectiveEnd, currentDeltaDays);
      if (dispEnd < dispStart) dispEnd = dispStart;
    }
  }

  const startOffset = differenceInDays(dispStart, windowStart);
  const span = Math.max(1, differenceInDays(dispEnd, dispStart) + 1);
  const left = startOffset * dayWidth;
  const width = span * dayWidth - 4;
  const top = rowIndex * ROW_HEIGHT + 6;
  const barHeight = ROW_HEIGHT - 12;

  const color = taskBarColor(task);
  const isDone = task.status === "done";

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: Math.max(width, 4),
        height: barHeight,
        backgroundColor: withOpacity(color, isSubtask ? 0.18 : 0.22),
        borderColor: color,
        zIndex: isThisDragging ? 20 : 10,
      }}
      className={`rounded-md border flex items-center gap-1 px-1.5 text-xs select-none ${
        isDone ? "opacity-60" : ""
      } ${isThisDragging ? "opacity-80" : ""}`}
      title={`${task.title} (${fmtDate(dispStart)} → ${fmtDate(dispEnd)})`}
      onPointerDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.edge) return;
        e.preventDefault();
        e.stopPropagation();
        onDragStart(task, "move", e);
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.edge) return;
        e.stopPropagation();
        onBarClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Left resize handle */}
      <div
        data-edge="left"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: "ew-resize",
          zIndex: 2,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragStart(task, "resize-left", e);
        }}
        title="Drag to change start date"
      />
      <PriorityFlag value={task.priority} size={10} className="flex-shrink-0" />
      <span
        className="truncate font-medium flex-1 min-w-0"
        style={{
          color: "var(--foreground)",
          textDecoration: isDone ? "line-through" : undefined,
        }}
      >
        {task.title}
      </span>
      {/* Right resize handle */}
      <div
        data-edge="right"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: "ew-resize",
          zIndex: 2,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragStart(task, "resize-right", e);
        }}
        title="Drag to change due date"
      />
    </div>
  );
}

// ─── ProjectAggregateBar ───────────────────────────────────────────────────────
function ProjectAggregateBar({
  projectName,
  projectColor,
  minStart,
  maxEnd,
  windowStart,
  dayWidth,
  rowIndex,
}: {
  projectName: string;
  projectColor: string;
  minStart: Date;
  maxEnd: Date;
  windowStart: Date;
  dayWidth: number;
  rowIndex: number;
}) {
  const startOffset = differenceInDays(minStart, windowStart);
  const span = Math.max(1, differenceInDays(maxEnd, minStart) + 1);
  const left = startOffset * dayWidth;
  const width = span * dayWidth - 4;
  const top = rowIndex * ROW_HEIGHT + 8;
  const barHeight = ROW_HEIGHT - 16;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: Math.max(width, 4),
        height: barHeight,
        backgroundColor: withOpacity(projectColor, 0.22),
        borderColor: projectColor,
      }}
      className="rounded-md border opacity-90 flex items-center px-2"
      title={`${projectName} aggregate`}
    />
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ProjectGanttView({
  projectId,
  tasks,
  onOpenTask,
}: ProjectViewProps) {
  const utils = trpc.useUtils();
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  // Fetch project info for color + name
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const project = projects.find((p) => p.id === projectId);
  const projectColor = project?.color ?? "#3b82f6";
  const projectName = project?.name ?? "Project";

  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomMode>(() => {
    try {
      const v = localStorage.getItem(`gantt_zoom_${projectId}`) as ZoomMode;
      if (["day", "week", "month", "auto"].includes(v)) return v;
    } catch {}
    return "day";
  });

  // Project-level collapse (hides all task rows)
  const [collapsed, setCollapsed] = useState(false);
  const [autoFitDayWidth, setAutoFitDayWidth] = useState(36);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragMovedRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(`gantt_zoom_${projectId}`, zoom); } catch {}
  }, [zoom, projectId]);

  // ── Per-task collapse state — shared key with List view ────────────────────
  const [collapsedTasks, setCollapsedTasks] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(`listTaskCollapsed_${projectId}`);
      if (!raw) return new Set();
      return new Set<number>(JSON.parse(raw));
    } catch {
      return new Set();
    }
  });

  const toggleTaskCollapse = useCallback((taskId: number) => {
    setCollapsedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      try {
        localStorage.setItem(
          `listTaskCollapsed_${projectId}`,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  }, [projectId]);

  // ── Dates ─────────────────────────────────────────────────────────────────
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Root tasks only
  const rootTasks = useMemo(
    () => tasks.filter((t) => t.parentTaskId == null),
    [tasks]
  );

  // Build subtasks map for getEffectiveDates
  const subtasksByParent = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const t of tasks) {
      if (t.parentTaskId != null) {
        const arr = map.get(t.parentTaskId) ?? [];
        arr.push(t);
        map.set(t.parentTaskId, arr);
      }
    }
    return map;
  }, [tasks]);

  // Compute span for a task given its children
  function computeSpan(task: Task, children: Task[]): { start: Date | null; end: Date | null; hasDates: boolean } {
    const { startDate, dueDate } = getEffectiveDates(task, children);
    if (!startDate && !dueDate) return { start: null, end: null, hasDates: false };

    let start: Date;
    let end: Date;
    if (startDate && dueDate) {
      start = toMidnight(startDate);
      end = toMidnight(dueDate);
      if (end < start) { const tmp = start; start = end; end = tmp; }
    } else if (startDate) {
      start = toMidnight(startDate);
      end = start;
    } else {
      start = toMidnight(dueDate!);
      end = start;
    }
    return { start, end, hasDates: true };
  }

  // ── Build flat visible-row list (same array used for both panels) ──────────
  const visibleRows = useMemo<VisibleRow[]>(() => {
    if (collapsed) return [];

    const rows: VisibleRow[] = [];
    for (const root of rootTasks) {
      const children = subtasksByParent.get(root.id) ?? [];
      const span = computeSpan(root, children);
      rows.push({
        task: root,
        isSubtask: false,
        effectiveStart: span.start,
        effectiveEnd: span.end,
        hasDates: span.hasDates,
      });

      // If this parent has children and is NOT collapsed, add subtask rows
      if (children.length > 0 && !collapsedTasks.has(root.id)) {
        for (const sub of children) {
          const subSpan = computeSpan(sub, []); // subtask uses its own dates
          rows.push({
            task: sub,
            isSubtask: true,
            effectiveStart: subSpan.start,
            effectiveEnd: subSpan.end,
            hasDates: subSpan.hasDates,
          });
        }
      }
    }
    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, rootTasks, subtasksByParent, collapsedTasks]);

  // ── Summary counts ────────────────────────────────────────────────────────
  // Count root tasks only (consistent with original behavior)
  const rootSpans = useMemo(() => {
    return rootTasks.map((t) => {
      const children = subtasksByParent.get(t.id) ?? [];
      return computeSpan(t, children);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootTasks, subtasksByParent]);

  const datedCount = rootSpans.filter((s) => s.hasDates).length;
  const undatedCount = rootSpans.filter((s) => !s.hasDates).length;

  // Window range — based on ALL tasks with dates (roots + subtasks)
  const { windowStart, windowDays } = useMemo(() => {
    const datedRows = visibleRows.filter((r) => r.hasDates);
    // Also include undisplayed root spans for window calculation
    const allDatedSpans = rootSpans.filter((s) => s.hasDates);

    if (datedRows.length === 0 && allDatedSpans.length === 0) {
      const ws = addDays(today, -14);
      return { windowStart: ws, windowDays: 90 };
    }

    const allDates: Date[] = [];
    for (const s of allDatedSpans) {
      if (s.start) allDates.push(s.start);
      if (s.end) allDates.push(s.end);
    }
    // Also include visible subtask dates for better window fit
    for (const r of datedRows) {
      if (r.effectiveStart) allDates.push(r.effectiveStart);
      if (r.effectiveEnd) allDates.push(r.effectiveEnd);
    }

    if (allDates.length === 0) {
      const ws = addDays(today, -14);
      return { windowStart: ws, windowDays: 90 };
    }

    const minDate = allDates.reduce((a, b) => (a < b ? a : b));
    const maxDate = allDates.reduce((a, b) => (a > b ? a : b));
    const ws = addDays(minDate < today ? minDate : today, -7);
    const we = addDays(maxDate > today ? maxDate : today, 30);
    return {
      windowStart: ws,
      windowDays: Math.max(90, differenceInDays(we, ws) + 1),
    };
  }, [rootSpans, visibleRows, today]);

  // Project aggregate bar span (based on root tasks)
  const aggregateSpan = useMemo(() => {
    const datedSpans = rootSpans.filter((s) => s.hasDates);
    if (datedSpans.length === 0) return null;
    const starts = datedSpans.map((s) => s.start!);
    const ends = datedSpans.map((s) => s.end!);
    return {
      minStart: starts.reduce((a, b) => (a < b ? a : b)),
      maxEnd: ends.reduce((a, b) => (a > b ? a : b)),
    };
  }, [rootSpans]);

  // dayWidth
  const effectiveDayWidth = zoom === "auto" ? autoFitDayWidth : DAY_WIDTH_MAP[zoom];

  // Auto-fit
  useEffect(() => {
    if (zoom !== "auto") return;
    const el = timelineRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0 && windowDays > 0) {
        const dw = Math.max(4, Math.min(48, w / windowDays));
        setAutoFitDayWidth(dw);
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom, windowDays]);

  // ── Header days ────────────────────────────────────────────────────────────
  const headerDays = useMemo(() => {
    return Array.from({ length: windowDays }, (_, i) => {
      const d = addDays(windowStart, i);
      return {
        date: d,
        isToday: fmtDate(d) === fmtDate(today),
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      };
    });
  }, [windowStart, windowDays, today]);

  // Effective render mode (for header + grid lines)
  const effectiveMode: "day" | "week" | "month" = useMemo(() => {
    if (zoom === "day") return "day";
    if (zoom === "week") return "week";
    if (zoom === "month") return "month";
    // auto
    if (effectiveDayWidth >= 24) return "day";
    if (effectiveDayWidth >= 14) return "week";
    return "month";
  }, [zoom, effectiveDayWidth]);

  // Header cells (grouped by day/week/month)
  const headerCells = useMemo<HeaderCell[]>(() => {
    if (headerDays.length === 0) return [];
    const todayStr = fmtDate(today);

    if (effectiveMode === "day") {
      return headerDays.map((d, i) => ({
        label: WEEKDAY[d.date.getDay()],
        subLabel: String(d.date.getDate()),
        startIdx: i,
        endIdx: i,
        isToday: d.isToday,
        isWeekend: d.isWeekend,
        todayOffsetInCell: d.isToday ? 0 : undefined,
      }));
    }

    if (effectiveMode === "week") {
      const cells: HeaderCell[] = [];
      let curStart = 0;
      let curWeek = fmtDate(startOfWeek(headerDays[0].date, { weekStartsOn: 0 }));
      const flush = (s: number, e: number) => {
        const startD = headerDays[s].date;
        const endD = headerDays[e].date;
        const todayIdx = headerDays.findIndex(
          (hd, idx) => idx >= s && idx <= e && fmtDate(hd.date) === todayStr
        );
        cells.push({
          label: `W${isoWeekNum(startD)}`,
          subLabel: `${MONTH_SHORT[startD.getMonth()]} ${startD.getDate()}-${endD.getDate()}`,
          startIdx: s,
          endIdx: e,
          isToday: todayIdx >= 0,
          todayOffsetInCell: todayIdx >= 0 ? todayIdx - s : undefined,
        });
      };
      for (let i = 0; i < headerDays.length; i++) {
        const wk = fmtDate(startOfWeek(headerDays[i].date, { weekStartsOn: 0 }));
        if (wk !== curWeek) {
          flush(curStart, i - 1);
          curStart = i;
          curWeek = wk;
        }
      }
      flush(curStart, headerDays.length - 1);
      return cells;
    }

    // month
    const cells: HeaderCell[] = [];
    let curStart = 0;
    let curMonth = headerDays[0].date.getMonth();
    let curYear = headerDays[0].date.getFullYear();
    const flush = (s: number, e: number) => {
      const startD = headerDays[s].date;
      const todayIdx = headerDays.findIndex(
        (hd, idx) => idx >= s && idx <= e && fmtDate(hd.date) === todayStr
      );
      cells.push({
        label: `${MONTH_SHORT[startD.getMonth()]} ${startD.getFullYear()}`,
        startIdx: s,
        endIdx: e,
        isToday: todayIdx >= 0,
        todayOffsetInCell: todayIdx >= 0 ? todayIdx - s : undefined,
      });
    };
    for (let i = 0; i < headerDays.length; i++) {
      const d = headerDays[i].date;
      if (d.getMonth() !== curMonth || d.getFullYear() !== curYear) {
        flush(curStart, i - 1);
        curStart = i;
        curMonth = d.getMonth();
        curYear = d.getFullYear();
      }
    }
    flush(curStart, headerDays.length - 1);
    return cells;
  }, [headerDays, effectiveMode, today]);

  const todayOffsetDays = differenceInDays(today, windowStart);

  // ── Scroll to today ────────────────────────────────────────────────────────
  function scrollToToday() {
    const el = timelineRef.current;
    if (!el) return;
    const offset = todayOffsetDays * effectiveDayWidth - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, offset), behavior: "smooth" });
  }

  // ── Drag handling ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (task: Task, kind: DragKind, e: React.PointerEvent) => {
      e.preventDefault();
      // For drag, always use the task's OWN dates (not aggregated)
      // so dragging a subtask moves its own dates, dragging a parent moves its own
      const { startDate, dueDate } = getEffectiveDates(task, undefined);

      let origStart: Date;
      let origEnd: Date;
      if (startDate && dueDate) {
        origStart = toMidnight(startDate);
        origEnd = toMidnight(dueDate);
        if (origEnd < origStart) { const tmp = origStart; origStart = origEnd; origEnd = tmp; }
      } else if (startDate) {
        origStart = toMidnight(startDate);
        origEnd = origStart;
      } else if (dueDate) {
        origStart = toMidnight(dueDate);
        origEnd = origStart;
      } else {
        return; // no dates, can't drag
      }

      dragMovedRef.current = false;
      setDragState({
        taskId: task.id,
        kind,
        startX: e.clientX,
        dayWidth: effectiveDayWidth,
        originalStart: origStart,
        originalEnd: origEnd,
        currentDeltaDays: 0,
      });

      const handlePointerMove = (ev: PointerEvent) => {
        setDragState((prev) => {
          if (!prev) return null;
          const deltaPx = ev.clientX - prev.startX;
          const deltaDays = Math.round(deltaPx / prev.dayWidth);
          if (deltaDays !== 0) dragMovedRef.current = true;
          return { ...prev, currentDeltaDays: deltaDays };
        });
      };

      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);

        setDragState((prev) => {
          if (!prev || prev.currentDeltaDays === 0) return null;
          const { taskId, kind: dragKind, originalStart, originalEnd, currentDeltaDays } = prev;

          let newStart: Date;
          let newEnd: Date;
          if (dragKind === "move") {
            newStart = addDays(originalStart, currentDeltaDays);
            newEnd = addDays(originalEnd, currentDeltaDays);
          } else if (dragKind === "resize-left") {
            newStart = addDays(originalStart, currentDeltaDays);
            if (newStart > originalEnd) newStart = originalEnd;
            newEnd = originalEnd;
          } else {
            newStart = originalStart;
            newEnd = addDays(originalEnd, currentDeltaDays);
            if (newEnd < originalStart) newEnd = originalStart;
          }

          updateTask.mutate({ id: taskId, startDate: newStart, dueDate: newEnd });
          return null;
        });
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [effectiveDayWidth, updateTask]
  );

  // ── Rows to render ─────────────────────────────────────────────────────────
  // 1 header row for project aggregate + N visible task rows
  const totalRows = 1 + visibleRows.length;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={scrollToToday}
            className="text-xs px-2 py-1 border border-border rounded hover:bg-muted text-foreground"
          >
            Today
          </button>
          <div className="inline-flex bg-muted rounded-lg p-0.5 text-sm">
            {(["day", "week", "month", "auto"] as ZoomMode[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`px-2.5 py-0.5 rounded-md text-xs transition ${
                  zoom === z
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {{ day: "日", week: "週", month: "月", auto: "Auto fit" }[z]}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {datedCount} 個有日期 · {undatedCount} 個無日期
        </div>
      </div>

      {/* ── Split layout ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left TASK panel ─────────────────────────────────────────────── */}
        <div
          style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }}
          className="shrink-0 bg-card border-r border-border flex flex-col overflow-hidden"
        >
          {/* Left header */}
          <div
            style={{ height: HEADER_HEIGHT }}
            className="border-b border-border bg-muted/40 flex items-center px-3 text-xs uppercase tracking-wider text-muted-foreground shrink-0"
          >
            Task
          </div>

          {/* Left scrollable rows */}
          <div className="flex-1 overflow-hidden">
            {/* Project header row */}
            <button
              style={{ height: ROW_HEIGHT }}
              onClick={() => setCollapsed((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 border-b border-border hover:bg-muted/50 text-left shrink-0"
            >
              {collapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: projectColor }}
              />
              <span className="text-sm font-medium text-foreground truncate flex-1">
                {projectName}
              </span>
              <span className="text-xs text-muted-foreground ml-1">{rootTasks.length}</span>
            </button>

            {/* Task rows — driven by same visibleRows list as right panel */}
            {visibleRows.map((row) => {
              const children = subtasksByParent.get(row.task.id) ?? [];
              const hasChildren = children.length > 0;
              const isCollapsedTask = collapsedTasks.has(row.task.id);

              if (row.isSubtask) {
                // Subtask row: indented with ↳
                return (
                  <div
                    key={`sub-${row.task.id}`}
                    style={{ height: ROW_HEIGHT }}
                    className="flex items-center gap-1 pl-5 pr-2 border-b border-border/60 cursor-pointer hover:bg-muted/30 overflow-hidden"
                    onClick={() => onOpenTask?.(row.task.id)}
                    title={row.task.title}
                  >
                    <span className="text-muted-foreground/50 text-xs flex-shrink-0">↳</span>
                    <PriorityFlag value={row.task.priority} size={10} className="flex-shrink-0" />
                    <span
                      className={`text-sm truncate flex-1 min-w-0 ${
                        row.task.status === "done"
                          ? "line-through text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {row.task.title}
                    </span>
                    {!row.hasDates && (
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: "#fbbf24" }}
                        title="No dates"
                      />
                    )}
                  </div>
                );
              }

              // Root task row
              return (
                <div
                  key={`root-${row.task.id}`}
                  style={{ height: ROW_HEIGHT }}
                  className="flex items-center gap-1.5 px-2 border-b border-border/60 cursor-pointer hover:bg-muted/30 overflow-hidden"
                  onClick={() => onOpenTask?.(row.task.id)}
                  title={row.task.title}
                >
                  {/* Chevron for parents with children */}
                  {hasChildren ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTaskCollapse(row.task.id);
                      }}
                      className="p-0.5 text-muted-foreground hover:text-foreground flex-shrink-0 -ml-0.5"
                      title={isCollapsedTask ? "Expand subtasks" : "Collapse subtasks"}
                    >
                      {isCollapsedTask ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ) : (
                    // Spacer to keep alignment consistent
                    <span className="w-4 flex-shrink-0" />
                  )}
                  <PriorityFlag value={row.task.priority} size={11} className="flex-shrink-0" />
                  <span
                    className={`text-sm truncate flex-1 min-w-0 ${
                      row.task.status === "done"
                        ? "line-through text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {row.task.title}
                  </span>
                  {!row.hasDates && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: "#fbbf24" }}
                      title="No dates"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right timeline panel ─────────────────────────────────────────── */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-auto bg-background relative"
        >
          <div
            style={{
              width: windowDays * effectiveDayWidth,
              minWidth: "100%",
              position: "relative",
            }}
          >
            {/* ── Timeline header ────────────────────────────────────────── */}
            <div
              className="sticky top-0 z-30 bg-card border-b border-border"
              style={{ height: HEADER_HEIGHT }}
            >
              <div className="flex h-full">
                {headerCells.map((cell, i) => {
                  const cellDays = cell.endIdx - cell.startIdx + 1;
                  const cellWidth = cellDays * effectiveDayWidth;
                  const isDay = effectiveMode === "day";
                  const todayDot =
                    cell.isToday &&
                    !isDay &&
                    cell.todayOffsetInCell != null
                      ? cell.todayOffsetInCell * effectiveDayWidth + effectiveDayWidth / 2
                      : null;

                  return (
                    <div
                      key={i}
                      style={{ width: cellWidth, minWidth: cellWidth }}
                      className={[
                        "relative flex flex-col items-center justify-center shrink-0",
                        effectiveMode === "month"
                          ? "border-r border-border/60"
                          : effectiveMode === "week"
                          ? "border-r border-border/40"
                          : "border-r border-border/30",
                        isDay && cell.isWeekend ? "bg-muted/30" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {isDay ? (
                        <>
                          <span
                            className={`text-[10px] uppercase tracking-wider ${
                              cell.isWeekend
                                ? "text-muted-foreground/60"
                                : "text-muted-foreground"
                            }`}
                          >
                            {cell.label}
                          </span>
                          {cell.isToday ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-semibold mt-0.5">
                              {cell.subLabel}
                            </span>
                          ) : (
                            <span
                              className={`text-xs font-medium mt-0.5 ${
                                cell.isWeekend
                                  ? "text-muted-foreground/70"
                                  : "text-foreground"
                              }`}
                            >
                              {cell.subLabel}
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center px-1 text-center">
                          <span
                            className={`text-[10px] uppercase tracking-wider ${
                              cell.isToday
                                ? "text-red-500"
                                : "text-muted-foreground"
                            }`}
                          >
                            {cell.label}
                          </span>
                          {cell.subLabel && (
                            <span
                              className={`text-xs font-medium ${
                                cell.isToday ? "text-red-600" : "text-foreground"
                              }`}
                            >
                              {cell.subLabel}
                            </span>
                          )}
                        </div>
                      )}
                      {todayDot != null && (
                        <div
                          className="absolute bottom-0 w-2 h-2 rounded-full bg-red-500"
                          style={{ left: todayDot - 4 }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Body ───────────────────────────────────────────────────── */}
            <div
              className="relative"
              style={{ height: totalRows * ROW_HEIGHT }}
            >
              {/* Background grid columns */}
              <div className="absolute inset-0 flex pointer-events-none">
                {headerDays.map((d, i) => {
                  const isMonthStart = d.date.getDate() === 1;
                  const isWeekStart = d.date.getDay() === 0;
                  let borderExtra = "";
                  if (effectiveMode === "month" && isMonthStart && i > 0) {
                    borderExtra = "border-l border-border/60";
                  } else if (effectiveMode === "week" && isWeekStart && i > 0) {
                    borderExtra = "border-l border-border/40";
                  }
                  return (
                    <div
                      key={i}
                      style={{ width: effectiveDayWidth, minWidth: effectiveDayWidth }}
                      className={[
                        "border-r border-border/20 shrink-0",
                        borderExtra,
                        d.isWeekend && effectiveDayWidth >= 10
                          ? "bg-[repeating-linear-gradient(45deg,transparent_0,transparent_4px,rgba(0,0,0,0.03)_4px,rgba(0,0,0,0.03)_6px)]"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    />
                  );
                })}
              </div>

              {/* Today vertical red line */}
              {todayOffsetDays >= 0 && todayOffsetDays < windowDays && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none"
                  style={{
                    left: todayOffsetDays * effectiveDayWidth + effectiveDayWidth / 2,
                  }}
                />
              )}

              {/* Row background stripes (row-level horizontal borders) */}
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: totalRows }, (_, i) => (
                  <div
                    key={i}
                    style={{ position: "absolute", top: i * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
                    className="border-b border-border/20"
                  />
                ))}
              </div>

              {/* Project aggregate bar (row 0) */}
              {aggregateSpan && (
                <ProjectAggregateBar
                  projectName={projectName}
                  projectColor={projectColor}
                  minStart={aggregateSpan.minStart}
                  maxEnd={aggregateSpan.maxEnd}
                  windowStart={windowStart}
                  dayWidth={effectiveDayWidth}
                  rowIndex={0}
                />
              )}

              {/* Double-click tracks — one per task row, for dateless leaf tasks */}
              {visibleRows.map((row, i) => {
                const rowIndex = 1 + i;
                // Only leaf tasks (no children) without dates get the dblclick-to-create handler
                const children = subtasksByParent.get(row.task.id) ?? [];
                const hasChildren = children.length > 0;
                if (row.hasDates || hasChildren) return null;

                return (
                  <div
                    key={`track-${row.task.id}`}
                    style={{
                      position: "absolute",
                      top: rowIndex * ROW_HEIGHT,
                      left: 0,
                      right: 0,
                      height: ROW_HEIGHT,
                      zIndex: 5,
                      cursor: "crosshair",
                    }}
                    title="Double-click to set a 1-day bar"
                    onDoubleClick={(e) => {
                      const el = timelineRef.current;
                      if (!el) return;
                      const trackLeft = el.getBoundingClientRect().left;
                      const scrollLeft = el.scrollLeft;
                      const dayIndex = Math.floor(
                        (e.clientX - trackLeft + scrollLeft) / effectiveDayWidth
                      );
                      const clickedDay = toMidnight(addDays(windowStart, dayIndex));
                      updateTask.mutate({
                        id: row.task.id,
                        startDate: clickedDay,
                        dueDate: clickedDay,
                      });
                    }}
                  />
                );
              })}

              {/* Task bars — same visibleRows list as left panel for alignment */}
              {visibleRows.map((row, i) => {
                const rowIndex = 1 + i; // offset by 1 for the project header row
                if (!row.hasDates || !row.effectiveStart || !row.effectiveEnd) {
                  return null; // no bar for undated tasks
                }
                return (
                  <GanttBar
                    key={`bar-${row.task.id}-${row.isSubtask ? "sub" : "root"}`}
                    task={row.task}
                    effectiveStart={row.effectiveStart}
                    effectiveEnd={row.effectiveEnd}
                    windowStart={windowStart}
                    dayWidth={effectiveDayWidth}
                    rowIndex={rowIndex}
                    dragState={dragState}
                    onDragStart={handleDragStart}
                    onBarClick={() => {
                      if (!dragMovedRef.current) {
                        onOpenTask?.(row.task.id);
                      }
                      dragMovedRef.current = false;
                    }}
                    isSubtask={row.isSubtask}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
