'use client';

import { useState, useEffect } from 'react';
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Edit2, ArrowLeft, X, Check } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_CN = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

type RecurrenceType = "weekly" | "biweekly";

export default function RecurringTasks() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState<"work" | "life">("work");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as const,
    recurrenceType: "weekly" as RecurrenceType,
    dayOfWeek: 1,
    weekOffset: 0,
  });

  const utils = trpc.useUtils();

  // 獲取週期性任務
  const { data: recurringTasks = [] } = trpc.recurring.list.useQuery({
    category: activeCategory,
  });

  // 建立週期性任務
  const createMutation = trpc.recurring.create.useMutation({
    onSuccess: () => {
      utils.recurring.list.invalidate({ category: activeCategory });
      toast.success("週期性任務已建立");
      setFormData({
        title: "",
        description: "",
        priority: "medium",
        recurrenceType: "weekly",
        dayOfWeek: 1,
        weekOffset: 0,
      });
      setIsAddingNew(false);
    },
    onError: () => {
      toast.error("建立失敗");
    },
  });

  // 刪除週期性任務
  const deleteMutation = trpc.recurring.delete.useMutation({
    onSuccess: () => {
      utils.recurring.list.invalidate({ category: activeCategory });
      toast.success("週期性任務已刪除");
    },
    onError: () => {
      toast.error("刪除失敗");
    },
  });

  // 切換啟用狀態
  const updateMutation = trpc.recurring.update.useMutation({
    onSuccess: () => {
      utils.recurring.list.invalidate({ category: activeCategory });
      toast.success("已更新");
    },
    onError: () => {
      toast.error("更新失敗");
    },
  });

  const handleAddTask = async () => {
    if (!formData.title.trim()) {
      toast.error("請輸入任務標題");
      return;
    }

    createMutation.mutate({
      category: activeCategory,
      ...formData,
    });
  };

  const handleDeleteTask = (id: number) => {
    if (confirm("確定要刪除此週期性任務嗎？")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleToggleActive = (id: number, isActive: boolean) => {
    updateMutation.mutate({
      id,
      isActive: !isActive,
    });
  };

  // 格式化顯示文本
  const formatRecurrence = (task: any) => {
    const dayName = DAYS_OF_WEEK[task.dayOfWeek];
    if (task.recurrenceType === "weekly") {
      return `每週${DAY_NAMES_CN[task.dayOfWeek]}`;
    } else {
      return `雙週${DAY_NAMES_CN[task.dayOfWeek]}`;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Banner */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative w-full bg-gradient-to-b from-[#f5f5f5] via-[#efefef] to-[#e8e8e8] py-20 overflow-hidden"
      >
        {/* 左下角裝飾圓形 */}
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/40 blur-3xl" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-6 flex flex-col items-center justify-center">
          {/* 返回按鈕 */}
          <div className="absolute left-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/')}
              className="text-gray-600 hover:bg-gray-300/30 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>

          {/* 標題 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-7xl font-bold text-gray-700 tracking-wide mb-6" style={{ fontFamily: "'Playfair Display', serif", letterSpacing: '0.08em' }}>
              Recurring Tasks
            </h1>
            <p className="text-2xl text-gray-600 font-light tracking-wide" style={{ fontFamily: "'Playfair Display', serif" }}>設定每週重複的任務</p>
          </motion.div>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto p-6">
        {/* 分類選擇 */}
        <div className="flex gap-4 mb-8 justify-center">
          <Button
            onClick={() => setActiveCategory("work")}
            variant={activeCategory === "work" ? "default" : "outline"}
            className={activeCategory === "work" ? "bg-slate-300/60 text-gray-700 hover:bg-slate-300/70 border-0" : "bg-white border-slate-200 text-gray-700 hover:bg-slate-50"}
          >
            Work
          </Button>
          <Button
            onClick={() => setActiveCategory("life")}
            variant={activeCategory === "life" ? "default" : "outline"}
            className={activeCategory === "life" ? "bg-slate-300/60 text-gray-700 hover:bg-slate-300/70 border-0" : "bg-white border-slate-200 text-gray-700 hover:bg-slate-50"}
          >
            Life
          </Button>
        </div>

        {/* 新增表單 */}
        {isAddingNew && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="p-6 bg-white border-slate-200 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">New Recurring Task</h2>
                <Button
                  onClick={() => setIsAddingNew(false)}
                  variant="ghost"
                  size="sm"
                  className="text-gray-500 hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Title</label>
                  <Input
                    type="text"
                    placeholder="Task title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="bg-white border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Description</label>
                  <Textarea
                    placeholder="Optional description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="bg-white border-slate-200 min-h-[80px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Priority</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-foreground text-sm"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Recurrence</label>
                    <select
                      value={formData.recurrenceType}
                      onChange={(e) => setFormData({ ...formData, recurrenceType: e.target.value as RecurrenceType })}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-foreground text-sm"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Day of Week</label>
                    <select
                      value={formData.dayOfWeek}
                      onChange={(e) => setFormData({ ...formData, dayOfWeek: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-foreground text-sm"
                    >
                      {DAYS_OF_WEEK.map((day, index) => (
                        <option key={index} value={index}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.recurrenceType === "biweekly" && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">Week Offset</label>
                      <select
                        value={formData.weekOffset}
                        onChange={(e) => setFormData({ ...formData, weekOffset: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-foreground text-sm"
                      >
                        <option value={0}>Week 1</option>
                        <option value={1}>Week 2</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleAddTask}
                    disabled={createMutation.isPending}
                    className="flex-1 bg-slate-300/60 text-gray-700 hover:bg-slate-300/70"
                  >
                    Create Task
                  </Button>
                  <Button
                    onClick={() => setIsAddingNew(false)}
                    variant="outline"
                    className="flex-1 bg-white border-slate-200 text-gray-700 hover:bg-slate-50"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* 任務列表 */}
        <div className="space-y-4">
          {recurringTasks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-12 bg-white border-slate-200 text-center">
                <p className="text-gray-600 mb-6 text-lg">No recurring tasks yet</p>
                <Button 
                  onClick={() => setIsAddingNew(true)} 
                  className="gap-2 bg-slate-300/60 text-gray-700 hover:bg-slate-300/70"
                >
                  <Plus className="w-4 h-4" />
                  Add First Task
                </Button>
              </Card>
            </motion.div>
          ) : (
            <>
              {recurringTasks.map((task, index) => (
                <div key={task.id}>
                  <Card className="p-6 bg-white border-slate-200 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-foreground mb-2">{task.title}</h3>
                        <p className="text-sm text-gray-600 mb-2">{formatRecurrence(task)}</p>
                        {task.description && (
                          <p className="text-sm text-gray-600 mb-3 whitespace-pre-wrap">{task.description}</p>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                            task.priority === "high"
                              ? "bg-red-100 text-red-700"
                              : task.priority === "medium"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-green-100 text-green-700"
                          }`}>
                            {task.priority === "high" ? "High" : task.priority === "medium" ? "Medium" : "Low"}
                          </span>
                          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                            task.isActive
                              ? "bg-slate-100 text-slate-700"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {task.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          onClick={() => handleToggleActive(task.id, task.isActive)}
                          variant="outline"
                          size="sm"
                          className="bg-white border-slate-200 text-gray-700 hover:bg-slate-50"
                        >
                          {task.isActive ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          onClick={() => handleDeleteTask(task.id)}
                          variant="outline"
                          size="sm"
                          className="bg-white border-slate-200 text-red-600 hover:bg-red-50 hover:border-red-200"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              ))}

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: recurringTasks.length * 0.05, duration: 0.3 }}
              >
                <Button
                  onClick={() => setIsAddingNew(true)}
                  variant="outline"
                  className="w-full gap-2 mt-4 bg-white border-slate-200 text-gray-700 hover:bg-slate-50"
                >
                  <Plus className="w-4 h-4" />
                  Add New Task
                </Button>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
