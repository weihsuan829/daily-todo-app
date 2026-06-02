import { useMemo, useRef, useState } from "react";
import {
  addDays,
  differenceInDays,
  format,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { trpc } from "@/lib/trpc";
import { STATUS_META } from "@/lib/statusMeta";
import type { ProjectViewProps } from "./types";
import type { Task } from "../../../../drizzle/schema";

// ─── Layout constants ──────────────────────────────────────────────────────
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 52;
const DAY_WIDTH = 28; // px per day

// ─── Helpers ───────────────────────────────────────────────────────────────
function toMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtInputDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Parse a yyyy-MM-dd string to a local midnight Date */
function parseInputDate(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}

// ─── Color helper ──────────────────────────────────────────────────────────
function barStyle(task: Task): { background: string; borderColor: string } {
  const status = (task.status ?? "todo") as keyof typeof STATUS_META;
  const color = STATUS_META[status]?.color ?? "#94a3b8";
  // Convert hex to rgba for muted background
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return {
    background: `rgba(${r},${g},${b},0.18)`,
    borderColor: color,
  };
}

// ─── Inline date editor ────────────────────────────────────────────────────
interface DateEditorProps {
  task: Task;
  onClose: () => void;
  onSave: (startDate: Date | null, dueDate: Date | null) => void;
}

function InlineDateEditor({ task, onClose, onSave }: DateEditorProps) {
  const [start, setStart] = useState(
    task.startDate ? fmtInputDate(toMidnight(task.startDate)) : ""
  );
  const [due, setDue] = useState(
    task.dueDate ? fmtInputDate(toMidnight(task.dueDate)) : ""
  );

  function handleSave() {
    const s = start ? parseInputDate(start) : null;
    const d = due ? parseInputDate(due) : null;
    onSave(s, d);
  }

  return (
    <div
      className="absolute z-50 bg-card border border-border rounded-lg shadow-lg p-3 flex flex-col gap-2 min-w-[220px]"
      style={{ top: "calc(100% + 4px)", left: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-xs font-medium text-foreground truncate max-w-[200px]">
        {task.title}
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted-foreground">Start date</span>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground"
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted-foreground">Due date</span>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground"
        />
      </label>
      <div className="flex gap-1.5 justify-end mt-1">
        <button
          onClick={onClose}
          className="text-[11px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Single Gantt bar ──────────────────────────────────────────────────────
interface BarProps {
  task: Task;
  windowStart: Date;
  rowIndex: number;
  onDateChange: (id: number, startDate: Date | null, dueDate: Date | null) => void;
}

function GanttBar({ task, windowStart, rowIndex, onDateChange }: BarProps) {
  const [editing, setEditing] = useState(false);

  const start = task.startDate ? toMidnight(task.startDate) : null;
  const end = task.dueDate ? toMidnight(task.dueDate) : null;

  // Both dates → full bar; one date → single-day bar; neither → no bar (handled in parent)
  const barStart = start ?? end;
  const barEnd = end ?? start;

  if (!barStart || !barEnd) return null;

  const effectiveStart = barStart <= barEnd ? barStart : barEnd;
  const effectiveEnd = barStart <= barEnd ? barEnd : barStart;

  const startOffset = differenceInDays(effectiveStart, windowStart);
  const span = Math.max(1, differenceInDays(effectiveEnd, effectiveStart) + 1);

  const left = startOffset * DAY_WIDTH;
  const width = span * DAY_WIDTH - 4;
  const top = rowIndex * ROW_HEIGHT + 6;
  const { background, borderColor } = barStyle(task);
  const isDone = task.status === "done";

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height: ROW_HEIGHT - 12,
        background,
        borderColor,
      }}
      className={`rounded-md border px-2 flex items-center text-xs cursor-pointer hover:ring-2 hover:ring-accent z-10 select-none relative ${isDone ? "opacity-60" : ""}`}
      title={`${task.title} (${fmtInputDate(effectiveStart)} → ${fmtInputDate(effectiveEnd)})`}
      onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }}
    >
      <span className={`truncate font-medium text-foreground flex-1 min-w-0 ${isDone ? "line-through" : ""}`}>
        {task.title}
      </span>

      {editing && (
        <InlineDateEditor
          task={task}
          onClose={() => setEditing(false)}
          onSave={(s, d) => {
            onDateChange(task.id, s, d);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function ProjectGanttView({ projectId, tasks, onOpenTask }: ProjectViewProps) {
  const utils = trpc.useUtils();
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  const timelineRef = useRef<HTMLDivElement>(null);

  // ── Date range ─────────────────────────────────────────────────────────
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { windowStart, windowDays } = useMemo(() => {
    const datedTasks = tasks.filter((t) => t.startDate ?? t.dueDate);
    if (datedTasks.length === 0) {
      const ws = startOfMonth(today);
      const we = endOfMonth(addDays(today, 60));
      return {
        windowStart: ws,
        windowDays: Math.max(90, differenceInDays(we, ws) + 1),
      };
    }
    const allDates: Date[] = [];
    for (const t of datedTasks) {
      if (t.startDate) allDates.push(toMidnight(t.startDate));
      if (t.dueDate) allDates.push(toMidnight(t.dueDate));
    }
    const minDate = allDates.reduce((a, b) => (a < b ? a : b));
    const maxDate = allDates.reduce((a, b) => (a > b ? a : b));
    const ws = addDays(minDate < today ? minDate : today, -7);
    const we = addDays(maxDate > today ? maxDate : today, 30);
    return {
      windowStart: ws,
      windowDays: Math.max(90, differenceInDays(we, ws) + 1),
    };
  }, [tasks, today]);

  // ── Header cells (day-level) ──────────────────────────────────────────
  const headerDays = useMemo(() => {
    return Array.from({ length: windowDays }, (_, i) => {
      const d = addDays(windowStart, i);
      return {
        date: d,
        isToday: format(d, "yyyy-MM-dd") === format(today, "yyyy-MM-dd"),
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
        dayNum: d.getDate(),
        weekday: format(d, "EEE"),
        isMonthStart: d.getDate() === 1,
      };
    });
  }, [windowStart, windowDays, today]);

  const todayOffset = differenceInDays(today, windowStart);

  // ── Scroll to today ───────────────────────────────────────────────────
  function scrollToToday() {
    if (!timelineRef.current) return;
    const target = todayOffset * DAY_WIDTH - timelineRef.current.clientWidth / 2;
    timelineRef.current.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }

  // ── Date change handler ───────────────────────────────────────────────
  function handleDateChange(id: number, startDate: Date | null, dueDate: Date | null) {
    updateTask.mutate({ id, startDate: startDate ?? undefined, dueDate: dueDate ?? undefined });
  }

  const datedCount = tasks.filter((t) => t.startDate ?? t.dueDate).length;
  const undatedCount = tasks.length - datedCount;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between shrink-0">
        <button
          onClick={scrollToToday}
          className="text-xs px-2 py-1 border border-border rounded hover:bg-muted text-foreground"
        >
          Today
        </button>
        <div className="text-xs text-muted-foreground">
          {datedCount} with dates · {undatedCount} no dates
        </div>
      </div>

      {/* Timeline */}
      <div ref={timelineRef} className="flex-1 overflow-auto relative">
        <div
          style={{ width: windowDays * DAY_WIDTH, minWidth: "100%" }}
          className="relative"
        >
          {/* ── Header row ─────────────────────────────────────────────── */}
          <div
            className="sticky top-0 z-30 bg-card border-b border-border flex"
            style={{ height: HEADER_HEIGHT }}
          >
            {headerDays.map((d, i) => (
              <div
                key={i}
                style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                className={[
                  "relative flex flex-col items-center justify-center border-r border-border shrink-0",
                  d.isWeekend ? "bg-muted/40" : "",
                  d.isMonthStart && i > 0 ? "border-l-2 border-l-border" : "",
                ].join(" ")}
              >
                {d.isMonthStart && (
                  <span className="absolute top-1 left-1 text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                    {format(d.date, "MMM")}
                  </span>
                )}
                <span className={`text-[9px] uppercase tracking-wider ${d.isWeekend ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                  {d.weekday.slice(0, 2)}
                </span>
                {d.isToday ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold mt-0.5">
                    {d.dayNum}
                  </span>
                ) : (
                  <span className={`text-xs font-medium mt-0.5 ${d.isWeekend ? "text-muted-foreground/70" : "text-foreground"}`}>
                    {d.dayNum}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* ── Body ───────────────────────────────────────────────────── */}
          <div
            className="relative"
            style={{ height: tasks.length * ROW_HEIGHT }}
          >
            {/* Background grid */}
            <div className="absolute inset-0 flex pointer-events-none">
              {headerDays.map((d, i) => (
                <div
                  key={i}
                  style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                  className={[
                    "border-r border-border shrink-0",
                    d.isWeekend ? "bg-muted/20" : "",
                    d.isMonthStart && i > 0 ? "border-l border-l-border/60" : "",
                  ].join(" ")}
                />
              ))}
            </div>

            {/* Today vertical line */}
            {todayOffset >= 0 && todayOffset < windowDays && (
              <div
                className="absolute top-0 bottom-0 w-px bg-primary/70 z-10 pointer-events-none"
                style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
              />
            )}

            {/* Task rows */}
            {tasks.map((task, rowIndex) => {
              const hasDate = task.startDate ?? task.dueDate;
              if (!hasDate) {
                // No dates — show muted label at today's column
                return (
                  <div
                    key={task.id}
                    style={{
                      position: "absolute",
                      top: rowIndex * ROW_HEIGHT,
                      left: 0,
                      right: 0,
                      height: ROW_HEIGHT,
                    }}
                    className="flex items-center px-2 border-b border-border/30 cursor-pointer hover:bg-accent/30"
                    onClick={() => onOpenTask?.(task.id)}
                  >
                    {/* Left label */}
                    <span className="text-xs text-muted-foreground/60 truncate max-w-[160px]">
                      {task.title}
                    </span>
                    <span className="ml-2 text-[10px] text-muted-foreground/40 italic">
                      no dates
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={task.id}
                  style={{
                    position: "absolute",
                    top: rowIndex * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                  }}
                  className="border-b border-border/20 cursor-pointer hover:bg-accent/10"
                  onClick={() => onOpenTask?.(task.id)}
                >
                  <GanttBar
                    task={task}
                    windowStart={windowStart}
                    rowIndex={0}
                    onDateChange={handleDateChange}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
