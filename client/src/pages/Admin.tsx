import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BarChart3, Search, Download, Edit2, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "work" | "life">("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const { data: allTasks = [] } = trpc.admin.getAllTasks.useQuery();
  const { data: stats } = trpc.tasks.stats.useQuery();
  const updateTaskMutation = trpc.tasks.update.useMutation();
  const deleteTaskMutation = trpc.tasks.delete.useMutation();

  // 篩選任務
  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
      const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === "all" || task.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [allTasks, searchTerm, categoryFilter]);

  // 計算統計資訊
  const taskStats = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((t) => t.completed).length;
    const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      total,
      completed,
      pending: total - completed,
      completionRate,
    };
  }, [filteredTasks]);

  // 匯出為 CSV
  const exportToCSV = () => {
    const headers = ["ID", "Title", "Category", "Priority", "Status", "Due Date", "Created At"];
    const rows = filteredTasks.map((task) => [
      task.id,
      task.title,
      task.category,
      task.priority,
      task.completed ? "Completed" : "Pending",
      task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "N/A",
      new Date(task.createdAt).toLocaleDateString(),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  // 開始編輯
  const startEdit = (task: any) => {
    setEditingId(task.id);
    setEditTitle(task.title);
  };

  // 保存編輯
  const saveEdit = (taskId: number) => {
    if (!editTitle.trim()) {
      toast.error("Title cannot be empty");
      return;
    }

    updateTaskMutation.mutate(
      { id: taskId, title: editTitle },
      {
        onSuccess: () => {
          setEditingId(null);
          toast.success("Task updated");
        },
        onError: () => {
          toast.error("Failed to update task");
        },
      }
    );
  };

  // 刪除任務
  const deleteTask = (taskId: number) => {
    if (confirm("Are you sure you want to delete this task?")) {
      deleteTaskMutation.mutate(
        { id: taskId },
        {
          onSuccess: () => {
            toast.success("Task deleted");
          },
          onError: () => {
            toast.error("Failed to delete task");
          },
        }
      );
    }
  };

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* 標題 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2 flex items-center gap-2">
                <BarChart3 className="w-8 h-8" />
                Dashboard
              </h1>
              <p className="text-muted-foreground">查看所有任務和統計分析</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setLocation("/")}
            >
              Back to Tasks
            </Button>
          </div>
        </div>

        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6 bg-white border border-gray-200">
            <p className="text-sm text-muted-foreground mb-2">Total Tasks</p>
            <p className="text-3xl font-bold text-foreground">{taskStats.total}</p>
          </Card>
          <Card className="p-6 bg-white border border-gray-200">
            <p className="text-sm text-muted-foreground mb-2">Completed</p>
            <p className="text-3xl font-bold text-green-500">{taskStats.completed}</p>
          </Card>
          <Card className="p-6 bg-white border border-gray-200">
            <p className="text-sm text-muted-foreground mb-2">Pending</p>
            <p className="text-3xl font-bold text-orange-500">{taskStats.pending}</p>
          </Card>
          <Card className="p-6 bg-white border border-gray-200">
            <p className="text-sm text-muted-foreground mb-2">Completion Rate</p>
            <p className="text-3xl font-bold text-blue-500">{taskStats.completionRate}%</p>
          </Card>
        </div>

        {/* 篩選和搜尋 */}
        <Card className="p-6 bg-white border border-gray-200 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="搜尋任務..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-foreground"
            >
              <option value="all">All Categories</option>
              <option value="work">Work</option>
              <option value="life">Life</option>
            </select>
            <Button onClick={exportToCSV} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
        </Card>

        {/* 任務表格 */}
        <Card className="bg-white border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Title</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Category</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Priority</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Due Date</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      No tasks found
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task: any) => (
                    <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-foreground">
                        {editingId === task.id ? (
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full"
                          />
                        ) : (
                          task.title
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          task.category === "work"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-pink-100 text-pink-700"
                        }`}>
                          {task.category === "work" ? "Work" : "Life"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          task.priority === "high"
                            ? "bg-red-100 text-red-700"
                            : task.priority === "medium"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-green-100 text-green-700"
                        }`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          task.completed
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}>
                          {task.completed ? "Completed" : "Pending"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          {editingId === task.id ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => saveEdit(task.id)}
                                className="gap-1"
                              >
                                <Check className="w-4 h-4" />
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingId(null)}
                                className="gap-1"
                              >
                                <X className="w-4 h-4" />
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEdit(task)}
                                className="gap-1"
                              >
                                <Edit2 className="w-4 h-4" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteTask(task.id)}
                                className="gap-1 text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
