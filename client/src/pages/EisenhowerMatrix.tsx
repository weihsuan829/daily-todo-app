import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { TaskNotesModal } from "@/components/TaskNotesModal";
import { canOpenTaskNotes } from "@/lib/canOpenTaskNotes";
import { QUADRANTS, type Quadrant } from "@/lib/quadrants";
import { splitByCompletion, computeQuadrantReorder, computeCrossQuadrantMove } from "@/lib/matrixDnd";
import { CompletedSection } from "@/components/matrix/CompletedSection";
import { ConfirmDeleteDialog } from "@/components/matrix/ConfirmDeleteDialog";

interface EisenhowerMatrixProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

export function EisenhowerMatrix({ selectedDate, onDateChange }: EisenhowerMatrixProps) {
  const [newTasks, setNewTasks] = useState<Record<Quadrant, string>>({
    "urgent-important": "",
    "not-urgent-important": "",
    "urgent-not-important": "",
    "not-urgent-not-important": "",
  });

  const utils = trpc.useUtils();

  // Fetch tasks for the selected date
  const { data: tasks = [] } = trpc.tasks.list.useQuery({
    category: "eisenhower",
    date: selectedDate,
  });

  const [notesTask, setNotesTask] = useState<(typeof tasks)[number] | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<(typeof tasks)[number] | null>(null);

  const createTaskMutation = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate({ category: "eisenhower" });
      utils.tasks.stats.invalidate();
      toast.success("任務已新增");
    },
    onError: () => {
      toast.error("新增任務失敗");
    },
  });

  const deleteTaskMutation = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate({ category: "eisenhower" });
      utils.tasks.stats.invalidate();
    },
    onError: () => {
      toast.error("刪除任務失敗");
    },
  });

  const updateTaskMutation = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate({ category: "eisenhower" });
      utils.tasks.stats.invalidate();
    },
    onError: () => {
      toast.error("更新任務失敗");
    },
  });

  const reorderDayMutation = trpc.tasks.reorderDay.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate({ category: "eisenhower" });
    },
    onError: () => {
      utils.tasks.list.invalidate({ category: "eisenhower" });
      toast.error("排序失敗");
    },
  });

  // Dedicated mutation for the drag cross-quadrant move: does NOT invalidate on
  // success so the query only settles once, via reorderDayMutation's onSuccess.
  const moveTaskMutation = trpc.tasks.update.useMutation({
    onError: () => {
      utils.tasks.list.invalidate({ category: "eisenhower" });
      toast.error("更新任務失敗");
    },
  });

  const [dragActiveId, setDragActiveId] = useState<number | null>(null);
  const [historyBusyId, setHistoryBusyId] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { active: activeTasks, completed: completedTasks } = splitByCompletion(tasks);

  // Filter tasks by quadrant (active tasks only; completed ones live in CompletedSection)
  // Sorted to mirror the server's own ordering (dueDate first, then order) so that
  // optimistic `order` rewrites in handleDragEnd actually change visual position.
  const tasksByQuadrant = (quadrant: Quadrant) =>
    activeTasks
      .filter((task) => task.quadrant === quadrant)
      .sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const db_ = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        return da !== db_ ? da - db_ : (a.order ?? 0) - (b.order ?? 0);
      });

  const findQuadrantOfTask = (id: number): Quadrant | null => {
    const task = activeTasks.find((t) => t.id === id);
    return (task?.quadrant as Quadrant) ?? null;
  };

  const queryInput = { category: "eisenhower" as const, date: selectedDate };

  const handleDragStart = (event: DragStartEvent) => {
    setDragActiveId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as number;
    const sourceQuadrant = findQuadrantOfTask(activeId);
    if (!sourceQuadrant) return;

    const overId = over.id as string | number;
    let targetQuadrant: Quadrant | null = null;
    let overTaskId: number | null = null;
    if (typeof overId === "string" && overId.startsWith("quadrant-")) {
      targetQuadrant = overId.replace("quadrant-", "") as Quadrant;
    } else if (typeof overId === "number") {
      targetQuadrant = findQuadrantOfTask(overId);
      overTaskId = overId;
    }
    if (!targetQuadrant) return;

    if (targetQuadrant === sourceQuadrant) {
      if (overTaskId === null) return;
      const orderedIds = computeQuadrantReorder(tasksByQuadrant(sourceQuadrant), activeId, overTaskId);
      if (!orderedIds) return;
      void utils.tasks.list.cancel(queryInput);
      utils.tasks.list.setData(queryInput, (old) => {
        if (!old) return old;
        return old.map((t) => {
          const pos = orderedIds.indexOf(t.id);
          return pos === -1 ? t : { ...t, order: pos };
        });
      });
      reorderDayMutation.mutate({ orderedIds });
    } else {
      const { update, orderedIds } = computeCrossQuadrantMove(
        activeId,
        targetQuadrant,
        tasksByQuadrant(targetQuadrant).map((t) => t.id),
        overTaskId
      );
      void utils.tasks.list.cancel(queryInput);
      utils.tasks.list.setData(queryInput, (old) => {
        if (!old) return old;
        return old.map((t) => {
          const pos = orderedIds.indexOf(t.id);
          if (t.id === activeId) {
            return { ...t, quadrant: update.quadrant, priority: update.priority, order: pos };
          }
          return pos === -1 ? t : { ...t, order: pos };
        });
      });
      moveTaskMutation.mutate(update, {
        onSuccess: () => {
          reorderDayMutation.mutate({ orderedIds });
        },
      });
    }
  };

  const dragActiveTask = dragActiveId != null ? activeTasks.find((t) => t.id === dragActiveId) : null;

  const handleAddTask = async (quadrant: Quadrant) => {
    const title = newTasks[quadrant].trim();
    if (!title) return;

    const config = QUADRANTS.find((q) => q.key === quadrant)!;
    await createTaskMutation.mutateAsync({
      category: "eisenhower",
      title,
      priority: config.priority,
      dueDate: selectedDate,
      quadrant,
    });

    setNewTasks((prev) => ({
      ...prev,
      [quadrant]: "",
    }));
  };

  return (
    <div className="space-y-6">
      {/* 四象限網格 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {QUADRANTS.map((quadrant) => (
          <Card
            key={quadrant.key}
            className={`border ${quadrant.borderColor} ${quadrant.bgColor} p-4 flex flex-col overflow-hidden`}
          >
            {/* 頂部漸層色條 */}
            <div 
              className="h-2 -mx-4 -mt-4 mb-2"
              style={{
                background: `linear-gradient(to right, ${quadrant.topBarColor === 'bg-rose-200' ? 'rgb(251, 146, 160)' : quadrant.topBarColor === 'bg-blue-300' ? 'rgb(147, 197, 253)' : 'rgb(203, 213, 225)'}, ${quadrant.topBarColor === 'bg-rose-200' ? 'rgb(251, 146, 160, 0.2)' : quadrant.topBarColor === 'bg-blue-300' ? 'rgb(147, 197, 253, 0.2)' : 'rgb(203, 213, 225, 0.2)'})`
              }}
            ></div>
            {/* 標題 */}
            <div className="mb-3">
              <h3 className="text-base font-bold text-gray-900 mb-1">
                {quadrant.label}
              </h3>
              <p className="text-xs text-gray-500">{quadrant.description}</p>
            </div>

            {/* 任務列表 */}
            <DroppableQuadrant quadrant={quadrant.key}>
              <SortableContext
                items={tasksByQuadrant(quadrant.key).map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {tasksByQuadrant(quadrant.key).length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">暂無任務</p>
                ) : (
                  tasksByQuadrant(quadrant.key).map((task) => (
                    <SortableTaskRow key={task.id} id={task.id}>
                      <div className="flex items-center gap-2 rounded bg-white p-2 text-xs group hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => {
                            updateTaskMutation.mutate({
                              id: task.id,
                              completed: !task.completed,
                            });
                          }}
                          className="rounded"
                        />
                        <span
                          onClick={canOpenTaskNotes(task) ? () => setNotesTask(task) : undefined}
                          className={`flex-1 ${canOpenTaskNotes(task) ? "cursor-pointer" : ""} ${
                            task.completed
                              ? "line-through text-gray-400"
                              : "text-gray-900"
                          }`}
                        >
                          {task.title}
                          {task.description ? (
                            <FileText className="inline-block w-3 h-3 ml-1 text-gray-400 align-[-1px]" />
                          ) : null}
                        </span>
                        {canOpenTaskNotes(task) && (
                          <button
                            onClick={() => setNotesTask(task)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            title="編輯筆記"
                          >
                            <FileText className="w-3 h-3 text-gray-400 hover:text-blue-500" />
                          </button>
                        )}
                        <button
                          onClick={() => setPendingDeleteTask(task)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          title="刪除"
                        >
                          <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </SortableTaskRow>
                  ))
                )}
              </SortableContext>
            </DroppableQuadrant>

            {/* 新增任務輸入 */}
            <div className="flex gap-2">
              <Input
                placeholder="新增..."
                value={newTasks[quadrant.key]}
                onChange={(e) =>
                  setNewTasks((prev) => ({
                    ...prev,
                    [quadrant.key]: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddTask(quadrant.key);
                  }
                }}
                className="flex-1 text-xs h-8"
              />
              <Button
                onClick={() => handleAddTask(quadrant.key)}
                disabled={!newTasks[quadrant.key].trim()}
                size="sm"
                className="h-8 px-2 bg-slate-400 hover:bg-slate-500"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

        <DragOverlay>
          {dragActiveTask ? (
            <div className="flex items-center gap-2 rounded bg-white p-2 text-xs shadow-lg border border-slate-200 opacity-90">
              <span className="text-gray-900">{dragActiveTask.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 已完成歷史區 */}
      <CompletedSection
        tasks={completedTasks}
        onRestore={(id) => {
          setHistoryBusyId(id);
          updateTaskMutation.mutate(
            { id, completed: false },
            {
              onSuccess: () => toast.success("已復原"),
              onSettled: () => setHistoryBusyId(null),
            }
          );
        }}
        onDelete={(task) => {
          setHistoryBusyId(task.id);
          deleteTaskMutation.mutate(
            { id: task.id, dueDate: task.dueDate ?? undefined },
            { onSettled: () => setHistoryBusyId(null) }
          );
        }}
        busyId={historyBusyId}
      />

      <TaskNotesModal
        isOpen={notesTask !== null}
        task={notesTask}
        onClose={() => setNotesTask(null)}
        onSave={(update) => {
          updateTaskMutation.mutate(update, {
            onSuccess: () => {
              setNotesTask(null);
              toast.success("筆記已保存");
            },
          });
        }}
        isSaving={updateTaskMutation.isPending}
      />

      <ConfirmDeleteDialog
        taskTitle={pendingDeleteTask?.title ?? null}
        onCancel={() => setPendingDeleteTask(null)}
        onConfirm={() => {
          if (pendingDeleteTask) {
            deleteTaskMutation.mutate({
              id: pendingDeleteTask.id,
              dueDate: pendingDeleteTask.dueDate ?? undefined,
            });
          }
          setPendingDeleteTask(null);
        }}
      />
    </div>
  );
}

function SortableTaskRow({ id, children }: { id: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function DroppableQuadrant({ quadrant, children }: { quadrant: Quadrant; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `quadrant-${quadrant}` });
  return (
    <div
      ref={setNodeRef}
      className={`mb-3 space-y-2 flex-1 min-h-[40px] rounded transition-colors ${isOver ? "bg-blue-100/20" : ""}`}
    >
      {children}
    </div>
  );
}
