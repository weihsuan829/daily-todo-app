import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildTaskNotesUpdate, type TaskNotesUpdate } from '@/lib/taskNotesSave';

interface TaskNotesModalProps {
  isOpen: boolean;
  task: {
    id: number;
    title: string;
    category: string | null;
    priority: string;
    description: string | null;
    updatedAt: Date;
  } | null;
  onClose: () => void;
  onSave: (update: TaskNotesUpdate) => void;
  isSaving?: boolean;
}

export function TaskNotesModal({ isOpen, task, onClose, onSave, isSaving = false }: TaskNotesModalProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('medium');

  const isMatrixTask = task?.category === 'eisenhower';

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.description || '');
      setPriority(task.priority || 'medium');
    }
  }, [task, isOpen]);

  const pendingUpdate = task ? buildTaskNotesUpdate(task, { title, notes, priority }) : null;

  const handleSave = () => {
    if (pendingUpdate) onSave(pendingUpdate);
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
      <DialogContent className="sm:max-w-[500px] bg-white border-slate-200 shadow-lg max-h-[85vh] grid-rows-[auto_1fr_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-gray-800 font-semibold">編輯任務</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto min-h-0">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              任務名稱
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              placeholder="任務名稱"
              className="bg-white border-slate-200 text-gray-800 focus-visible:border-slate-400 focus-visible:ring-slate-200"
            />
          </div>

          {/* Priority Selector (hidden for eisenhower tasks) */}
          {!isMatrixTask && (
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
          )}

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
            disabled={isSaving || !pendingUpdate}
            className="bg-slate-400 text-white hover:bg-slate-500"
          >
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
