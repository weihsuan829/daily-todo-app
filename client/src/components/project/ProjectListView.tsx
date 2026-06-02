import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import TagChips, { type TagLike } from "./TagChips";
import TagPicker from "./TagPicker";
import { PriorityPicker } from "./PriorityPicker";
import DatePicker from "./DatePicker";
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
import { trpc } from "@/lib/trpc";
import { STATUS_META, STATUS_ORDER, statusPillClass, type TaskStatus } from "@/lib/statusMeta";
import { getEffectiveDates } from "@/lib/taskHierarchy";
import type { ProjectViewProps } from "./types";
import type { Task } from "../../../../drizzle/schema";
import {
  DEFAULT_FILTER_STATE,
  applyFilterSort,
  visibleStatuses,
  type FilterState,
} from "@/lib/filterSort";
import { ProjectToolbar } from "./ProjectToolbar";

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
    priority?: "low" | "medium" | "high" | "urgent" | null;
    dueDate?: Date | null;
    startDate?: Date | null;
    recurrenceRule?: string | null;
  }) => void;
  dragDisabled?: boolean;
  // Subtask-specific
  isSubtask?: boolean;
  hasChildren?: boolean;
  childrenCollapsed?: boolean;
  onToggleChildren?: () => void;
  subtasks?: Task[];
  onAddSubtask?: (parentId: number) => void;
  // Tags
  tagIds?: number[];
  tagsById?: Record<number, TagLike>;
  projectId?: number;
  onTagChanged?: () => void;
  allTags?: TagLike[];
  // Bulk selection (root tasks only)
  bulkChecked?: boolean;
  onBulkToggle?: () => void;
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
  tagIds = [],
  tagsById = {},
  projectId,
  onTagChanged,
  allTags = [],
  bulkChecked,
  onBulkToggle,
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
      {/* bulk checkbox — root tasks only */}
      {!isSubtask && onBulkToggle != null && (
        <td className="w-6 px-1 pl-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={bulkChecked ?? false}
            onChange={onBulkToggle}
            className="rounded border-border accent-primary cursor-pointer"
            title="Select task"
          />
        </td>
      )}
      {/* placeholder for subtasks so columns align */}
      {isSubtask && onBulkToggle == null && <td className="w-6" />}

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
        <div className={`flex flex-col gap-0.5 ${isSubtask ? "pl-6" : ""}`}>
          <div className="flex items-center gap-1.5">
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
            {/* tag picker hover button */}
            {projectId != null && onTagChanged && (
              <TagPicker
                taskId={task.id}
                projectId={projectId}
                tags={allTags}
                selectedTagIds={tagIds}
                onChanged={onTagChanged}
              />
            )}
          </div>
          {/* tag chips row */}
          {tagIds.length > 0 && (
            <TagChips tagIds={tagIds} tagsById={tagsById} size="xs" />
          )}
        </div>
      </td>

      {/* priority */}
      <td className="px-2 py-2 w-10" onClick={(e) => e.stopPropagation()}>
        <PriorityPicker
          value={(task.priority as "low" | "medium" | "high" | "urgent") ?? null}
          onChange={(p) => onUpdate({ priority: p })}
        />
      </td>

      {/* due date */}
      <td className="px-3 py-2 w-36 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
        {dateLocked ? (
          <DatePicker
            startDate={effDates.startDate}
            dueDate={effDates.dueDate}
            recurrenceRule={task.recurrenceRule ?? null}
            onChange={() => {
              /* locked — aggregated from subtasks */
            }}
            disabled
          />
        ) : (
          <DatePicker
            startDate={task.startDate ?? null}
            dueDate={task.dueDate ?? null}
            recurrenceRule={task.recurrenceRule ?? null}
            onChange={({ startDate, dueDate, recurrenceRule }) =>
              onUpdate({ startDate, dueDate, recurrenceRule })
            }
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
  tagIdsByTask,
  tagsById,
  projectId,
  onTagChanged,
  allTags,
  bulkSelected,
  onBulkToggle,
  dragDisabledBySort,
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
      priority?: "low" | "medium" | "high" | "urgent" | null;
      dueDate?: Date | null;
      startDate?: Date | null;
      recurrenceRule?: string | null;
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
  tagIdsByTask: Map<number, number[]>;
  tagsById: Record<number, TagLike>;
  projectId: number;
  onTagChanged: () => void;
  allTags: TagLike[];
  bulkSelected: Set<number>;
  onBulkToggle: (id: number) => void;
  dragDisabledBySort: boolean;
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
                        dragDisabled={dragDisabledBySort}
                        hasChildren={hasChildren}
                        childrenCollapsed={isCollapsed}
                        onToggleChildren={
                          hasChildren ? () => onToggleTask(t.id) : undefined
                        }
                        subtasks={hasChildren ? subs : undefined}
                        onAddSubtask={onAddSubtaskRequest}
                        tagIds={tagIdsByTask.get(t.id) ?? []}
                        tagsById={tagsById}
                        projectId={projectId}
                        onTagChanged={onTagChanged}
                        allTags={allTags}
                        bulkChecked={bulkSelected.has(t.id)}
                        onBulkToggle={() => onBulkToggle(t.id)}
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
                              tagIds={tagIdsByTask.get(sub.id) ?? []}
                              tagsById={tagsById}
                              projectId={projectId}
                              onTagChanged={onTagChanged}
                              allTags={allTags}
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

  const bulkUpdate = trpc.tasks.bulkUpdate.useMutation({
    onSuccess: () => {
      utils.tasks.listByProject.invalidate({ projectId });
      setBulkSelected(new Set());
    },
  });

  const bulkDelete = trpc.tasks.bulkDelete.useMutation({
    onSuccess: () => {
      utils.tasks.listByProject.invalidate({ projectId });
      setBulkSelected(new Set());
    },
  });

  // Tags data
  const { data: rawTags = [] } = trpc.tags.list.useQuery({ projectId });
  const { data: rawTaskMap = [] } = trpc.tags.taskMap.useQuery({ projectId });

  const tagsById = useMemo<Record<number, TagLike>>(() => {
    const m: Record<number, TagLike> = {};
    for (const t of rawTags) m[t.id] = t;
    return m;
  }, [rawTags]);

  const tagIdsByTask = useMemo<Map<number, number[]>>(() => {
    const m = new Map<number, number[]>();
    for (const { taskId, tagId } of rawTaskMap) {
      const arr = m.get(taskId) ?? [];
      arr.push(tagId);
      m.set(taskId, arr);
    }
    return m;
  }, [rawTaskMap]);

  const handleTagChanged = () => {
    utils.tags.taskMap.invalidate({ projectId });
    utils.tags.list.invalidate({ projectId });
  };

  // ─── Filter state (persisted per project) ──────────────────────────────────
  const filterStorageKey = `projectFilter_${projectId}`;
  const [filterState, setFilterState] = useState<FilterState>(() => {
    try {
      const raw = localStorage.getItem(filterStorageKey);
      if (!raw) return DEFAULT_FILTER_STATE;
      return JSON.parse(raw) as FilterState;
    } catch {
      return DEFAULT_FILTER_STATE;
    }
  });

  const handleFilterChange = (next: FilterState) => {
    setFilterState(next);
    try {
      localStorage.setItem(filterStorageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  // ─── Bulk selection ────────────────────────────────────────────────────────
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());

  const handleBulkToggle = (id: number) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearBulk = () => setBulkSelected(new Set());

  const handleBulkUpdateStatus = (status: TaskStatus) => {
    bulkUpdate.mutate({ ids: Array.from(bulkSelected), status });
  };

  const handleBulkUpdatePriority = (priority: "low" | "medium" | "high") => {
    bulkUpdate.mutate({ ids: Array.from(bulkSelected), priority });
  };

  const handleBulkDelete = () => {
    if (!window.confirm(`Delete ${bulkSelected.size} task(s)?`)) return;
    bulkDelete.mutate({ ids: Array.from(bulkSelected) });
  };

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

  // Drag is disabled when a non-manual sort is active
  const dragDisabledBySort = filterState.sort.field !== "manual";

  // Apply filter + sort to root tasks; determine which statuses to show
  const filteredRootTasks = useMemo(
    () =>
      applyFilterSort(rootTasks, filterState, (t) => tagIdsByTask.get(t.id) ?? []),
    [rootTasks, filterState, tagIdsByTask]
  );

  const shownStatuses = useMemo(() => visibleStatuses(filterState), [filterState]);

  // Status grouping — only root tasks go into sections (filtered)
  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of filteredRootTasks) {
      const s = t.status as TaskStatus;
      if (s in map) map[s].push(t);
      else map.todo.push(t);
    }
    return map;
  }, [filteredRootTasks]);

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
      priority?: "low" | "medium" | "high" | "urgent" | null;
      dueDate?: Date | null;
      startDate?: Date | null;
      recurrenceRule?: string | null;
    }
  ) => {
    update.mutate({
      id,
      ...(changes.title !== undefined ? { title: changes.title } : {}),
      ...(changes.priority !== undefined
        ? { priority: changes.priority ?? undefined }
        : {}),
      ...(changes.dueDate !== undefined ? { dueDate: changes.dueDate ?? undefined } : {}),
      ...(changes.startDate !== undefined ? { startDate: changes.startDate } : {}),
      ...(changes.recurrenceRule !== undefined
        ? { recurrenceRule: changes.recurrenceRule }
        : {}),
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
      {/* Toolbar */}
      <div className="mb-4">
        <ProjectToolbar
          state={filterState}
          onChange={handleFilterChange}
          tags={rawTags}
          totalCount={rootTasks.length}
          visibleCount={filteredRootTasks.length}
        />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="space-y-3">
          {STATUS_ORDER.filter((s) => shownStatuses.includes(s)).map((s) => (
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
              tagIdsByTask={tagIdsByTask}
              tagsById={tagsById}
              projectId={projectId}
              onTagChanged={handleTagChanged}
              allTags={rawTags}
              bulkSelected={bulkSelected}
              onBulkToggle={handleBulkToggle}
              dragDisabledBySort={dragDisabledBySort}
            />
          ))}
        </div>
      </DndContext>

      {/* Floating bulk action bar */}
      {bulkSelected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-gray-100 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 z-30">
          <span className="text-sm">{bulkSelected.size} selected</span>
          <div className="w-px h-5 bg-gray-700" />
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) handleBulkUpdateStatus(e.target.value as TaskStatus);
              e.target.value = "";
            }}
            className="bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 border border-gray-700"
          >
            <option value="">Change status…</option>
            {(["todo", "in_progress", "done"] as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {s === "todo" ? "To Do" : s === "in_progress" ? "In Progress" : "Done"}
              </option>
            ))}
          </select>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) handleBulkUpdatePriority(e.target.value as "low" | "medium" | "high");
              e.target.value = "";
            }}
            className="bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 border border-gray-700"
          >
            <option value="">Change priority…</option>
            {(["low", "medium", "high"] as const).map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="inline-flex items-center gap-1 text-sm px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <div className="w-px h-5 bg-gray-700" />
          <button
            type="button"
            onClick={clearBulk}
            className="p-1 text-gray-300 hover:text-white transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
