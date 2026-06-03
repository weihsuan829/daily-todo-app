import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Trash2, X, Upload, Paperclip } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import type { Task } from "../../../../drizzle/schema";
import TagChips, { type TagLike } from "./TagChips";
import TagPicker from "./TagPicker";
import ColorPicker from "./ColorPicker";

// ── helpers ──────────────────────────────────────────────────────────────────

function dateToInput(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return format(d, "yyyy-MM-dd");
  } catch {
    return "";
  }
}

function inputToDate(s: string): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

function isPdfFile(name: string): boolean {
  return /\.pdf$/i.test(name);
}

const STATUS_OPTIONS = [
  { value: "todo", label: "待辦" },
  { value: "in_progress", label: "進行中" },
  { value: "done", label: "完成" },
  { value: "archived", label: "封存" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "medium", label: "普通" },
  { value: "high", label: "高" },
  { value: "urgent", label: "緊急" },
] as const;

// ── types ─────────────────────────────────────────────────────────────────────

interface Props {
  task: Task;
  projectId: number;
  allTasks: Task[];
  tagsById?: Record<number, TagLike>;
  tagIdsByTask?: Map<number, number[]>;
  onClose: () => void;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function TaskDetailDrawer({
  task,
  projectId,
  allTasks,
  tagsById = {},
  tagIdsByTask,
  onClose,
}: Props) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // ── mutations ──────────────────────────────────────────────────────────────
  const update = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });
  const del = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.listByProject.invalidate({ projectId });
      onClose();
    },
  });
  const createSubtask = trpc.tasks.create.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  // ── queries ────────────────────────────────────────────────────────────────
  const taskId = task.id;
  const attachmentsQuery = trpc.attachments.list.useQuery({ taskId });
  const commentsQuery = trpc.comments.list.useQuery({ taskId });

  const deleteAttachment = trpc.attachments.delete.useMutation({
    onSuccess: () => utils.attachments.list.invalidate({ taskId }),
  });
  const createComment = trpc.comments.create.useMutation({
    onSuccess: () => utils.comments.list.invalidate({ taskId }),
  });
  const deleteComment = trpc.comments.delete.useMutation({
    onSuccess: () => utils.comments.list.invalidate({ taskId }),
  });

  // ── tags ───────────────────────────────────────────────────────────────────
  const tagsQuery = trpc.tags.list.useQuery({ projectId });
  const allTags: TagLike[] = tagsQuery.data ?? [];
  const selectedTagIds = tagIdsByTask?.get(task.id) ?? [];

  // ── local state ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [startDateStr, setStartDateStr] = useState(dateToInput(task.startDate));
  const [dueDateStr, setDueDateStr] = useState(dateToInput(task.dueDate));
  const [color, setColor] = useState(task.color ?? "");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── derived ────────────────────────────────────────────────────────────────
  const subtasks = allTasks.filter((t) => t.parentTaskId === task.id);
  const attachmentList = attachmentsQuery.data ?? [];
  const commentList = commentsQuery.data ?? [];

  // ── handlers ───────────────────────────────────────────────────────────────

  function handleTitleBlur() {
    const t = title.trim();
    if (t && t !== task.title) {
      update.mutate({ id: taskId, title: t });
    }
  }

  function handleTitleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  }

  function handleStatusChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value as Task["status"];
    setStatus(v);
    update.mutate({ id: taskId, status: v });
  }

  function handlePriorityChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value as Task["priority"];
    setPriority(v);
    update.mutate({ id: taskId, priority: v });
  }

  function handleStartDateChange(e: ChangeEvent<HTMLInputElement>) {
    const s = e.target.value;
    setStartDateStr(s);
    update.mutate({ id: taskId, startDate: inputToDate(s) });
  }

  function handleDueDateChange(e: ChangeEvent<HTMLInputElement>) {
    const s = e.target.value;
    setDueDateStr(s);
    update.mutate({ id: taskId, dueDate: inputToDate(s) });
  }

  function handleDescriptionBlur() {
    if (description !== (task.description ?? "")) {
      update.mutate({ id: taskId, description });
    }
  }

  function handleSubtaskKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const t = newSubtaskTitle.trim();
    if (!t) return;
    createSubtask.mutate({
      title: t,
      parentTaskId: taskId,
      projectId,
      status: "todo",
      category: null,
    });
    setNewSubtaskTitle("");
  }

  function handleToggleSubtask(sub: Task) {
    const nextStatus: Task["status"] = sub.status === "done" ? "todo" : "done";
    update.mutate({ id: sub.id, status: nextStatus });
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const MAX = 50 * 1024 * 1024;
    if (file.size > MAX) {
      alert(`「${file.name}」超過 50 MB，無法上傳`);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      utils.attachments.list.invalidate({ taskId });
    } catch {
      // silent
    } finally {
      setUploading(false);
    }
  }

  function handleCommentSubmit() {
    const c = newComment.trim();
    if (!c) return;
    createComment.mutate({ taskId, content: c });
    setNewComment("");
  }

  function handleCommentKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleCommentSubmit();
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* panel */}
      <div
        className="fixed right-0 top-0 h-screen w-[480px] bg-card border-l border-border overflow-y-auto z-50 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 1. Header ── */}
        <header className="sticky top-0 bg-card z-10 px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">任務 #{task.id}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => del.mutate({ id: taskId })}
              disabled={del.isPending}
              className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition"
              title="刪除任務"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground rounded transition"
              title="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="p-5 space-y-5 flex-1">
          {/* ── 2. Title ── */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKey}
            className="w-full text-xl font-semibold bg-transparent border-0 outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground"
            placeholder="任務標題"
          />

          {/* ── 3. Status + Priority ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">狀態</label>
              <select
                value={status}
                onChange={handleStatusChange}
                className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background text-foreground"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">優先級</label>
              <select
                value={priority}
                onChange={handlePriorityChange}
                className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background text-foreground"
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── 4. Dates ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">開始日</label>
              <input
                type="date"
                value={startDateStr}
                onChange={handleStartDateChange}
                className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">截止日</label>
              <input
                type="date"
                value={dueDateStr}
                onChange={handleDueDateChange}
                className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background text-foreground"
              />
            </div>
          </div>

          {/* ── 5. Color ── */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground shrink-0">顏色</label>
            <ColorPicker
              value={color || null}
              onChange={(c) => {
                setColor(c ?? "");
                update.mutate({ id: taskId, color: c });
              }}
            />
            <span className="text-xs text-muted-foreground font-mono">
              {color || "（未設定）"}
            </span>
          </div>

          {/* ── 6. Tags ── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted-foreground">標籤</label>
              <TagPicker
                taskId={taskId}
                projectId={projectId}
                tags={allTags}
                selectedTagIds={selectedTagIds}
                onChanged={() => {
                  utils.tags.taskMap.invalidate({ projectId });
                  utils.tasks.listByProject.invalidate({ projectId });
                }}
              />
            </div>
            {selectedTagIds.length === 0 ? (
              <span className="text-xs text-muted-foreground">沒有標籤</span>
            ) : (
              <TagChips tagIds={selectedTagIds} tagsById={tagsById} />
            )}
          </div>

          {/* ── 7. Description ── */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">說明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              rows={4}
              placeholder="補充細節、需求、連結..."
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground resize-none outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>

          {/* ── 8. Subtasks ── */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">
              子任務
              {subtasks.length > 0 && (
                <span className="ml-1">
                  （{subtasks.filter((s) => s.status === "done").length}/{subtasks.length}）
                </span>
              )}
            </div>
            {subtasks.length > 0 && (
              <ul className="space-y-1 mb-2">
                {subtasks.map((sub) => (
                  <li
                    key={sub.id}
                    className="flex items-center gap-2 text-sm py-1 px-2 hover:bg-accent rounded group"
                  >
                    <button
                      onClick={() => handleToggleSubtask(sub)}
                      className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${
                        sub.status === "done"
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border hover:border-primary"
                      }`}
                      title={sub.status === "done" ? "標記為未完成" : "標記為完成"}
                    >
                      {sub.status === "done" && (
                        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                          <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <span
                      className={`flex-1 truncate ${
                        sub.status === "done" ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {sub.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <input
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={handleSubtaskKey}
              placeholder="＋ 新增子任務（Enter 確認）"
              className="w-full text-sm px-2 py-1.5 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring bg-background text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* ── 9. Attachments ── */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">
              附件{attachmentList.length > 0 && `（${attachmentList.length}）`}
            </div>

            {attachmentList.length > 0 && (
              <ul className="space-y-2 mb-3">
                {attachmentList.map((a) => {
                  const isImg = isImageFile(a.fileName);
                  const isPdf = isPdfFile(a.fileName);
                  return (
                    <li
                      key={a.id}
                      className="border border-border rounded-md overflow-hidden group"
                    >
                      {/* preview */}
                      {isImg && (
                        <a href={a.fileUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={a.fileUrl}
                            alt={a.fileName}
                            className="w-full max-h-48 object-cover"
                          />
                        </a>
                      )}
                      {isPdf && (
                        <iframe
                          src={a.fileUrl}
                          title={a.fileName}
                          className="w-full h-48 border-0"
                        />
                      )}
                      {/* row */}
                      <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <a
                          href={a.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="flex-1 text-primary hover:underline truncate"
                        >
                          {a.fileName}
                        </a>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatBytes(a.fileSize)}
                        </span>
                        <button
                          onClick={() => deleteAttachment.mutate({ id: a.id })}
                          className="opacity-0 group-hover:opacity-100 transition p-1 text-destructive hover:bg-destructive/10 rounded shrink-0"
                          title="刪除附件"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <label className="inline-flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 bg-accent hover:bg-accent/80 rounded-md text-foreground transition">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                disabled={uploading}
                className="hidden"
              />
              <Upload className="w-4 h-4" />
              <span>{uploading ? "上傳中..." : "上傳檔案"}</span>
              <span className="text-xs text-muted-foreground">（最大 50 MB）</span>
            </label>
          </div>

          {/* ── 10. Comments ── */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">
              留言{commentList.length > 0 && `（${commentList.length}）`}
            </div>

            {commentList.length > 0 && (
              <ul className="space-y-3 mb-3">
                {commentList.map((c) => (
                  <li key={c.id} className="bg-muted/40 rounded-md p-3 group">
                    <div className="flex items-start justify-between mb-1 gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-foreground">
                          {c.authorName ?? "用戶"}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(c.createdAt).toLocaleString("zh-TW")}
                        </span>
                      </div>
                      {user && c.userId === user.id && (
                        <button
                          onClick={() => deleteComment.mutate({ id: c.id })}
                          className="opacity-0 group-hover:opacity-100 transition p-1 text-destructive hover:bg-destructive/10 rounded shrink-0"
                          title="刪除留言"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={handleCommentKey}
                placeholder="寫下你的想法..."
                className="flex-1 text-sm px-3 py-2 border border-border rounded-md outline-none focus:ring-2 focus:ring-ring bg-background text-foreground placeholder:text-muted-foreground"
              />
              <button
                onClick={handleCommentSubmit}
                disabled={!newComment.trim() || createComment.isPending}
                className="text-sm px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition"
              >
                送出
              </button>
            </div>
          </div>

          {/* ── footer timestamps ── */}
          <div className="text-xs text-muted-foreground pt-3 border-t border-border">
            建立於 {new Date(task.createdAt).toLocaleString("zh-TW")} ・ 最後更新{" "}
            {new Date(task.updatedAt).toLocaleString("zh-TW")}
          </div>
        </div>
      </div>
    </>
  );
}
