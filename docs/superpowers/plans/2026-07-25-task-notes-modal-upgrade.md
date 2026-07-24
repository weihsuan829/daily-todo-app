# 任務筆記視窗升級(改名稱 + 圖片附件)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 升級共用 TaskNotesModal 支援「標題編輯 + 文字筆記 + 圖片附件(選檔上傳與 Ctrl+V 貼上)」,並讓 Eisenhower Matrix 頁面接上這個視窗。

**Architecture:** 純前端改動、後端零改動。可測邏輯抽成 `client/src/lib` 純函式(vitest node 環境),UI 元件在 dev 環境(port 4179)實測。圖片沿用既有 attachments 系統(`POST /api/tasks/:taskId/attachments`、`trpc.attachments.list/delete`)。

**Tech Stack:** React + TypeScript、tRPC、shadcn/ui(Dialog/Input/Textarea/Select/Button)、lucide-react、sonner toast、vitest。

**Spec:** `docs/superpowers/specs/2026-07-25-task-notes-modal-upgrade-design.md`

## Global Constraints

- 分支:`feature/task-notes-modal-upgrade`(已存在,工作樹上已有 TaskNotesModal.tsx 的捲動修正,隨 Task 3 一併提交)。
- 後端與資料庫 schema 一律不改。
- 標題:trim 後為空→不可儲存;上限 255 字(對齊 zod `max(255)`)。
- Matrix(`category === 'eisenhower'`)任務隱藏優先級選單,且儲存 payload 不帶 `priority`。
- 上傳限制 50 MB(沿用後端 multer 限制),超限以 `toast.error` 提示(不用 alert)。
- 測試指令:`pnpm vitest run <file>`;型別檢查:`pnpm check`。
- 每個 Task 結束時 commit,訊息附 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 儲存 payload 組裝 helper(TDD)

**Files:**
- Create: `client/src/lib/taskNotesSave.ts`
- Test: `client/src/lib/taskNotesSave.test.ts`

**Interfaces:**
- Consumes: 無(純函式)。
- Produces: `buildTaskNotesUpdate(task: TaskNotesTarget, form: TaskNotesFormInput): TaskNotesUpdate | null`,以及型別 `TaskNotesTarget { id: number; title: string; category: string | null }`、`TaskNotesFormInput { title: string; notes: string; priority: string }`、`TaskNotesUpdate { id: number; description: string; title?: string; priority?: 'low' | 'medium' | 'high' }`。Task 3 的 modal 與兩個頁面 caller 都依賴這個回傳型別。

- [ ] **Step 1: Write the failing test**

```ts
// client/src/lib/taskNotesSave.test.ts
import { describe, it, expect } from "vitest";
import { buildTaskNotesUpdate } from "./taskNotesSave";

const lifeTask = { id: 1, title: "買菜", category: "life" };
const matrixTask = { id: 2, title: "報價單", category: "eisenhower" };

describe("buildTaskNotesUpdate", () => {
  it("returns null when the trimmed title is empty", () => {
    expect(
      buildTaskNotesUpdate(lifeTask, { title: "   ", notes: "x", priority: "high" })
    ).toBeNull();
  });

  it("omits title when unchanged (after trim)", () => {
    const u = buildTaskNotesUpdate(lifeTask, { title: "  買菜  ", notes: "n", priority: "high" });
    expect(u).toEqual({ id: 1, description: "n", priority: "high" });
  });

  it("includes trimmed title when changed", () => {
    const u = buildTaskNotesUpdate(lifeTask, { title: " 買晚餐 ", notes: "n", priority: "low" });
    expect(u).toEqual({ id: 1, title: "買晚餐", description: "n", priority: "low" });
  });

  it("caps the title at 255 characters (trim first)", () => {
    const long = "  " + "a".repeat(300) + "  ";
    const u = buildTaskNotesUpdate(lifeTask, { title: long, notes: "", priority: "medium" });
    expect(u?.title).toHaveLength(255);
  });

  it("omits priority for eisenhower tasks", () => {
    const u = buildTaskNotesUpdate(matrixTask, { title: "報價單", notes: "n", priority: "high" });
    expect(u).toEqual({ id: 2, description: "n" });
  });

  it("keeps empty notes as empty string (clearing notes is allowed)", () => {
    const u = buildTaskNotesUpdate(lifeTask, { title: "買菜", notes: "", priority: "medium" });
    expect(u).toEqual({ id: 1, description: "", priority: "medium" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run client/src/lib/taskNotesSave.test.ts`
Expected: FAIL —— `Cannot find module './taskNotesSave'`(或同義的解析錯誤)。

- [ ] **Step 3: Write minimal implementation**

```ts
// client/src/lib/taskNotesSave.ts
export interface TaskNotesTarget {
  id: number;
  title: string;
  category: string | null;
}

export interface TaskNotesFormInput {
  title: string;
  notes: string;
  priority: string;
}

export interface TaskNotesUpdate {
  id: number;
  description: string;
  title?: string;
  priority?: "low" | "medium" | "high";
}

export function buildTaskNotesUpdate(
  task: TaskNotesTarget,
  form: TaskNotesFormInput
): TaskNotesUpdate | null {
  const trimmed = form.title.trim().slice(0, 255);
  if (!trimmed) return null;

  const update: TaskNotesUpdate = { id: task.id, description: form.notes };
  if (trimmed !== task.title) update.title = trimmed;
  if (task.category !== "eisenhower") {
    update.priority = form.priority as TaskNotesUpdate["priority"];
  }
  return update;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run client/src/lib/taskNotesSave.test.ts`
Expected: PASS(6 tests)。

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/taskNotesSave.ts client/src/lib/taskNotesSave.test.ts
git commit -m "feat(notes-modal): add buildTaskNotesUpdate save-payload helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 剪貼簿圖片萃取 helper(TDD)

**Files:**
- Create: `client/src/lib/clipboardImage.ts`
- Test: `client/src/lib/clipboardImage.test.ts`

**Interfaces:**
- Consumes: 無(純函式;不觸碰 DOM 型別,方便在 vitest node 環境測試)。
- Produces: `findImageItemIndex(items: ArrayLike<{ kind: string; type: string }>): number`(找不到回 -1)、`screenshotFileName(mimeType: string, timestamp: number): string`(例:`screenshot-1753400000000.png`)。Task 4 的貼上處理依賴這兩個函式。

- [ ] **Step 1: Write the failing test**

```ts
// client/src/lib/clipboardImage.test.ts
import { describe, it, expect } from "vitest";
import { findImageItemIndex, screenshotFileName } from "./clipboardImage";

describe("findImageItemIndex", () => {
  it("returns the index of the first image file item", () => {
    const items = [
      { kind: "string", type: "text/plain" },
      { kind: "file", type: "image/png" },
      { kind: "file", type: "image/jpeg" },
    ];
    expect(findImageItemIndex(items)).toBe(1);
  });

  it("returns -1 when there is no image item", () => {
    expect(findImageItemIndex([])).toBe(-1);
    expect(
      findImageItemIndex([
        { kind: "string", type: "text/plain" },
        { kind: "file", type: "application/pdf" },
      ])
    ).toBe(-1);
  });

  it("ignores non-file items even with an image mime type", () => {
    expect(findImageItemIndex([{ kind: "string", type: "image/png" }])).toBe(-1);
  });
});

describe("screenshotFileName", () => {
  it("derives the extension from the mime subtype", () => {
    expect(screenshotFileName("image/png", 1753400000000)).toBe("screenshot-1753400000000.png");
    expect(screenshotFileName("image/jpeg", 1)).toBe("screenshot-1.jpeg");
  });

  it("strips svg+xml style suffixes and falls back to png", () => {
    expect(screenshotFileName("image/svg+xml", 2)).toBe("screenshot-2.svg");
    expect(screenshotFileName("", 3)).toBe("screenshot-3.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run client/src/lib/clipboardImage.test.ts`
Expected: FAIL —— `Cannot find module './clipboardImage'`。

- [ ] **Step 3: Write minimal implementation**

```ts
// client/src/lib/clipboardImage.ts
export function findImageItemIndex(
  items: ArrayLike<{ kind: string; type: string }>
): number {
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === "file" && items[i].type.startsWith("image/")) return i;
  }
  return -1;
}

export function screenshotFileName(mimeType: string, timestamp: number): string {
  const ext = mimeType.split("/")[1]?.split("+")[0] || "png";
  return `screenshot-${timestamp}.${ext}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run client/src/lib/clipboardImage.test.ts`
Expected: PASS(5 tests)。

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/clipboardImage.ts client/src/lib/clipboardImage.test.ts
git commit -m "feat(notes-modal): add clipboard-image extraction helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: TaskNotesModal 標題編輯 + 條件式優先級 + 新 onSave 介面(含 TaskList caller 同步)

**Files:**
- Modify: `client/src/components/TaskNotesModal.tsx`(整檔改寫,下方為完整內容)
- Modify: `client/src/pages/TaskList.tsx:758-785`(TaskNotesModal 的 onSave callback)
- Test: 手動 —— `pnpm check` + 既有測試全綠(此 task 無新純邏輯;payload 邏輯已在 Task 1 覆蓋)

**Interfaces:**
- Consumes: Task 1 的 `buildTaskNotesUpdate` / `TaskNotesUpdate`。
- Produces: `TaskNotesModal` 新 props:`task` 增加 `category: string | null` 欄位;`onSave: (update: TaskNotesUpdate) => void`(取代原本的 `(taskId, description, priority?)`)。Task 5 的 Matrix caller 依賴此介面。

**注意:** 工作樹上已有本檔的未提交修改(DialogContent 加了 `max-h-[85vh] grid-rows-[auto_1fr_auto] overflow-hidden`、內容區加了 `overflow-y-auto min-h-0`)——下方完整內容已包含它,本 task 的 commit 會一併收錄。

- [ ] **Step 1: 改寫 TaskNotesModal.tsx(完整內容如下)**

```tsx
// client/src/components/TaskNotesModal.tsx
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
```

(說明:原本未使用的 `getPriorityLabel` / `getPriorityColor` 兩個函式與 `toast` import 一併移除;標題顯示改為固定「編輯任務」,任務名稱移到輸入框。)

- [ ] **Step 2: 更新 TaskList.tsx 的 onSave callback**

把 `client/src/pages/TaskList.tsx` 中 `<TaskNotesModal ... />` 的 `onSave` 從舊簽名改為:

```tsx
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
```

(`selectedTaskForNotes` 是整個 task 物件,已含 `category` 與 `updatedAt`,不需其他改動。)

- [ ] **Step 3: 型別檢查與既有測試**

Run: `pnpm check && pnpm vitest run`
Expected: `tsc` 無錯誤;所有測試 PASS。

- [ ] **Step 4: Commit**

```bash
git add client/src/components/TaskNotesModal.tsx client/src/pages/TaskList.tsx
git commit -m "feat(notes-modal): editable title, hide priority for matrix tasks, new onSave contract

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: TaskNotesModal 圖片附件區(上傳 + 貼上 + 縮圖 + 刪除)

**Files:**
- Modify: `client/src/components/TaskNotesModal.tsx`(在 Task 3 的版本上增量修改,下方列出每一段要加的完整程式碼)

**Interfaces:**
- Consumes: Task 2 的 `findImageItemIndex` / `screenshotFileName`;既有 `trpc.attachments.list` / `trpc.attachments.delete`;既有 `POST /api/tasks/:taskId/attachments`。
- Produces: 無新對外介面(props 不變)。

- [ ] **Step 1: 加 imports 與上傳邏輯**

檔頭 imports 增加:

```tsx
import { useState, useEffect, useRef } from 'react';
import { ImagePlus, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { findImageItemIndex, screenshotFileName } from '@/lib/clipboardImage';
```

元件內(`const isMatrixTask = ...` 之後)增加:

```tsx
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
```

檔案底部(元件外)加 helper:

```tsx
function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}
```

- [ ] **Step 2: DialogContent 接上 onPaste**

```tsx
      <DialogContent
        onPaste={handlePaste}
        className="sm:max-w-[500px] bg-white border-slate-200 shadow-lg max-h-[85vh] grid-rows-[auto_1fr_auto] overflow-hidden"
      >
```

- [ ] **Step 3: 在 Notes 區塊與 Last Edit Time 之間插入圖片區 JSX**

```tsx
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
```

- [ ] **Step 4: 型別檢查與既有測試**

Run: `pnpm check && pnpm vitest run`
Expected: `tsc` 無錯誤;所有測試 PASS。

- [ ] **Step 5: Commit**

```bash
git add client/src/components/TaskNotesModal.tsx
git commit -m "feat(notes-modal): image attachments — file upload, clipboard paste, thumbnails, delete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Eisenhower Matrix 頁面接上筆記視窗

**Files:**
- Modify: `client/src/pages/EisenhowerMatrix.tsx`

**Interfaces:**
- Consumes: Task 3/4 的 `TaskNotesModal`(props:`isOpen`、`task`(含 `category`)、`onClose`、`onSave: (update: TaskNotesUpdate) => void`、`isSaving`)。
- Produces: 無。

- [ ] **Step 1: 加 imports 與 state**

imports 增加:

```tsx
import { Plus, X, FileText } from "lucide-react";
import { TaskNotesModal } from "@/components/TaskNotesModal";
```

元件內 state(`newTasks` 之後)增加:

```tsx
  const [notesTask, setNotesTask] = useState<(typeof tasks)[number] | null>(null);
```

(放在 `tasks` query 宣告之後,以便取得元素型別。)

- [ ] **Step 2: 任務列加開啟入口與筆記指示圖示**

把任務列 JSX(原 `{task.title}` 的 span 與刪除按鈕)改為:

```tsx
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
```

- [ ] **Step 3: 頁尾加 TaskNotesModal 實例**

在最外層 `</div>`(`space-y-6` 容器結尾)之前加入:

```tsx
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
```

(`updateTaskMutation` 既有的 `onSuccess` 已 invalidate `tasks.list`(eisenhower)與 stats,失敗時已有 toast,這裡只需關窗與成功提示。)

- [ ] **Step 4: 型別檢查與既有測試**

Run: `pnpm check && pnpm vitest run`
Expected: `tsc` 無錯誤;所有測試 PASS。
(若 `notesTask` 的 `(typeof tasks)[number]` 與 modal 的 task prop 型別不合 —— 例如 `updatedAt` 為 string —— 以 modal prop 需求為準微調 modal 的 task 型別或傳入前轉型,不可用 `any` 掩蓋。)

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/EisenhowerMatrix.tsx
git commit -m "feat(matrix): open shared task notes modal from quadrant rows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Dev 環境端到端驗證(browser)

**Files:** 無(驗證;發現 bug 時以 systematic-debugging 處理後補 commit)

**Interfaces:** 無。

前置:dev 容器已在跑(`docker compose up -d`,http://localhost:4179,程式碼 volume 掛載即時生效)。

- [ ] **Step 1: Matrix 驗證**

用 browser 開 http://localhost:4179 → Eisenhower Matrix:
1. 點任一任務文字 → 視窗開啟、標題為「編輯任務」、**沒有**優先級選單。
2. 改任務名稱 → 保存 → 列表名稱更新。
3. 清空名稱 → 保存鈕 disabled。
4. 寫筆記 → 保存 → 任務文字旁出現小 FileText 圖示;重開視窗筆記仍在。
5. 上傳一張圖片 → 縮圖出現;重開視窗縮圖仍在(DB + uploads 皆落地)。
6. hover 縮圖 → 刪除 → 縮圖消失。
7. (貼上功能)用 javascript_tool 或手動確認 onPaste 路徑至少不報錯;貼上實測需真剪貼簿,列為使用者驗收項。

- [ ] **Step 2: Work/Life 回歸驗證**

切到 Work 或 Life 分頁:
1. 開任務筆記視窗 → **有**優先級選單、標題可編輯。
2. 改名稱 + 改優先級 + 筆記 → 保存 → 全部生效。
3. 上傳圖片 → 縮圖出現。

- [ ] **Step 3: 完整測試 + 型別檢查最終確認**

Run: `pnpm check && pnpm vitest run`
Expected: 全綠。把證據(指令輸出)貼給使用者。

- [ ] **Step 4: 收尾**

進入 superpowers:requesting-code-review / finishing-a-development-branch 流程。
