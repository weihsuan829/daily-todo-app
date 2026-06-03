import { useMemo, useState, useRef, useCallback, type ReactNode } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PriorityFlag } from "./PriorityPicker";
import { getEffectiveDates } from "@/lib/taskHierarchy";
import type { ProjectViewProps } from "./types";
import type { Task } from "../../../../drizzle/schema";

// ─── constants ────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MAX_VISIBLE_LANES = 3;
const LANE_HEIGHT = 24; // px
const LANE_GAP = 4; // px
const BARS_TOP = 28; // px — gap below the date number before the first bar

// ─── helpers ──────────────────────────────────────────────────────────────────

function addDaysToDate(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + days);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function floorDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/** Build 6-week grid (42 days) starting from Sunday before month start */
function buildMonthGrid(cursor: Date): Date[] {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map(floorDay);
  while (days.length < 42) {
    const last = days[days.length - 1];
    days.push(addDaysToDate(last, 1));
  }
  return days.slice(0, 42);
}

// ─── SpanTask ─────────────────────────────────────────────────────────────────

interface SpanTask {
  task: Task;
  start: Date;
  end: Date;
}

function toSpanTasks(tasks: Task[]): SpanTask[] {
  // Only root tasks
  const rootTasks = tasks.filter((t) => t.parentTaskId == null);
  // Build subtasks map
  const subtasksByParent = new Map<number, Task[]>();
  for (const t of tasks) {
    if (t.parentTaskId != null) {
      const arr = subtasksByParent.get(t.parentTaskId) ?? [];
      arr.push(t);
      subtasksByParent.set(t.parentTaskId, arr);
    }
  }

  const result: SpanTask[] = [];
  for (const t of rootTasks) {
    const subtasks = subtasksByParent.get(t.id) ?? [];
    const { startDate, dueDate } = getEffectiveDates(t, subtasks);
    if (!startDate && !dueDate) continue;

    let start: Date;
    let end: Date;
    if (startDate && dueDate) {
      start = floorDay(startDate);
      end = floorDay(dueDate);
      if (end < start) { const tmp = start; start = end; end = tmp; }
    } else if (startDate) {
      start = floorDay(startDate);
      end = start;
    } else {
      start = floorDay(dueDate!);
      end = start;
    }
    result.push({ task: t, start, end });
  }
  return result;
}

// ─── Lane assignment ──────────────────────────────────────────────────────────

interface LaneEntry {
  span: SpanTask;
  lane: number;
}

function assignLanesForWeek(
  weekStart: Date,
  weekEnd: Date,
  spans: SpanTask[]
): LaneEntry[] {
  const intersecting = spans.filter((s) => s.end >= weekStart && s.start <= weekEnd);
  intersecting.sort((a, b) => {
    const aStart = maxDate(a.start, weekStart).getTime();
    const bStart = maxDate(b.start, weekStart).getTime();
    if (aStart !== bStart) return aStart - bStart;
    return a.task.id - b.task.id;
  });

  const laneEnds: Date[] = [];
  const result: LaneEntry[] = [];
  for (const s of intersecting) {
    const segStart = maxDate(s.start, weekStart);
    let lane = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] < segStart) { lane = i; break; }
    }
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.end);
    } else {
      laneEnds[lane] = s.end;
    }
    result.push({ span: s, lane });
  }
  return result;
}

// ─── Priority → color ─────────────────────────────────────────────────────────

function priorityColor(priority: Task["priority"]): string {
  switch (priority) {
    case "urgent": return "#ef4444";
    case "high":   return "#f59e0b";
    case "medium": return "#3b82f6";
    case "low":    return "#94a3b8";
    default:       return "#3b82f6";
  }
}

// ─── Drag state ───────────────────────────────────────────────────────────────

type DragKind = "move" | "resize-left" | "resize-right";

interface DragState {
  taskId: number;
  kind: DragKind;
  startX: number;
  cellWidth: number;
  originalStart: Date;
  originalEnd: Date;
  currentDelta: number;
}

// ─── TaskBar ──────────────────────────────────────────────────────────────────

function TaskBar({
  span,
  lane,
  weekStart,
  weekEnd,
  onDragStart,
  dragDelta,
  dragKind,
  isDragging,
  onBarClick,
}: {
  span: SpanTask;
  lane: number;
  weekStart: Date;
  weekEnd: Date;
  onDragStart: (kind: DragKind, e: React.PointerEvent) => void;
  dragDelta: number;
  dragKind: DragKind | null;
  isDragging: boolean;
  onBarClick?: () => void;
}) {
  // Apply optimistic delta
  let effectiveStart = span.start;
  let effectiveEnd = span.end;
  if (isDragging && dragKind) {
    if (dragKind === "move") {
      effectiveStart = addDaysToDate(span.start, dragDelta);
      effectiveEnd = addDaysToDate(span.end, dragDelta);
    } else if (dragKind === "resize-left") {
      effectiveStart = addDaysToDate(span.start, dragDelta);
      if (effectiveStart > effectiveEnd) effectiveStart = effectiveEnd;
    } else if (dragKind === "resize-right") {
      effectiveEnd = addDaysToDate(span.end, dragDelta);
      if (effectiveEnd < effectiveStart) effectiveEnd = effectiveStart;
    }
  }

  const segStart = maxDate(effectiveStart, weekStart);
  const segEnd = minDate(effectiveEnd, weekEnd);
  if (segStart > weekEnd || segEnd < weekStart) return null;

  const offsetDays = diffDays(weekStart, segStart);
  const spanDays = diffDays(segStart, segEnd) + 1;
  const continuesLeft = effectiveStart < weekStart;
  const continuesRight = effectiveEnd > weekEnd;

  const color = span.task.color || priorityColor(span.task.priority);
  const bg = color + "2e"; // ~18% opacity hex
  const isDone = span.task.status === "done";

  const left = `calc(${(offsetDays / 7) * 100}% + 3px)`;
  const width = `calc(${(spanDays / 7) * 100}% - 7px)`;
  const top = lane * (LANE_HEIGHT + LANE_GAP);

  const radiusClass = (() => {
    if (continuesLeft && continuesRight) return "";
    if (continuesLeft) return "rounded-r-md";
    if (continuesRight) return "rounded-l-md";
    return "rounded-md";
  })();

  return (
    <div
      style={{
        position: "absolute",
        left,
        width,
        top,
        height: LANE_HEIGHT,
        zIndex: isDragging ? 30 : 10,
        pointerEvents: "auto",
      }}
    >
      {/* Main bar body */}
      <div
        className={`relative h-full flex items-center gap-1 px-1.5 text-[11px] border select-none ${radiusClass} ${
          isDone ? "opacity-60" : ""
        }`}
        style={{
          backgroundColor: bg,
          borderColor: color,
          color: "var(--foreground)",
          cursor: "grab",
        }}
        title={`${span.task.title} (${format(span.start, "MM/dd")} → ${format(span.end, "MM/dd")})`}
        onPointerDown={(e) => {
          // Only handle on bar body, not edges
          const target = e.target as HTMLElement;
          if (target.dataset.edge) return;
          e.stopPropagation();
          onDragStart("move", e);
        }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.dataset.edge) return;
          if (isDragging) return;
          onBarClick?.();
        }}
      >
        {/* Left resize handle */}
        {!continuesLeft && (
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
              e.stopPropagation();
              onDragStart("resize-left", e);
            }}
            title="Drag to change start date"
          />
        )}

        {!continuesLeft && (
          <PriorityFlag value={span.task.priority} size={10} className="flex-shrink-0" />
        )}
        <span className="truncate flex-1 min-w-0">
          {span.task.title}
        </span>

        {/* Right resize handle */}
        {!continuesRight && (
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
              e.stopPropagation();
              onDragStart("resize-right", e);
            }}
            title="Drag to change due date"
          />
        )}
      </div>
    </div>
  );
}

// ─── DayCell ──────────────────────────────────────────────────────────────────

function DayCell({
  date,
  isCurrentMonth,
  isToday,
  onDoubleClick,
  children,
}: {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  onDoubleClick: (date: Date) => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative border-r border-b border-border px-1.5 pt-1 pb-1 ${
        isToday
          ? "bg-blue-50"
          : isCurrentMonth
          ? "bg-card"
          : "bg-background"
      }`}
      onDoubleClick={(e) => {
        // Only trigger if double-clicking on empty area (not a bar)
        const target = e.target as HTMLElement;
        if (target.closest("[data-task-bar]")) return;
        onDoubleClick(date);
      }}
    >
      <div
        className={`text-xs px-0.5 ${
          isToday
            ? "text-blue-600 font-semibold"
            : isCurrentMonth
            ? "text-foreground"
            : "text-muted-foreground/40"
        }`}
      >
        {format(date, "d")}
      </div>
      {children}
    </div>
  );
}

// ─── ProjectCalendarView ──────────────────────────────────────────────────────

export default function ProjectCalendarView({ projectId, tasks, onOpenTask }: ProjectViewProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [cursor, setCursor] = useState(() => startOfMonth(today));
  const [dragState, setDragState] = useState<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragMovedRef = useRef(false);

  const utils = trpc.useUtils();
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });
  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  // Build grid
  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const spans = useMemo(() => toSpanTasks(tasks), [tasks]);

  // 6 week rows, each with lane assignments
  const weekRows = useMemo(() => {
    const rows: {
      weekStart: Date;
      weekEnd: Date;
      days: Date[];
      lanes: LaneEntry[];
    }[] = [];
    for (let w = 0; w < 6; w++) {
      const days = grid.slice(w * 7, w * 7 + 7);
      const weekStart = days[0];
      const weekEnd = days[6];
      const lanes = assignLanesForWeek(weekStart, weekEnd, spans);
      rows.push({ weekStart, weekEnd, days, lanes });
    }
    return rows;
  }, [grid, spans]);

  const noDueTasks = useMemo(
    () => tasks.filter((t) => t.parentTaskId == null && !t.dueDate && !t.startDate),
    [tasks]
  );

  // Navigation
  const prevMonth = () => setCursor((c) => startOfMonth(subMonths(c, 1)));
  const nextMonth = () => setCursor((c) => startOfMonth(addMonths(c, 1)));
  const goToday = () => setCursor(startOfMonth(today));

  // Double-click create
  const handleDoubleClick = (date: Date) => {
    const title = window.prompt(`在 ${format(date, "MM/dd")} 新增任務:`);
    if (!title || !title.trim()) return;
    createTask.mutate({
      title: title.trim(),
      startDate: date,
      dueDate: date,
      projectId,
      category: null,
      status: "todo",
    });
  };

  // Drag handling with pointer events
  const handleDragStart = useCallback(
    (span: SpanTask, kind: DragKind, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const gridEl = gridRef.current;
      if (!gridEl) return;
      const cellWidth = gridEl.clientWidth / 7;

      dragMovedRef.current = false;
      setDragState({
        taskId: span.task.id,
        kind,
        startX: e.clientX,
        cellWidth,
        originalStart: span.start,
        originalEnd: span.end,
        currentDelta: 0,
      });

      const handlePointerMove = (ev: PointerEvent) => {
        setDragState((prev) => {
          if (!prev) return null;
          const delta = Math.round((ev.clientX - prev.startX) / prev.cellWidth);
          if (delta !== 0) dragMovedRef.current = true;
          return { ...prev, currentDelta: delta };
        });
      };

      const handlePointerUp = (ev: PointerEvent) => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);

        setDragState((prev) => {
          if (!prev || prev.currentDelta === 0) return null;

          const { taskId, kind: dragKind, originalStart, originalEnd, currentDelta } = prev;

          if (dragKind === "move") {
            const newStart = addDaysToDate(originalStart, currentDelta);
            const newEnd = addDaysToDate(originalEnd, currentDelta);
            updateTask.mutate({ id: taskId, startDate: newStart, dueDate: newEnd });
          } else if (dragKind === "resize-left") {
            let newStart = addDaysToDate(originalStart, currentDelta);
            if (newStart > originalEnd) newStart = originalEnd;
            updateTask.mutate({ id: taskId, startDate: newStart, dueDate: originalEnd });
          } else if (dragKind === "resize-right") {
            let newEnd = addDaysToDate(originalEnd, currentDelta);
            if (newEnd < originalStart) newEnd = originalStart;
            updateTask.mutate({ id: taskId, startDate: originalStart, dueDate: newEnd });
          }

          return null;
        });
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [updateTask]
  );

  const monthLabel = format(cursor, "MMMM yyyy");

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border bg-card flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1">
          <h2 className="text-base font-semibold text-foreground min-w-[160px]">
            {monthLabel}
          </h2>
          <button
            onClick={goToday}
            className="ml-1 text-xs px-2 py-1 border border-border rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
          >
            Today
          </button>
          <button
            onClick={prevMonth}
            className="p-1.5 text-muted-foreground hover:bg-accent rounded transition"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 text-muted-foreground hover:bg-accent rounded transition"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          雙擊空白日期新增 ・ 拖橫條移動 ・ 拖左右邊調整起訖
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto flex flex-col">
        {/* Weekday labels */}
        <div className="grid grid-cols-7 border-l border-t border-border bg-card flex-shrink-0">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="text-[11px] uppercase tracking-wider text-muted-foreground text-center py-2 border-r border-b border-border"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Week rows */}
        <div className="flex-1 border-l border-border" ref={gridRef}>
          {weekRows.map((row, wi) => {
            const visibleLanes = row.lanes.filter((l) => l.lane < MAX_VISIBLE_LANES);
            const overflowLanes = row.lanes.filter((l) => l.lane >= MAX_VISIBLE_LANES);

            // Count overflow tasks per day (for "+N more" badges)
            const overflowByDate: Record<string, number> = {};
            for (const entry of overflowLanes) {
              for (const day of row.days) {
                const floored = floorDay(day);
                if (entry.span.start <= floored && entry.span.end >= floored) {
                  const key = format(day, "yyyy-MM-dd");
                  overflowByDate[key] = (overflowByDate[key] ?? 0) + 1;
                }
              }
            }

            const barAreaHeight =
              visibleLanes.length > 0
                ? (visibleLanes.reduce((acc, l) => Math.max(acc, l.lane + 1), 0)) * (LANE_HEIGHT + LANE_GAP)
                : 0;
            const hasOverflow = Object.keys(overflowByDate).length > 0;
            const moreRowHeight = hasOverflow ? LANE_HEIGHT : 0;
            const rowMinHeight = Math.max(120, BARS_TOP + barAreaHeight + moreRowHeight + 14);

            return (
              <div
                key={wi}
                className="relative"
                style={{ minHeight: rowMinHeight }}
              >
                {/* Day cells grid (provides background + date numbers + double-click) */}
                <div className="grid grid-cols-7 h-full">
                  {row.days.map((day) => {
                    const isCurrentMonth = isSameMonth(day, cursor);
                    const isToday = isSameDay(day, today);
                    const key = format(day, "yyyy-MM-dd");

                    return (
                      <DayCell
                        key={key}
                        date={day}
                        isCurrentMonth={isCurrentMonth}
                        isToday={isToday}
                        onDoubleClick={handleDoubleClick}
                      />
                    );
                  })}
                </div>

                {/* Bars overlay — absolutely positioned over the day grid */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ top: BARS_TOP }}
                >
                  {visibleLanes.map((entry) => {
                    const isThisDragging = dragState?.taskId === entry.span.task.id;
                    return (
                      <div key={entry.span.task.id} data-task-bar="true">
                        <TaskBar
                          span={entry.span}
                          lane={entry.lane}
                          weekStart={row.weekStart}
                          weekEnd={row.weekEnd}
                          onDragStart={(kind, e) => handleDragStart(entry.span, kind, e)}
                          dragDelta={isThisDragging ? (dragState?.currentDelta ?? 0) : 0}
                          dragKind={isThisDragging ? (dragState?.kind ?? null) : null}
                          isDragging={isThisDragging}
                          onBarClick={() => {
                            if (!dragMovedRef.current) {
                              onOpenTask?.(entry.span.task.id);
                            }
                            dragMovedRef.current = false;
                          }}
                        />
                      </div>
                    );
                  })}

                  {/* "+N more" overflow badges — placed just below the visible lanes */}
                  {row.days.map((day, di) => {
                    const key = format(day, "yyyy-MM-dd");
                    const ov = overflowByDate[key] ?? 0;
                    if (ov <= 0) return null;
                    return (
                      <div
                        key={`more-${key}`}
                        className="absolute text-[10px] text-muted-foreground px-1.5 truncate"
                        style={{
                          left: `${(di / 7) * 100}%`,
                          width: `${(1 / 7) * 100}%`,
                          top: barAreaHeight + 1,
                        }}
                      >
                        +{ov} more
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* No-date tasks tray */}
        {noDueTasks.length > 0 && (
          <div className="border-t border-border bg-card px-4 py-3 max-h-28 overflow-y-auto flex-shrink-0">
            <div className="text-xs text-muted-foreground mb-2">
              沒有日期的任務（設好 start/due 才會出現在日曆上）
            </div>
            <div className="flex flex-wrap gap-1">
              {noDueTasks.map((t) => {
                const color = t.color || priorityColor(t.priority);
                return (
                  <span
                    key={t.id}
                    className="text-xs px-2 py-0.5 rounded border border-border"
                    style={{ borderLeftColor: color, borderLeftWidth: 3 }}
                    title={t.title}
                  >
                    {t.title}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
