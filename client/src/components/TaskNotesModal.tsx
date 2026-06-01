import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface TaskNotesModalProps {
  isOpen: boolean;
  task: {
    id: number;
    title: string;
    priority: string;
    description: string | null;
    updatedAt: Date;
  } | null;
  onClose: () => void;
  onSave: (taskId: number, description: string, priority?: string) => void;
  isSaving?: boolean;
}

export function TaskNotesModal({ isOpen, task, onClose, onSave, isSaving = false }: TaskNotesModalProps) {
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('medium');

  useEffect(() => {
    if (task) {
      setNotes(task.description || '');
      setPriority(task.priority || 'medium');
    }
  }, [task, isOpen]);

  const handleSave = () => {
    if (task) {
      onSave(task.id, notes, priority);
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return '高優先級';
      case 'medium':
        return '中優先級';
      case 'low':
        return '低優先級';
      default:
        return priority;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-rose-700'; // 乾燥玫瑰色（深紅）
      case 'medium':
        return 'text-amber-700'; // 深棕/深金色
      case 'low':
        return 'text-teal-700'; // 深綠/深青色
      default:
        return 'text-gray-500';
    }
  };

  const formatLastEditTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '剛剛';
    if (minutes < 60) return `${minutes} 分鐘前`;
    if (hours < 24) return `${hours} 小時前`;
    if (days < 7) return `${days} 天前`;
    
    return new Date(date).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-white border-slate-200 shadow-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="text-gray-800 font-semibold">{task?.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Priority Selector */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              優先級
            </label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-full bg-gray-50 border-slate-200 text-gray-700 hover:bg-gray-100">
                <SelectValue placeholder="選擇優先級" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="high" className="!bg-gray-100 focus:!bg-gray-100 data-[state=checked]:!bg-gray-100">
                  <span className="text-rose-700">● 高優先級</span>
                </SelectItem>
                <SelectItem value="medium" className="!bg-gray-100 focus:!bg-gray-100 data-[state=checked]:!bg-gray-100">
                  <span className="text-amber-700">● 中優先級</span>
                </SelectItem>
                <SelectItem value="low" className="!bg-gray-100 focus:!bg-gray-100 data-[state=checked]:!bg-gray-100">
                  <span className="text-teal-700">○ 低優先級</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              筆記
            </label>
            <Textarea
              placeholder="記錄該任務的詳細筆記..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[200px] resize-none bg-white border-slate-200 text-gray-700 placeholder:text-gray-400 focus-visible:border-slate-400 focus-visible:ring-slate-200"
            />
          </div>

          {/* Last Edit Time */}
          {task && (
            <div className="text-xs text-gray-500">
              最後編輯：{formatLastEditTime(task.updatedAt)}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isSaving}
            className="bg-white border-slate-200 text-gray-700 hover:bg-slate-50"
          >
            取消
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="bg-slate-400 text-white hover:bg-slate-500"
          >
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
