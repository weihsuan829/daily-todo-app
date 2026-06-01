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
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { STATUS_META, STATUS_ORDER, statusPillClass } from "@/lib/statusMeta";
import type { TaskStatus } from "@/lib/statusMeta";
import type { ProjectViewProps } from "./types";
import type { Task } from "../../../../drizzle/schema";

// ── Sortable card ──────────────────────────────────────────────────────────────

function SortableCard({
  task,
  onPriorityChange,
}: {
  task: Task;
  onPriorityChange: (id: number, priority: "low" | "medium" | "high") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { task, type: "task" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const PRIORITY_COLORS: Record<string, string> = {
    high: "text-destructive",
    medium: "text-yellow-600 dark:text-yellow-400",
    low: "text-muted-foreground",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-card border border-border rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing select-none"
    >
      <p className="text-sm font-medium text-foreground leading-snug mb-2">{task.title}</p>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Priority selector */}
        <select
          value={task.priority}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onPriorityChange(task.id, e.target.value as "low" | "medium" | "high");
          }}
          className={`text-[11px] bg-transparent border-none outline-none cursor-pointer ${PRIORITY_COLORS[task.priority]}`}
        >
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>

        {/* Due date chip */}
        {task.dueDate && (
          <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
            {format(new Date(task.dueDate), "MMM d")}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Column ─────────────────────────────────────────────────────────────────────

function Column({
  status,
  tasks,
  projectId,
  onPriorityChange,
}: {
  status: TaskStatus;
  tasks: Task[];
  projectId: number;
  onPriorityChange: (id: number, priority: "low" | "medium" | "high") => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${status}`,
    data: { type: "column", status },
  });
  const [newTitle, setNewTitle] = useState("");
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
      <div className="flex items-center gap-1.5 mb-3 px-1">
        <span className={pill.className} style={pill.style}>
          <StatusIcon className="w-3 h-3" />
          {meta.label}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      </div>

      {/* Cards */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 flex-1 overflow-y-auto min-h-[40px]">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} onPriorityChange={onPriorityChange} />
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
    </div>
  );
}

// ── Board ──────────────────────────────────────────────────────────────────────

export default function ProjectKanbanView({ projectId, tasks }: ProjectViewProps) {
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
    const colTasks = tasks
      .filter((t) => t.status === targetStatus)
      .sort((a, b) => a.order - b.order);

    const oldIdx = colTasks.findIndex((t) => t.id === active.id);
    const newIdx = colTasks.findIndex((t) => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;

    const reordered = arrayMove(colTasks, oldIdx, newIdx);
    reorder.mutate({ projectId, orderedIds: reordered.map((t) => t.id) });
  };

  const handlePriorityChange = (id: number, priority: "low" | "medium" | "high") => {
    update.mutate({ id, priority });
  };

  return (
    <div className="h-full overflow-x-auto px-6 py-4 bg-background">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="flex gap-3 h-full items-start">
          {STATUS_ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={tasks
                .filter((t) => t.status === status)
                .sort((a, b) => a.order - b.order)}
              projectId={projectId}
              onPriorityChange={handlePriorityChange}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
