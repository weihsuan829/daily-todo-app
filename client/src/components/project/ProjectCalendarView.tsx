import { useMemo, useState } from "react";
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
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { STATUS_META } from "@/lib/statusMeta";
import type { ProjectViewProps } from "./types";
import type { Task } from "../../../../drizzle/schema";

// ─── constants ───────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const MAX_CHIPS_PER_CELL = 3;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Returns the Date to pin a task to — prefers dueDate, falls back to startDate. */
function pinDate(task: Task): Date | null {
  if (task.dueDate) return task.dueDate;
  if (task.startDate) return task.startDate;
  return null;
}

/** Build 6-week grid (42 days) starting from the Sunday before the first of the month. */
function buildMonthGrid(cursor: Date): Date[] {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  // Always return at least 42 days (6 weeks)
  while (days.length < 42) {
    const last = days[days.length - 1];
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    days.push(next);
  }
  return days.slice(0, 42);
}

// ─── TaskChip ────────────────────────────────────────────────────────────────

function TaskChip({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
  const statusMeta = STATUS_META[task.status as keyof typeof STATUS_META] ?? STATUS_META.todo;
  const isDone = task.status === "done";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={task.title}
      className={`w-full text-left text-[11px] px-1.5 py-0.5 rounded truncate transition-opacity ${
        isDone ? "opacity-60 line-through" : ""
      }`}
      style={{
        backgroundColor: statusMeta.color + "22",
        borderLeft: `3px solid ${statusMeta.color}`,
        color: "var(--foreground)",
      }}
    >
      {task.title}
    </button>
  );
}

// ─── DayCell ─────────────────────────────────────────────────────────────────

function DayCell({
  date,
  isCurrentMonth,
  isToday,
  tasks,
  onAddTask,
  onClickTask,
}: {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: Task[];
  onAddTask: (date: Date) => void;
  onClickTask: (task: Task) => void;
}) {
  const visible = tasks.slice(0, MAX_CHIPS_PER_CELL);
  const overflowCount = tasks.length - visible.length;

  return (
    <div
      className={`relative flex flex-col border-r border-b border-border min-h-[110px] px-1.5 pt-1 pb-1 group transition-colors ${
        isToday
          ? "bg-accent"
          : isCurrentMonth
          ? "bg-card"
          : "bg-background"
      }`}
    >
      {/* date number */}
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-xs font-medium px-0.5 ${
            isToday
              ? "text-primary font-semibold"
              : isCurrentMonth
              ? "text-foreground"
              : "text-muted-foreground/40"
          }`}
        >
          {format(date, "d")}
        </span>

        {/* + button (visible on hover) */}
        {isCurrentMonth && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddTask(date);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition"
            title={`Add task on ${format(date, "MMM d")}`}
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* task chips */}
      <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
        {visible.map((t) => (
          <TaskChip key={t.id} task={t} onClick={() => onClickTask(t)} />
        ))}
        {overflowCount > 0 && (
          <span className="text-[10px] text-muted-foreground px-1">
            +{overflowCount} more
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ProjectCalendarView ─────────────────────────────────────────────────────

export default function ProjectCalendarView({ projectId, tasks }: ProjectViewProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [cursor, setCursor] = useState(() => startOfMonth(today));

  const utils = trpc.useUtils();

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  // Build 42-day grid
  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);

  // Group tasks by their pin date (yyyy-MM-dd string key)
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const pin = pinDate(task);
      if (!pin) continue;
      const key = format(pin, "yyyy-MM-dd");
      const existing = map.get(key) ?? [];
      existing.push(task);
      map.set(key, existing);
    }
    return map;
  }, [tasks]);

  // Tasks with no date
  const noDueTasks = useMemo(
    () => tasks.filter((t) => !t.dueDate && !t.startDate),
    [tasks]
  );

  // Navigation
  const prevMonth = () => setCursor((c) => startOfMonth(subMonths(c, 1)));
  const nextMonth = () => setCursor((c) => startOfMonth(addMonths(c, 1)));
  const goToday = () => setCursor(startOfMonth(today));

  // Create a new task on a given date
  const handleAddTask = (date: Date) => {
    const title = window.prompt(`New task on ${format(date, "MMM d, yyyy")}:`);
    if (!title || !title.trim()) return;
    createTask.mutate({
      title: title.trim(),
      dueDate: date,
      projectId,
      category: null,
      status: "todo",
    });
  };

  // Click a task chip — toggle status between todo/in_progress/done
  const handleClickTask = (task: Task) => {
    const nextStatus =
      task.status === "todo"
        ? "in_progress"
        : task.status === "in_progress"
        ? "done"
        : "todo";
    updateTask.mutate({ id: task.id, status: nextStatus });
  };

  const monthLabel = format(cursor, "MMMM yyyy");

  // Split grid into 6 week rows
  const weeks = useMemo(() => {
    const rows: Date[][] = [];
    for (let i = 0; i < 6; i++) {
      rows.push(grid.slice(i * 7, i * 7 + 7));
    }
    return rows;
  }, [grid]);

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
          Hover a cell and click + to add a task · Click a task chip to cycle its status
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
        <div className="flex-1 border-l border-border">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayTasks = tasksByDate.get(key) ?? [];
                return (
                  <DayCell
                    key={key}
                    date={day}
                    isCurrentMonth={isSameMonth(day, cursor)}
                    isToday={isSameDay(day, today)}
                    tasks={dayTasks}
                    onAddTask={handleAddTask}
                    onClickTask={handleClickTask}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* No-date tasks tray */}
        {noDueTasks.length > 0 && (
          <div className="border-t border-border bg-card px-4 py-3 max-h-28 overflow-y-auto flex-shrink-0">
            <div className="text-xs text-muted-foreground mb-2">
              Tasks without a date (set a due or start date to place them on the calendar)
            </div>
            <div className="flex flex-wrap gap-1">
              {noDueTasks.map((t) => {
                const meta = STATUS_META[t.status as keyof typeof STATUS_META] ?? STATUS_META.todo;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleClickTask(t)}
                    className="text-xs px-2 py-0.5 rounded border border-border hover:bg-accent transition"
                    style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
