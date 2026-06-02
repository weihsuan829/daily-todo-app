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
import { getEffectiveDates } from "@/lib/taskHierarchy";
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
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// ─── InlineNewSubtaskRow ──────────────────────────────────────────────────────

function InlineNewSubtaskRow({
  onCommit,
  onCancel,
}: {
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  return (
    <tr
      className="border-t border-border bg-accent/20"
      onClick={(e) => e.stopPropagation()}
    >
      <td className="w-8" />
      <td className="w-9" />
      <td className="px-3 py-2 min-w-0">
        <div className="flex items-center gap-2 pl-6">
          <span className="text-muted-foreground text-xs">↳</span>
          <input
            autoFocus
            placeholder="Subtask title (Enter to add, Esc to cancel)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) onCommit(v);
                else onCancel();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
              }
            }}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v) onCommit(v);
              else onCancel();
            }}
            className="flex-1 border border-ring rounded px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
          />
        </div>
      </td>
      <td className="w-28" />
      <td className="w-36" />
    </tr>
  );
}

// ─── SortableTaskRow ──────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  onToggleStatus: () => void;
  onUpdate: (changes: {
    title?: string;
    priority?: "low" | "medium" | "high";
    dueDate?: Date | null;
    startDate?: Date | null;
  }) => void;
  dragDisabled?: boolean;
  // Subtask-specific
  isSubtask?: boolean;
  hasChildren?: boolean;
  childrenCollapsed?: boolean;
  onToggleChildren?: () => void;
  subtasks?: Task[];
  onAddSubtask?: (parentId: number) => void;
}

function SortableTaskRow({
  task,
  onToggleStatus,
  onUpdate,
  dragDisabled,
  isSubtask,
  hasChildren,
  childrenCollapsed,
  onToggleChildren,
  subtasks,
  onAddSubtask,
}: TaskRowProps) {
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

  // Compute effective dates (aggregated from subtasks if parent has children with dates)
  const effDates = getEffectiveDates(task, subtasks);
  const dateLocked = effDates.isAggregated;

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
        <div className={`flex items-center gap-1.5 ${isSubtask ? "pl-6" : ""}`}>
          {/* expand/collapse chevron for parent tasks with children */}
          {hasChildren && onToggleChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleChildren();
              }}
              className="-ml-1 p-0.5 text-muted-foreground hover:text-foreground flex-shrink-0"
              title={childrenCollapsed ? "Expand subtasks" : "Collapse subtasks"}
            >
              {childrenCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          {/* subtask indent indicator */}
          {isSubtask && (
            <span className="text-muted-foreground/50 text-xs flex-shrink-0">↳</span>
          )}
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
              className={`cursor-text select-none text-sm flex-1 ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}
              title="Double-click to rename"
            >
              {task.title}
            </span>
          )}
          {/* "+ subtask" hover button — root tasks only */}
          {!isSubtask && onAddSubtask && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddSubtask(task.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0"
              title="Add subtask"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
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
        {dateLocked ? (
          <span
            className="inline-flex items-center gap-1 text-muted-foreground px-1.5 py-1 text-xs"
            title="Date aggregated from subtasks — edit subtasks to change"
          >
            {effDates.dueDate ? (
              <span>{toDateInputValue(effDates.dueDate)}</span>
            ) : (
              <span>—</span>
            )}
          </span>
        ) : (
          <input
            type="date"
            value={toDateInputValue(task.dueDate)}
            onChange={(e) =>
              onUpdate({
                dueDate: e.target.value ? fromDateInputValue(e.target.value) : null,
              })
            }
            className="text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground focus:ring-1 focus:ring-ring outline-none w-full"
            title="Due date"
          />
        )}
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
  subtasksByParent,
  collapsedTasks,
  onToggleTask,
  addingSubtaskFor,
  onAddSubtaskRequest,
  onCreateSubtask,
  onCancelAddSubtask,
}: {
  status: TaskStatus;
  tasks: Task[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleStatus: (id: number) => void;
  onUpdate: (
    id: number,
    changes: {
      title?: string;
      priority?: "low" | "medium" | "high";
      dueDate?: Date | null;
      startDate?: Date | null;
    }
  ) => void;
  onCreate: (title: string) => void;
  subtasksByParent: Map<number, Task[]>;
  collapsedTasks: Set<number>;
  onToggleTask: (id: number) => void;
  addingSubtaskFor: number | null;
  onAddSubtaskRequest: (parentId: number) => void;
  onCreateSubtask: (parentId: number, title: string) => void;
  onCancelAddSubtask: () => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const meta = STATUS_META[sectionStatus];
  const StatusIcon = meta.icon;
  const pill = statusPillClass(sectionStatus);

  const { setNodeRef, isOver } = useDroppable({ id: `section-${sectionStatus}` });

  // Only root tasks participate in DnD sorting
  const sortableIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

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
                  {tasks.flatMap((t) => {
                    const subs = subtasksByParent.get(t.id) ?? [];
                    const hasChildren = subs.length > 0;
                    const isCollapsed = collapsedTasks.has(t.id);
                    const isAddingHere = addingSubtaskFor === t.id;

                    return [
                      <SortableTaskRow
                        key={t.id}
                        task={t}
                        onToggleStatus={() => onToggleStatus(t.id)}
                        onUpdate={(changes) => onUpdate(t.id, changes)}
                        hasChildren={hasChildren}
                        childrenCollapsed={isCollapsed}
                        onToggleChildren={
                          hasChildren ? () => onToggleTask(t.id) : undefined
                        }
                        subtasks={hasChildren ? subs : undefined}
                        onAddSubtask={onAddSubtaskRequest}
                      />,
                      // Expanded subtask rows
                      ...(!isCollapsed
                        ? subs.map((sub) => (
                            <SortableTaskRow
                              key={sub.id}
                              task={sub}
                              onToggleStatus={() => onToggleStatus(sub.id)}
                              onUpdate={(changes) => onUpdate(sub.id, changes)}
                              dragDisabled
                              isSubtask
                            />
                          ))
                        : []),
                      // Inline new subtask row
                      ...(!isCollapsed && isAddingHere
                        ? [
                            <InlineNewSubtaskRow
                              key={`new-sub-${t.id}`}
                              onCommit={(title) => onCreateSubtask(t.id, title)}
                              onCancel={onCancelAddSubtask}
                            />,
                          ]
                        : []),
                    ];
                  })}
                </tbody>
              </table>
            )}
          </SortableContext>

          {/* inline add root task */}
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

  // Split into root tasks and subtasks
  const rootTasks = useMemo(() => tasks.filter((t) => t.parentTaskId == null), [tasks]);

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

  // Status grouping — only root tasks go into sections
  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of rootTasks) {
      const s = t.status as TaskStatus;
      if (s in map) map[s].push(t);
      else map.todo.push(t);
    }
    return map;
  }, [rootTasks]);

  // Section collapse state
  const [collapsedSections, setCollapsedSections] = useState<Set<TaskStatus>>(new Set());

  const toggleSection = (s: TaskStatus) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  // Per-task collapse state (parent expand/collapse), persisted in localStorage
  const [collapsedTasks, setCollapsedTasks] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(`listTaskCollapsed_${projectId}`);
      if (!raw) return new Set();
      return new Set<number>(JSON.parse(raw));
    } catch {
      return new Set();
    }
  });

  const toggleTask = (id: number) => {
    setCollapsedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(
          `listTaskCollapsed_${projectId}`,
          JSON.stringify(Array.from(next))
        );
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Inline add subtask state
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<number | null>(null);

  const handleAddSubtaskRequest = (parentId: number) => {
    // Auto-expand the parent if collapsed
    setCollapsedTasks((prev) => {
      if (!prev.has(parentId)) return prev;
      const next = new Set(prev);
      next.delete(parentId);
      try {
        localStorage.setItem(
          `listTaskCollapsed_${projectId}`,
          JSON.stringify(Array.from(next))
        );
      } catch {
        // ignore
      }
      return next;
    });
    setAddingSubtaskFor(parentId);
  };

  const handleCancelAddSubtask = () => setAddingSubtaskFor(null);

  const handleCreateSubtask = (parentId: number, title: string) => {
    const parent = tasks.find((t) => t.id === parentId);
    create.mutate({
      title,
      projectId,
      parentTaskId: parentId,
      status: (parent?.status as "todo" | "in_progress" | "done") ?? "todo",
      category: null,
    });
    setAddingSubtaskFor(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = Number(active.id);
    const activeTask = rootTasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    let targetStatus: TaskStatus | null = null;

    if (typeof over.id === "string" && over.id.startsWith("section-")) {
      targetStatus = over.id.slice("section-".length) as TaskStatus;
    } else {
      const overTask = rootTasks.find((t) => t.id === Number(over.id));
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
    // optimistic: rebuild full order as [subtasks and others not in section, reorderedSection...]
    const otherIds = tasks.filter((t) => t.status !== targetStatus || t.parentTaskId != null).map((t) => t.id);
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
      ...(changes.dueDate !== undefined ? { dueDate: changes.dueDate ?? undefined } : {}),
      ...(changes.startDate !== undefined ? { startDate: changes.startDate } : {}),
    });
  };

  const handleCreate = (title: string, sectionStatus: TaskStatus) => {
    create.mutate({
      title,
      status: sectionStatus,
      projectId,
      category: null,
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
              subtasksByParent={subtasksByParent}
              collapsedTasks={collapsedTasks}
              onToggleTask={toggleTask}
              addingSubtaskFor={addingSubtaskFor}
              onAddSubtaskRequest={handleAddSubtaskRequest}
              onCreateSubtask={handleCreateSubtask}
              onCancelAddSubtask={handleCancelAddSubtask}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
