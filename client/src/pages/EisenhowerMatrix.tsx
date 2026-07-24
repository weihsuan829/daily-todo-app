import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { TaskNotesModal } from "@/components/TaskNotesModal";

type Quadrant = "urgent-important" | "not-urgent-important" | "urgent-not-important" | "not-urgent-not-important";

interface QuadrantConfig {
  key: Quadrant;
  label: string;
  description: string;
  bgColor: string;
  borderColor: string;
  topBarColor: string;
  priority: "high" | "medium" | "low";
}

const QUADRANTS: QuadrantConfig[] = [
  {
    key: "urgent-important",
    label: "緊急且重要",
    description: "立即處理",
    bgColor: "bg-white",
    borderColor: "border-rose-200",
    topBarColor: "bg-rose-200",
    priority: "high",
  },
  {
    key: "not-urgent-important",
    label: "不緊急但重要",
    description: "計劃安排",
    bgColor: "bg-white",
    borderColor: "border-slate-200",
    topBarColor: "bg-slate-300",
    priority: "medium",
  },
  {
    key: "urgent-not-important",
    label: "緊急但不重要",
    description: "委派處理",
    bgColor: "bg-white",
    borderColor: "border-blue-200",
    topBarColor: "bg-blue-300",
    priority: "medium",
  },
  {
    key: "not-urgent-not-important",
    label: "既不緊急也不重要",
    description: "消除浪費",
    bgColor: "bg-white",
    borderColor: "border-slate-200",
    topBarColor: "bg-slate-300",
    priority: "low",
  },
];

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

  // Filter tasks by quadrant
  const tasksByQuadrant = (quadrant: Quadrant) =>
    tasks.filter((task) => task.quadrant === quadrant);

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
            <div className="mb-3 space-y-2 flex-1">
              {tasksByQuadrant(quadrant.key).length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">暂無任務</p>
              ) : (
                tasksByQuadrant(quadrant.key).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded bg-white p-2 text-xs group hover:bg-gray-50"
                  >
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
                      onClick={() => setNotesTask(task)}
                      className={`flex-1 cursor-pointer ${
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
                    <button
                      onClick={() => setNotesTask(task)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      title="編輯筆記"
                    >
                      <FileText className="w-3 h-3 text-gray-400 hover:text-blue-500" />
                    </button>
                    <button
                      onClick={() => {
                        deleteTaskMutation.mutate({
                          id: task.id,
                          dueDate: task.dueDate,
                        });
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))
              )}
            </div>

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
    </div>
  );
}
