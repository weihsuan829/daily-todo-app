import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImagePlus, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { buildTaskNotesUpdate, type TaskNotesUpdate } from '@/lib/taskNotesSave';
import { trpc } from '@/lib/trpc';
import { findImageItemIndex, screenshotFileName } from '@/lib/clipboardImage';

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

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const attachmentsQuery = trpc.attachments.list.useQuery(
    { taskId: task?.id ?? 0 },
    { enabled: isOpen && !!task }
  );
  const attachmentList = attachmentsQuery.data ?? [];

  const deleteAttachmentMutation = trpc.attachments.delete.useMutation({
    onSuccess: () => {
      if (task) utils.attachments.list.invalidate({ taskId: task.id });
    },
    onError: () => toast.error('刪除圖片失敗'),
  });

  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

  async function uploadImage(file: File) {
    if (!task) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`「${file.name}」超過 50 MB，無法上傳`);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/tasks/${task.id}/attachments`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      utils.attachments.list.invalidate({ taskId: task.id });
    } catch {
      toast.error('圖片上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void uploadImage(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const idx = findImageItemIndex(items);
    if (idx === -1) return;
    const file = items[idx].getAsFile();
    if (!file) return;
    e.preventDefault();
    const named = new File([file], screenshotFileName(file.type, Date.now()), { type: file.type });
    void uploadImage(named);
  }

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
      <DialogContent
        onPaste={handlePaste}
        className="sm:max-w-[500px] bg-white border-slate-200 shadow-lg max-h-[85vh] grid-rows-[auto_1fr_auto] overflow-hidden"
      >
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

          {/* Images */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              圖片{attachmentList.length > 0 && `（${attachmentList.length}）`}
            </label>

            {attachmentList.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {attachmentList.map((a) =>
                  isImageFile(a.fileName) ? (
                    <div key={a.id} className="relative group rounded border border-slate-200 overflow-hidden">
                      <a href={a.fileUrl} target="_blank" rel="noopener noreferrer">
                        <img src={a.fileUrl} alt={a.fileName} className="w-full h-24 object-cover" />
                      </a>
                      <button
                        onClick={() => deleteAttachmentMutation.mutate({ id: a.id })}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition bg-white/90 rounded p-0.5 text-red-500 hover:bg-white"
                        title="刪除圖片"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div key={a.id} className="relative group col-span-3 flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm">
                      <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <a
                        href={a.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="flex-1 text-blue-600 hover:underline truncate"
                      >
                        {a.fileName}
                      </a>
                      <button
                        onClick={() => deleteAttachmentMutation.mutate({ id: a.id })}
                        className="opacity-0 group-hover:opacity-100 transition p-0.5 text-red-500"
                        title="刪除附件"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            <label className="inline-flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-slate-200 rounded-md text-gray-700 transition">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading || !task}
              />
              <ImagePlus className="w-4 h-4" />
              {uploading ? '上傳中...' : '上傳圖片'}
            </label>
            <p className="text-xs text-gray-400 mt-1">也可以直接在此視窗按 Ctrl+V 貼上截圖</p>
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

function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}
