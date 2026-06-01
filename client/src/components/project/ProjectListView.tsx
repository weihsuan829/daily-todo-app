import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
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
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { STATUS_META, STATUS_ORDER, statusPillClass, type TaskStatus } from "@/lib/statusMeta";
import type { ProjectViewProps } from "./types";
import type { Task } from "../../../../drizzle/schema";

// ─── helpers ────────────────────────────────────────────────────────────────

function toDateInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return format(d, "yyyy-MM-dd");
  } catch {
    return "";
  }
}

function fromDateInputValue(s: string): Date | undefined {
  if (!s) return undefined;
  // Parse as local date (input[type=date] gives "yyyy-MM-dd")
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// ─── SortableTaskRow ─────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  onToggleStatus: () => void;
  onUpdate: (changes: { title?: string; priority?: "low" | "medium" | "high"; dueDate?: Date | null; startDate?: Date | null }) => void;
  dragDisabled?: boolean;
}

function SortableTaskRow({ task, onToggleStatus, onUpdate, dragDisabled }: TaskRowProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const commitTitle = (value: string) => {
    const next = value.trim().slice(0, 255);
    setIsEditingTitle(false);
    if (!next || next === task.title) return;
    onUpdate({ title: next });
  };

  const isDone = task.status === "done";

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="group border-t border-border hover:bg-accent/40"
    >
      {/* drag handle */}
      <td className="w-8 px-1" onClick={(e) => e.stopPropagation()}>
        {dragDisabled ? (
          <div className="w-6" />
        ) : (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-1 opacity-0 group-hover:opacity-100"
            title="Drag to reorder or move to another status"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
      </td>

      {/* completion circle */}
      <td className="px-3 py-2 w-9" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggleStatus}
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full border transition-colors ${
            isDone
              ? "border-emerald-500 text-emerald-500"
              : "border-border text-muted-foreground hover:border-primary hover:text-primary"
          }`}
          title="Toggle complete"
        >
          {isDone ? <Check className="w-3 h-3" /> : null}
        </button>
      </td>

      {/* title */}
      <td className="px-3 py-2 text-foreground min-w-0">
        {isEditingTitle ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.currentTarget.value)}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle(editTitle);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setIsEditingTitle(false);
                setEditTitle(task.title);
              }
            }}
            onBlur={() => commitTitle(editTitle)}
            className="border border-ring rounded px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-ring min-w-[160px] bg-background text-foreground"
          />
        ) : (
          <span
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditTitle(task.title);
              setIsEditingTitle(true);
            }}
            className={`cursor-text select-none text-sm ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}
            title="Double-click to rename"
          >
            {task.title}
          </span>
        )}
      </td>

      {/* priority */}
      <td className="px-3 py-2 w-28" onClick={(e) => e.stopPropagation()}>
        <select
          value={task.priority ?? "medium"}
          onChange={(e) => onUpdate({ priority: e.target.value as "low" | "medium" | "high" })}
          className="text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground focus:ring-1 focus:ring-ring outline-none"
        >
          {(["low", "medium", "high"] as const).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </td>

      {/* due date */}
      <td className="px-3 py-2 w-36 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          value={toDateInputValue(task.dueDate)}
          onChange={(e) => onUpdate({ dueDate: e.target.value ? fromDateInputValue(e.target.value) : null })}
          className="text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground focus:ring-1 focus:ring-ring outline-none w-full"
          title="Due date"
        />
      </td>
    </tr>
  );
}

// ─── StatusSection ────────────────────────────────────────────────────────────

function StatusSection({
  status: sectionStatus,
  tasks,
  collapsed,
  onToggleCollapse,
  onToggleStatus,
  onUpdate,
  onCreate,
}: {
  status: TaskStatus;
  tasks: Task[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleStatus: (id: number) => void;
  onUpdate: (id: number, changes: { title?: string; priority?: "low" | "medium" | "high"; dueDate?: Date | null; startDate?: Date | null }) => void;
  onCreate: (title: string) => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const meta = STATUS_META[sectionStatus];
  const StatusIcon = meta.icon;
  const pill = statusPillClass(sectionStatus);

  const { setNodeRef, isOver } = useDroppable({ id: `section-${sectionStatus}` });

  const sortableIds = useMemo(
    () => tasks.map((t) => t.id),
    [tasks]
  );

  return (
    <div>
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-1 py-1 text-left"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className={pill.className} style={pill.style}>
          <StatusIcon className="w-3 h-3" />
          {meta.label}
        </span>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </button>

      {!collapsed && (
        <div
          ref={setNodeRef}
          className={`bg-card border rounded-lg overflow-hidden mt-1 transition ${
            isOver ? "border-primary bg-accent/30" : "border-border"
          }`}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {tasks.length === 0 ? (
              <div className="px-4 py-3 text-xs text-muted-foreground">
                {isOver ? "Drop here to change status" : "No tasks"}
              </div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {tasks.map((t) => (
                    <SortableTaskRow
                      key={t.id}
                      task={t}
                      onToggleStatus={() => onToggleStatus(t.id)}
                      onUpdate={(changes) => onUpdate(t.id, changes)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </SortableContext>

          {/* inline add task */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTitle.trim()) return;
              onCreate(newTitle.trim());
              setNewTitle("");
            }}
            className="border-t border-border px-3 py-1.5 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add task…"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
            />
          </form>
        </div>
      )}
    </div>
  );
}

// ─── ProjectListView ─────────────────────────────────────────────────────────

export default function ProjectListView({ projectId, tasks: initialTasks }: ProjectViewProps) {
  const utils = trpc.useUtils();

  const update = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  const create = trpc.tasks.create.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  const setStatus = trpc.tasks.setStatus.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  const reorder = trpc.tasks.reorder.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  // local optimistic tasks state (seed from props, update locally on reorder)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);

  const tasks: Task[] = useMemo(() => {
    if (!localOrder) return initialTasks;
    const byId = new Map(initialTasks.map((t) => [t.id, t]));
    const ordered: Task[] = [];
    for (const id of localOrder) {
      const t = byId.get(id);
      if (t) ordered.push(t);
    }
    // include any tasks not in localOrder (newly added)
    for (const t of initialTasks) {
      if (!localOrder.includes(t.id)) ordered.push(t);
    }
    return ordered;
  }, [initialTasks, localOrder]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) {
      const s = t.status as TaskStatus;
      if (s in map) map[s].push(t);
      else map.todo.push(t);
    }
    return map;
  }, [tasks]);

  const [collapsedSections, setCollapsedSections] = useState<Set<TaskStatus>>(new Set());

  const toggleSection = (s: TaskStatus) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = Number(active.id);
    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    let targetStatus: TaskStatus | null = null;

    if (typeof over.id === "string" && over.id.startsWith("section-")) {
      targetStatus = over.id.slice("section-".length) as TaskStatus;
    } else {
      const overTask = tasks.find((t) => t.id === Number(over.id));
      if (overTask) targetStatus = overTask.status as TaskStatus;
    }

    if (!targetStatus) return;

    if (activeTask.status !== targetStatus) {
      // cross-section drop: change status
      setStatus.mutate({ id: activeId, status: targetStatus });
      return;
    }

    // same-section reorder
    const list = tasksByStatus[targetStatus];
    const oldIdx = list.findIndex((t) => t.id === activeId);
    const newIdx = list.findIndex((t) => t.id === Number(over.id));
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = arrayMove(list, oldIdx, newIdx);
    // optimistic: rebuild full order as [otherStatuses..., reorderedSection...]
    const otherIds = tasks.filter((t) => t.status !== targetStatus).map((t) => t.id);
    setLocalOrder([...otherIds, ...reordered.map((t) => t.id)]);
    reorder.mutate(
      { projectId, orderedIds: reordered.map((t) => t.id) },
      { onSuccess: () => setLocalOrder(null) }
    );
  };

  const handleToggleStatus = (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const newStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    setStatus.mutate({ id, status: newStatus });
  };

  const handleUpdate = (
    id: number,
    changes: {
      title?: string;
      priority?: "low" | "medium" | "high";
      dueDate?: Date | null;
      startDate?: Date | null;
    }
  ) => {
    update.mutate({
      id,
      ...(changes.title !== undefined ? { title: changes.title } : {}),
      ...(changes.priority !== undefined ? { priority: changes.priority } : {}),
      // dueDate: router accepts Date | undefined only (not null)
      ...(changes.dueDate !== undefined ? { dueDate: changes.dueDate ?? undefined } : {}),
      // startDate: router accepts Date | null | undefined
      ...(changes.startDate !== undefined ? { startDate: changes.startDate } : {}),
    });
  };

  const handleCreate = (title: string, sectionStatus: TaskStatus) => {
    create.mutate({
      title,
      status: sectionStatus,
      projectId,
      category: "work",
    });
  };

  return (
    <div className="flex-1 overflow-auto px-6 py-5 bg-background">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="space-y-3">
          {STATUS_ORDER.map((s) => (
            <StatusSection
              key={s}
              status={s}
              tasks={tasksByStatus[s]}
              collapsed={collapsedSections.has(s)}
              onToggleCollapse={() => toggleSection(s)}
              onToggleStatus={handleToggleStatus}
              onUpdate={handleUpdate}
              onCreate={(title) => handleCreate(title, s)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
