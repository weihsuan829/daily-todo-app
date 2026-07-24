import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useRef, useEffect } from "react";
import { Briefcase, Heart, Plus, BarChart3, LogOut, ChevronLeft, ChevronRight, Settings, LayoutGrid, Target, Grid3x3, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useCursorTracker } from "@/hooks/useCursorTracker";
import { useAuth } from "@/_core/hooks/useAuth";
import { InteractiveTaskCard } from "@/components/InteractiveTaskCard";
import { Banner } from "@/components/Banner";
import { TaskNotesModal } from "@/components/TaskNotesModal";
import { canOpenTaskNotes } from "@/lib/canOpenTaskNotes";
import { EisenhowerMatrix } from "./EisenhowerMatrix";
import ProjectSidebarSection from "@/components/project/ProjectSidebarSection";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

type Category = "work" | "life" | "eisenhower";

// Sortable wrapper for a single task card
function SortableTaskCardWrapper({
  task,
  children,
}: {
  task: { id: number; isRecurring?: boolean };
  children: React.ReactNode;
}) {
  const disabled = !!(task.isRecurring || task.id < 0);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: disabled ? "default" : "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...(disabled ? {} : { ...attributes, ...listeners })}>
      {children}
    </div>
  );
}

// Droppable day column wrapper
function DroppableDayColumn({ dayName, children }: { dayName: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayName}` });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-1 flex-1 min-h-[40px] rounded transition-colors ${isOver ? "bg-blue-100/10" : ""}`}
    >
      {children}
    </div>
  );
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const MOTIVATIONAL_QUOTES = [
  "讓我們創造明天，而不是去想昨天發生了什麼事。如果你每一天可以進步1%，代表一年就會成長37倍。",
  "成功不是終點，失敗也不是致命的。重要的是繼續前進的勇氣。",
  "每一天都是新的開始，把握當下，創造美好的未來。",
  "堅持不懈，夢想就會實現。",
  "生活中最美好的事物往往來自於堅持不放棄。",
];

export default function TaskList() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  useCursorTracker();
  
  const [activeCategory, setActiveCategory] = useState<Category>("work");
  const isEisenhowerMode = activeCategory === "eisenhower";
  const [inputStates, setInputStates] = useState<Record<string, { isOpen: boolean; value: string }>>({});
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedTaskForNotes, setSelectedTaskForNotes] = useState<any>(null);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const weekContainerRef = useRef<HTMLDivElement>(null);
  const [dragActiveId, setDragActiveId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // 獲取任務列表
  const { data: tasks = [], isLoading: tasksLoading } = trpc.tasks.list.useQuery({
    category: activeCategory as "work" | "life" | "eisenhower",
  });

  // 獲取統計資訊
  const { data: stats } = trpc.tasks.stats.useQuery();

  // 建立任務
  const createTaskMutation = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate({ category: activeCategory });
      utils.tasks.stats.invalidate();
      toast.success("任務已新增");
    },
    onError: (error) => {
      toast.error("新增任務失敗");
      console.error(error);
    },
  });

  // 更新任務
  const updateTaskMutation = trpc.tasks.update.useMutation({
    onMutate: async ({ id, completed: newCompleted, title }) => {
      await utils.tasks.list.cancel({ category: activeCategory });
      const previousTasks = utils.tasks.list.getData({ category: activeCategory });
      if (newCompleted !== undefined || title !== undefined) {
        utils.tasks.list.setData(
          { category: activeCategory },
          (old) => old?.map((t) => (t.id === id ? { ...t, ...(newCompleted !== undefined && { completed: newCompleted }), ...(title !== undefined && { title }) } : t)) || []
        );
      }
      return { previousTasks };
    },
    onSuccess: () => {
      utils.tasks.stats.invalidate();
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        utils.tasks.list.setData({ category: activeCategory }, context.previousTasks);
      }
      toast.error("更新任務失敗");
      console.error(error);
    },
  });

  // 刪除任務
  const deleteTaskMutation = trpc.tasks.delete.useMutation({
    onMutate: async ({ id, dueDate }) => {
      await utils.tasks.list.cancel({ category: activeCategory });
      const previousTasks = utils.tasks.list.getData({ category: activeCategory });
      utils.tasks.list.setData(
        { category: activeCategory },
        (old) => old?.filter((t) => t.id !== id) || []
      );
      return { previousTasks };
    },
    onSuccess: () => {
      utils.tasks.stats.invalidate();
      toast.success("任務已刪除");
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        utils.tasks.list.setData({ category: activeCategory }, context.previousTasks);
      }
      toast.error("刪除任務失敗");
      console.error(error);
    },
  })

  // 移動任務 mutation
  const moveTaskMutation = trpc.tasks.moveInDay.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate({ category: activeCategory });
      utils.tasks.stats.invalidate();
    },
    onError: (error) => {
      utils.tasks.list.invalidate({ category: activeCategory });
      console.error('Move task error:', error);
      toast.error('移動任務失敗');
    },
  });

  // Drag-and-drop: reorder within the same day
  const reorderDayMutation = trpc.tasks.reorderDay.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate({ category: activeCategory });
    },
    onError: (error) => {
      utils.tasks.list.invalidate({ category: activeCategory });
      console.error('Reorder error:', error);
      toast.error('排序失敗');
    },
  });

  // 切換任務完成狀態
  const toggleTaskComplete = (taskId: number, currentStatus: boolean) => {
    updateTaskMutation.mutate({
      id: taskId,
      completed: !currentStatus,
    });
  };

  // 移動任務
  const handleMoveTask = (taskId: number, direction: 'up' | 'down', day: string) => {
    const tasksInDay = tasksByDay[day] || [];
    const currentIndex = tasksInDay.findIndex(t => t.id === taskId);
    
    if (currentIndex === -1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= tasksInDay.length) return;
    const targetTask = tasksInDay[targetIndex];
    
    const currentTask = tasksInDay[currentIndex];
    // 使用樂觀更新互換順序
    utils.tasks.list.setData(
      { category: activeCategory },
      (old) => {
        if (!old) return old;
        const newTasks = [...old];
        const currentTaskIndex = newTasks.findIndex(t => t.id === currentTask.id);
        const targetTaskIndex = newTasks.findIndex(t => t.id === targetTask.id);
        
        if (currentTaskIndex !== -1 && targetTaskIndex !== -1) {
          const tempOrder = newTasks[currentTaskIndex].order;
          newTasks[currentTaskIndex].order = newTasks[targetTaskIndex].order;
          newTasks[targetTaskIndex].order = tempOrder;
        }
        return newTasks;
      }
    );
    
    // 調用 API 保存變更
    moveTaskMutation.mutate({
      taskId: currentTask.id,
      targetTaskId: targetTask.id,
    });
  };

  // 計算週一的日期
  const getWeekStartDate = (offset: number) => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(today);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() + offset * 7);
    return monday;
  };

  const weekStartDate = getWeekStartDate(weekOffset);
  
  // 計算週內每天的日期
  const weekDates = useMemo(() => {
    const dates: Record<string, Date> = {};
    DAYS_OF_WEEK.forEach((day, index) => {
      const date = new Date(weekStartDate);
      date.setDate(date.getDate() + index);
      dates[day] = date;
    });
    return dates;
  }, [weekStartDate]);

  // 新增任務到指定的日期
  const handleAddTaskForDay = (day: string) => {
    const value = inputStates[day]?.value.trim() || "";
    if (!value) {
      toast.error("請輸入任務標題");
      return;
    }

    const dueDate = new Date(weekDates[day]);

    createTaskMutation.mutate({
      category: activeCategory,
      title: value,
      description: undefined,
      priority: "medium",
      dueDate: dueDate,
    });

    // 清空輸入框
    setInputStates((prev) => ({
      ...prev,
      [day]: { isOpen: false, value: "" },
    }));
  };

  // Sort tasks by order only (manual order wins so drag-reorder sticks visually).
  // Priority is still shown on the card badge but does not affect position.
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => a.order - b.order);
  }, [tasks]);

  // 按日期分組任務
  const tasksByDay = useMemo(() => {
    const grouped: Record<string, typeof sortedTasks> = {};
    DAYS_OF_WEEK.forEach((day) => {
      grouped[day] = [];
    });

    sortedTasks.forEach((task) => {
      if (task.dueDate) {
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);
        for (let i = 0; i < 7; i++) {
          const compareDate = new Date(weekStartDate);
          compareDate.setDate(compareDate.getDate() + i);
          compareDate.setHours(0, 0, 0, 0);
          if (taskDate.getTime() === compareDate.getTime()) {
            grouped[DAYS_OF_WEEK[i]].push(task);
            break;
          }
        }
      }
    });

    return grouped;
  }, [sortedTasks, weekStartDate]);

  const randomQuote = useMemo(() => {
    return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
  }, [activeCategory]);

  // 切換週次時自動滾動
  useEffect(() => {
    if (weekContainerRef.current) {
      weekContainerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [weekOffset]);

  // 格式化日期為 MM/DD
  const formatDate = (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
  };

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Helper: find which day a task belongs to (based on current tasksByDay grouping)
  const findDayOfTask = (taskId: number): string | null => {
    for (const day of DAYS_OF_WEEK) {
      if (tasksByDay[day]?.some((t) => t.id === taskId)) return day;
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDragActiveId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as number;

    // Recurring virtual instances use negative ids and are generated from a
    // rule — they are never movable (cross-day OR reorder). Hard bail first.
    if (activeId < 0) return;

    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;
    const isVirtual = !!(activeTask.isRecurring || activeId < 0);

    const activeDay = findDayOfTask(activeId);
    if (!activeDay) return;

    // Determine target day
    let targetDay: string | null = null;
    const overId = over.id as string | number;

    if (typeof overId === "string" && overId.startsWith("day-")) {
      // Dropped directly on a droppable day zone
      targetDay = overId.replace("day-", "");
    } else if (typeof overId === "number") {
      // Dropped over another task — find which day that task belongs to
      targetDay = findDayOfTask(overId);
    }

    if (!targetDay) return;

    if (targetDay !== activeDay) {
      // Cross-day move: update dueDate — block for virtual/recurring tasks
      if (isVirtual) return;

      const targetIndex = DAYS_OF_WEEK.indexOf(targetDay);
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + targetIndex);
      d.setHours(0, 0, 0, 0);

      updateTaskMutation.mutate(
        { id: activeId, dueDate: d },
        {
          onSuccess: () => {
            utils.tasks.list.invalidate({ category: activeCategory });
          },
        }
      );
    } else {
      // Within-day reorder
      const dayTasks = tasksByDay[activeDay] || [];
      const realDayTasks = dayTasks.filter((t) => !t.isRecurring && t.id > 0);

      const oldIndex = realDayTasks.findIndex((t) => t.id === activeId);
      const newIndex = realDayTasks.findIndex((t) => t.id === (overId as number));

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(realDayTasks, oldIndex, newIndex);
      const orderedIds = reordered.map((t) => t.id);

      // Optimistic update
      utils.tasks.list.setData({ category: activeCategory }, (old) => {
        if (!old) return old;
        const taskMap = new Map(old.map((t) => [t.id, t]));
        const updated = old.map((t) => {
          const pos = orderedIds.indexOf(t.id);
          if (pos !== -1) {
            return { ...t, order: pos };
          }
          return t;
        });
        return updated;
      });

      reorderDayMutation.mutate({ orderedIds });
    }
  };

  // Find the dragged task for DragOverlay
  const dragActiveTask = dragActiveId != null ? tasks.find((t) => t.id === dragActiveId) : null;

  return (
    <div className="min-h-screen bg-white dark:from-slate-950 dark:to-slate-900 relative overflow-hidden">
      {/* 背景裝飾 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200/20 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10">
        {/* Banner */}
                <Banner />

        {/* 主容器 */}
        <div className="container mx-auto px-4 py-8">
          <div className="flex gap-6 flex-col md:flex-row">
            {/* 側邊欄 */}
            <div className="w-full md:w-64 md:flex-shrink-0">
              <Card className="p-6 backdrop-blur-md bg-white/10 border-white/20 sticky top-8">
                {/* 用戶信息 */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-foreground">Daily Todo</h2>
                    <button
                      onClick={() => {
                        trpc.auth.logout.useMutation().mutate();
                        setLocation("/");
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    成功不是終點，失敗也不是致命的。重要的是繼續前進的勇氣。
                  </p>
                </div>

                {/* 分類選擇 */}
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground font-semibold">Category</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => setActiveCategory("work")}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                        activeCategory === "work"
                          ? "bg-white/20 text-foreground"
                          : "text-muted-foreground hover:bg-white/10"
                      }`}
                    >
                      <Briefcase className="w-4 h-4" />
                      Work
                    </button>
                    <button
                      onClick={() => setActiveCategory("life")}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                        activeCategory === "life"
                          ? "bg-white/20 text-foreground"
                          : "text-muted-foreground hover:bg-white/10"
                      }`}
                    >
                      <Heart className="w-4 h-4" />
                      Life
                    </button>
                    <button
                      onClick={() => setActiveCategory("eisenhower" as Category)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                        activeCategory === ("eisenhower" as Category)
                          ? "bg-white/20 text-foreground"
                          : "text-muted-foreground hover:bg-white/10"
                      }`}
                    >
                      <Grid3x3 className="w-4 h-4" />
                      Eisenhower Matrix
                    </button>
                    <Link href="/notes" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all text-muted-foreground hover:bg-white/10">
                      <StickyNote className="w-4 h-4" /> Notes
                    </Link>
                  </div>
                </div>

                <ProjectSidebarSection />

                {/* 統計 */}
                <div className="mt-6 pt-6 border-t border-white/10 space-y-2">
                  <p className="text-xs text-muted-foreground font-semibold">Stats</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-semibold">{stats?.total || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Completed</span>
                      <span className="font-semibold">{stats?.completed || 0}</span>
                    </div>
                  </div>
                </div>

                {/* 設定和管理 */}
                <div className="mt-6 pt-6 border-t border-white/10 space-y-2">
                  <p className="text-xs text-muted-foreground font-semibold">Settings</p>
                  <button
                    onClick={() => setLocation("/recurring")}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all"
                  >
                    <Settings className="w-4 h-4" />
                    Set Recurring
                  </button>
                  <button
                    onClick={() => setLocation("/annual")}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all"
                  >
                    <Target className="w-4 h-4" />
                    Annual Tracking
                  </button>

                  <button
                    onClick={() => setLocation("/admin")}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    Admin
                  </button>
                </div>
              </Card>
            </div>

            {/* 主內容 */}
            <div className="flex-1">
              {/* 標題和週次切換 */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">Daily Todo</h1>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    {activeCategory === "work" ? "Work Tasks" : activeCategory === "life" ? "Life Tasks" : "Eisenhower Matrix"}
                  </p>
                </div>

                {/* 週次切換按鈕 */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWeekOffset(weekOffset - 1)}
                    className="bg-white/5 border-white/20 hover:bg-white/10"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs md:text-sm font-medium text-foreground min-w-[100px] md:min-w-[120px] text-center">
                    {formatDate(weekStartDate)} - {formatDate(new Date(weekStartDate.getTime() + 6 * 24 * 60 * 60 * 1000))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWeekOffset(weekOffset + 1)}
                    className="bg-white/5 border-white/20 hover:bg-white/10"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* 任務卡片網格或艾森豪矩陣 */}
              {isEisenhowerMode ? (
                <div>
                  <EisenhowerMatrix selectedDate={weekStartDate} onDateChange={() => {}} />
                </div>
              ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
              <div ref={weekContainerRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
                <AnimatePresence mode="wait">
                  {DAYS_OF_WEEK.map((day) => {
                    const dayTaskIds = (tasksByDay[day] || [])
                      .filter((t) => !t.isRecurring && t.id > 0)
                      .map((t) => t.id);
                    return (
                    <motion.div
                      key={day}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card className="p-2 md:p-4 backdrop-blur-md bg-white/5 border-white/20 h-full flex flex-col">
                        {/* 日期和星期 */}
                        <div className="mb-2">
                          <p className="text-xs text-muted-foreground font-semibold">
                            {formatDate(weekDates[day])}
                          </p>
                          <h3 className="text-base md:text-lg font-semibold text-foreground">{day}</h3>
                        </div>

                        {/* 輸入框 */}
                        {inputStates[day]?.isOpen && (
                          <div className="mb-2 flex gap-2">
                            <Input
                              type="text"
                              placeholder="輸入任務..."
                              value={inputStates[day]?.value || ""}
                              onChange={(e) =>
                                setInputStates((prev) => ({
                                  ...prev,
                                  [day]: { ...prev[day], value: e.target.value },
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleAddTaskForDay(day);
                                } else if (e.key === "Escape") {
                                  setInputStates((prev) => ({
                                    ...prev,
                                    [day]: { isOpen: false, value: "" },
                                  }));
                                }
                              }}
                              className="text-xs h-8"
                              autoFocus
                            />
                          </div>
                        )}

                        {/* 任務列表 */}
                        <SortableContext items={dayTaskIds} strategy={verticalListSortingStrategy}>
                          <DroppableDayColumn dayName={day}>
                            {tasksByDay[day] && tasksByDay[day].length === 0 ? (
                              !inputStates[day]?.isOpen && (
                                <p className="text-xs text-muted-foreground text-center py-4">暂無任務</p>
                              )
                            ) : (
                              tasksByDay[day]?.map((task, index) => {
                                const tasksInDay = tasksByDay[day] || [];
                                const canMoveUp = index > 0;
                                const canMoveDown = index < tasksInDay.length - 1;
                                return (
                                  <SortableTaskCardWrapper key={task.id} task={task}>
                                    <InteractiveTaskCard
                                      task={task}
                                      onToggle={toggleTaskComplete}
                                      onDelete={() => deleteTaskMutation.mutate({ id: task.id, dueDate: task.dueDate })}
                                      onUpdateTitle={(taskId, newTitle) => {
                                        if (!task.isRecurring) {
                                          updateTaskMutation.mutate({
                                            id: taskId,
                                            title: newTitle,
                                          });
                                        }
                                      }}
                                      onOpenNotes={canOpenTaskNotes(task) ? (taskData) => {
                                        setSelectedTaskForNotes(taskData);
                                        setIsNotesModalOpen(true);
                                      } : undefined}
                                      onMoveUp={() => handleMoveTask(task.id, 'up', day)}
                                      onMoveDown={() => handleMoveTask(task.id, 'down', day)}
                                      canMoveUp={canMoveUp && !task.isRecurring}
                                      canMoveDown={canMoveDown && !task.isRecurring}
                                    />
                                  </SortableTaskCardWrapper>
                                );
                              })
                            )}
                          </DroppableDayColumn>
                        </SortableContext>

                        {/* 按鈕 */}
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="mt-auto pt-2">
                          <Button
                            onClick={() =>
                              setInputStates((prev) => ({
                                ...prev,
                                [day]: { isOpen: !prev[day]?.isOpen, value: "" },
                              }))
                            }
                            variant="outline"
                            className="w-full bg-white/2 border-white/20 hover:bg-white/5 text-muted-foreground hover:text-foreground text-xs"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            new task
                          </Button>
                        </motion.div>
                      </Card>
                    </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              <DragOverlay>
                {dragActiveTask ? (
                  <div className="opacity-90 shadow-2xl">
                    <InteractiveTaskCard
                      task={dragActiveTask}
                      onToggle={() => {}}
                      onDelete={() => {}}
                      onUpdateTitle={() => {}}
                    />
                  </div>
                ) : null}
              </DragOverlay>
              </DndContext>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 筆記對話框 */}
      <TaskNotesModal
        isOpen={isNotesModalOpen}
        task={selectedTaskForNotes}
        onClose={() => {
          setIsNotesModalOpen(false);
          setSelectedTaskForNotes(null);
        }}
        onSave={(update) => {
          updateTaskMutation.mutate(update, {
            onSuccess: () => {
              utils.tasks.list.invalidate({ category: activeCategory });
              setIsNotesModalOpen(false);
              setSelectedTaskForNotes(null);
              toast.success('筆記已保存');
            },
            onError: () => {
              toast.error('保存筆記失敗');
            },
          });
        }}
        isSaving={updateTaskMutation.isPending}
      />
    </div>
  );
}
