import { useState, type FormEvent } from "react";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, GitBranch, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { STATUS_META, STATUS_ORDER, statusPillClass } from "@/lib/statusMeta";
import type { TaskStatus } from "@/lib/statusMeta";
import type { ProjectViewProps } from "./types";
import type { Task } from "../../../../drizzle/schema";
import { getEffectiveDates } from "@/lib/taskHierarchy";
import { AssigneePicker } from "./AssigneePicker";
import { PriorityPicker } from "./PriorityPicker";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { DEFAULT_FILTER_STATE, visibleStatuses } from "@/lib/filterSort";

// ── Date chip helper ────────────────────────────────────────────────────────

function DateChip({ startDate, dueDate }: { startDate: Date | null; dueDate: Date | null }) {
  if (!startDate && !dueDate) return null;

  let label: string;
  if (startDate && dueDate) {
    const s = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
    const e = `${dueDate.getMonth() + 1}/${dueDate.getDate()}`;
    label = `${s} → ${e}`;
  } else if (dueDate) {
    label = `${dueDate.getMonth() + 1}/${dueDate.getDate()}`;
  } else {
    label = `${startDate!.getMonth() + 1}/${startDate!.getDate()} →`;
  }

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
      <CalendarIcon className="w-3 h-3 flex-shrink-0" />
      {label}
    </span>
  );
}

// ── Subtask hover popup list ────────────────────────────────────────────────

function SubtaskPopupRow({ sub }: { sub: Task }) {
  const eff = getEffectiveDates(sub, undefined);
  let dateLabel = "—";
  if (eff.startDate && eff.dueDate) {
    dateLabel = `${eff.startDate.getMonth() + 1}/${eff.startDate.getDate()} → ${eff.dueDate.getMonth() + 1}/${eff.dueDate.getDate()}`;
  } else if (eff.dueDate) {
    dateLabel = `${eff.dueDate.getMonth() + 1}/${eff.dueDate.getDate()}`;
  } else if (eff.startDate) {
    dateLabel = `${eff.startDate.getMonth() + 1}/${eff.startDate.getDate()} →`;
  }

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-foreground truncate flex-1">{sub.title}</span>
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{dateLabel}</span>
    </div>
  );
}

// ── Sortable card ──────────────────────────────────────────────────────────────

function SortableCard({
  task,
  subtasks,
  projectId,
  onPriorityChange,
}: {
  task: Task;
  subtasks: Task[];
  projectId: number;
  onPriorityChange: (id: number, priority: "low" | "medium" | "high" | "urgent" | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { task, type: "task" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const effDates = getEffectiveDates(task, subtasks);
  const hasSubtasks = subtasks.length > 0;

  const cardContent = (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-card border border-border rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing select-none"
    >
      {/* Title */}
      <p className="text-sm font-medium text-foreground leading-snug mb-2">{task.title}</p>

      {/* Bottom row: assignee · date chip · subtask badge · priority flag */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Assignee */}
        <span onPointerDown={(e) => e.stopPropagation()}>
          <AssigneePicker projectId={projectId} task={task} />
        </span>

        {/* Date chip (display only — aggregated if parent) */}
        <DateChip startDate={effDates.startDate} dueDate={effDates.dueDate} />

        {/* Subtask count badge */}
        {hasSubtasks && (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
            <GitBranch className="w-3 h-3 flex-shrink-0" />
            {subtasks.length}
          </span>
        )}

        {/* Priority flag — push to right */}
        <span className="ml-auto" onPointerDown={(e) => e.stopPropagation()}>
          <PriorityPicker
            value={task.priority as "low" | "medium" | "high" | "urgent" | null}
            onChange={(next) => onPriorityChange(task.id, next)}
          />
        </span>
      </div>
    </div>
  );

  // Only wrap in HoverCard if there are subtasks
  if (!hasSubtasks) return cardContent;

  return (
    <HoverCard openDelay={400} closeDelay={100}>
      <HoverCardTrigger asChild>{cardContent}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-72 p-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          Subtasks ({subtasks.length})
        </div>
        <div className="divide-y divide-border">
          {subtasks.map((sub) => (
            <SubtaskPopupRow key={sub.id} sub={sub} />
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// ── Column ─────────────────────────────────────────────────────────────────────

const ARCHIVED_COLLAPSED_KEY = "kanbanArchivedCollapsed";

function Column({
  status,
  tasks,
  subtasksByParent,
  projectId,
  onPriorityChange,
}: {
  status: TaskStatus;
  tasks: Task[];
  subtasksByParent: Map<number, Task[]>;
  projectId: number;
  onPriorityChange: (id: number, priority: "low" | "medium" | "high" | "urgent" | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${status}`,
    data: { type: "column", status },
  });
  const [newTitle, setNewTitle] = useState("");

  // Collapsible state — only used for "archived" column, defaults to collapsed
  const isArchived = status === "archived";
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (!isArchived) return false;
    const stored = localStorage.getItem(ARCHIVED_COLLAPSED_KEY);
    return stored === null ? true : stored === "true";
  });

  const toggleCollapsed = () => {
    if (!isArchived) return;
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(ARCHIVED_COLLAPSED_KEY, String(next));
  };

  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  const pill = statusPillClass(status);
  const utils = trpc.useUtils();

  const createMutation = trpc.tasks.create.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    createMutation.mutate({ title, status, projectId, category: null });
    setNewTitle("");
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 shrink-0 bg-muted rounded-lg p-3 transition-colors ${
        isOver ? "ring-2 ring-ring" : ""
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-1.5 mb-3 px-1 ${isArchived ? "cursor-pointer select-none" : ""}`}
        onClick={isArchived ? toggleCollapsed : undefined}
      >
        {isArchived && (
          collapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className={pill.className} style={pill.style}>
          <StatusIcon className="w-3 h-3" />
          {meta.label}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      </div>

      {/* Cards — hidden when collapsed */}
      {!collapsed && (
        <>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 flex-1 overflow-y-auto min-h-[40px]">
              {tasks.map((t) => (
                <SortableCard
                  key={t.id}
                  task={t}
                  subtasks={subtasksByParent.get(t.id) ?? []}
                  projectId={projectId}
                  onPriorityChange={onPriorityChange}
                />
              ))}
            </div>
          </SortableContext>

          {/* Inline add */}
          <form
            onSubmit={handleSubmit}
            className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-card border border-transparent hover:border-border transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add task…"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
            />
          </form>
        </>
      )}
    </div>
  );
}

// ── Board ──────────────────────────────────────────────────────────────────────

export default function ProjectKanbanView({ projectId, tasks, filterState }: ProjectViewProps) {
  const utils = trpc.useUtils();

  const setStatus = trpc.tasks.setStatus.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  const reorder = trpc.tasks.reorder.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  const update = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Build subtask map: parentId → subtask[]
  const subtasksByParent = new Map<number, Task[]>();
  for (const t of tasks) {
    if (t.parentTaskId != null) {
      const list = subtasksByParent.get(t.parentTaskId) ?? [];
      list.push(t);
      subtasksByParent.set(t.parentTaskId, list);
    }
  }

  // Only root tasks appear as cards
  const rootTasks = tasks.filter((t) => t.parentTaskId == null);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const draggedTask = active.data.current?.task as Task | undefined;
    if (!draggedTask) return;

    // Resolve target status from the over target
    const overData = over.data.current as
      | { type?: string; task?: Task; status?: TaskStatus }
      | undefined;

    let targetStatus: TaskStatus | null = null;
    if (overData?.type === "column" && overData.status) {
      targetStatus = overData.status;
    } else if (overData?.type === "task" && overData.task) {
      targetStatus = overData.task.status as TaskStatus;
    } else if (typeof over.id === "string" && over.id.startsWith("col-")) {
      targetStatus = over.id.replace("col-", "") as TaskStatus;
    }

    if (!targetStatus || !STATUS_ORDER.includes(targetStatus)) return;

    // Cross-column move → setStatus
    if (draggedTask.status !== targetStatus) {
      setStatus.mutate({ id: draggedTask.id, status: targetStatus });
      return;
    }

    // Same-column reorder
    if (overData?.type !== "task" || active.id === over.id) return;
    const colTasks = rootTasks
      .filter((t) => t.status === targetStatus)
      .sort((a, b) => a.order - b.order);

    const oldIdx = colTasks.findIndex((t) => t.id === active.id);
    const newIdx = colTasks.findIndex((t) => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;

    const reordered = arrayMove(colTasks, oldIdx, newIdx);
    reorder.mutate({ projectId, orderedIds: reordered.map((t) => t.id) });
  };

  const handlePriorityChange = (
    id: number,
    priority: "low" | "medium" | "high" | "urgent" | null,
  ) => {
    // tasks.update accepts undefined (not null) for clearing priority
    update.mutate({ id, priority: priority ?? undefined });
  };

  return (
    <div className="h-full overflow-x-auto px-6 py-4 bg-background">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="flex gap-3 h-full items-start">
          {visibleStatuses(filterState ?? DEFAULT_FILTER_STATE).map((status) => (
            <Column
              key={status}
              status={status}
              tasks={rootTasks
                .filter((t) => t.status === status)
                .sort((a, b) => a.order - b.order)}
              subtasksByParent={subtasksByParent}
              projectId={projectId}
              onPriorityChange={handlePriorityChange}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
