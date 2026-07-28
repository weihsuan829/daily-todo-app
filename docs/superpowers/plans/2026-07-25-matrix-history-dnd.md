# Matrix 已完成歷史區 + 拖拉排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eisenhower Matrix 打勾完成的任務移到矩陣下方「已完成」區(可復原、確認後刪除),且任務可拖拉排序(同象限上下排、跨象限移動)。

**Architecture:** 純前端改動、後端零改動。象限設定抽到 `client/src/lib/quadrants.ts` 單一來源;拖拉/分組計算抽成 `client/src/lib/matrixDnd.ts` 純函式(vitest node TDD);歷史區為獨立元件 `CompletedSection`;頁面用 @dnd-kit(TaskList 頁同款模式)接手拖拉,順序用現有 `tasks.reorderDay`、象限/完成狀態用現有 `tasks.update`、刪除用現有 `tasks.delete`。

**Tech Stack:** React + TypeScript、tRPC、@dnd-kit/core + @dnd-kit/sortable(已安裝)、shadcn/ui(Card / AlertDialog)、lucide-react、sonner、vitest。

**Spec:** `docs/superpowers/specs/2026-07-25-matrix-history-dnd-design.md`

## Global Constraints

- 分支:`feature/task-notes-modal-upgrade`(與筆記視窗功能同分支堆疊,使用者已確認)。
- 資料庫 schema 一律不改;後端唯一允許的改動是 Task 3 的 `tasks.update` zod schema 加 `quadrant` 欄位(一行),其餘 server 檔案不動。
- 拖拉觸發距離 8px(保留點擊開筆記視窗與 checkbox 行為)。
- 跨象限移動時 priority 同步為目標象限預設值:urgent-important→high、not-urgent-important→medium、urgent-not-important→medium、not-urgent-not-important→low。
- 刪除必須經 AlertDialog 確認;歷史區任務不可拖拉、不開筆記視窗。
- Matrix 的 tasks.list query key 是 `{ category: "eisenhower", date: selectedDate }`——樂觀更新 setData 必須用同一組 key。
- 測試指令:`pnpm vitest run <file>`;型別檢查:`pnpm check`。已知 4 個 pre-existing DB 連線測試失敗(server/tasks.test.ts、server/recurring-deletion.test.ts)不在本功能範圍。
- 每個 Task 結束時 commit,訊息附 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 象限設定單一來源 + 拖拉/分組純函式(TDD)

**Files:**
- Create: `client/src/lib/quadrants.ts`
- Create: `client/src/lib/matrixDnd.ts`
- Test: `client/src/lib/matrixDnd.test.ts`

**Interfaces:**
- Consumes: 無(純函式/純設定)。
- Produces(後續 Task 依賴,簽名照抄):
  - `quadrants.ts`:`type Quadrant`(四個字串字面值 union)、`interface QuadrantConfig { key: Quadrant; label: string; description: string; bgColor: string; borderColor: string; topBarColor: string; priority: "high" | "medium" | "low"; dotClass: string }`、`const QUADRANTS: QuadrantConfig[]`、`const QUADRANT_MAP: Record<Quadrant, QuadrantConfig>`。
  - `matrixDnd.ts`:`splitByCompletion<T extends {completed: boolean}>(tasks: T[]): { active: T[]; completed: T[] }`、`computeQuadrantReorder<T extends {id: number}>(quadrantTasks: T[], activeId: number, overId: number): number[] | null`、`quadrantDefaultPriority(quadrant: Quadrant): "high" | "medium" | "low"`、`computeCrossQuadrantMove(activeId: number, targetQuadrant: Quadrant, targetTaskIds: number[], overId: number | null): { update: { id: number; quadrant: Quadrant; priority: "high" | "medium" | "low" }; orderedIds: number[] }`。

- [ ] **Step 1: 建立 quadrants.ts(純設定,無測試,內容自現頁面搬移 + 加 dotClass)**

```ts
// client/src/lib/quadrants.ts
export type Quadrant =
  | "urgent-important"
  | "not-urgent-important"
  | "urgent-not-important"
  | "not-urgent-not-important";

export interface QuadrantConfig {
  key: Quadrant;
  label: string;
  description: string;
  bgColor: string;
  borderColor: string;
  topBarColor: string;
  priority: "high" | "medium" | "low";
  dotClass: string;
}

export const QUADRANTS: QuadrantConfig[] = [
  {
    key: "urgent-important",
    label: "緊急且重要",
    description: "立即處理",
    bgColor: "bg-white",
    borderColor: "border-rose-200",
    topBarColor: "bg-rose-200",
    priority: "high",
    dotClass: "bg-rose-400",
  },
  {
    key: "not-urgent-important",
    label: "不緊急但重要",
    description: "計劃安排",
    bgColor: "bg-white",
    borderColor: "border-slate-200",
    topBarColor: "bg-slate-300",
    priority: "medium",
    dotClass: "bg-slate-400",
  },
  {
    key: "urgent-not-important",
    label: "緊急但不重要",
    description: "委派處理",
    bgColor: "bg-white",
    borderColor: "border-blue-200",
    topBarColor: "bg-blue-300",
    priority: "medium",
    dotClass: "bg-blue-400",
  },
  {
    key: "not-urgent-not-important",
    label: "既不緊急也不重要",
    description: "消除浪費",
    bgColor: "bg-white",
    borderColor: "border-slate-200",
    topBarColor: "bg-slate-300",
    priority: "low",
    dotClass: "bg-slate-300",
  },
];

export const QUADRANT_MAP = Object.fromEntries(
  QUADRANTS.map((q) => [q.key, q])
) as Record<Quadrant, QuadrantConfig>;
```

- [ ] **Step 2: Write the failing test**

```ts
// client/src/lib/matrixDnd.test.ts
import { describe, it, expect } from "vitest";
import {
  splitByCompletion,
  computeQuadrantReorder,
  quadrantDefaultPriority,
  computeCrossQuadrantMove,
} from "./matrixDnd";

describe("splitByCompletion", () => {
  it("splits tasks into active and completed, preserving order", () => {
    const tasks = [
      { id: 1, completed: false },
      { id: 2, completed: true },
      { id: 3, completed: false },
    ];
    const { active, completed } = splitByCompletion(tasks);
    expect(active.map((t) => t.id)).toEqual([1, 3]);
    expect(completed.map((t) => t.id)).toEqual([2]);
  });

  it("handles empty input", () => {
    expect(splitByCompletion([])).toEqual({ active: [], completed: [] });
  });
});

describe("computeQuadrantReorder", () => {
  const tasks = [{ id: 10 }, { id: 20 }, { id: 30 }];

  it("moves an item down past another", () => {
    expect(computeQuadrantReorder(tasks, 10, 30)).toEqual([20, 30, 10]);
  });

  it("moves an item up past another", () => {
    expect(computeQuadrantReorder(tasks, 30, 10)).toEqual([30, 10, 20]);
  });

  it("returns null when active and over are the same", () => {
    expect(computeQuadrantReorder(tasks, 20, 20)).toBeNull();
  });

  it("returns null when either id is not in the list", () => {
    expect(computeQuadrantReorder(tasks, 99, 10)).toBeNull();
    expect(computeQuadrantReorder(tasks, 10, 99)).toBeNull();
  });
});

describe("quadrantDefaultPriority", () => {
  it("maps each quadrant to its default priority", () => {
    expect(quadrantDefaultPriority("urgent-important")).toBe("high");
    expect(quadrantDefaultPriority("not-urgent-important")).toBe("medium");
    expect(quadrantDefaultPriority("urgent-not-important")).toBe("medium");
    expect(quadrantDefaultPriority("not-urgent-not-important")).toBe("low");
  });
});

describe("computeCrossQuadrantMove", () => {
  it("inserts before the hovered task and builds the update payload", () => {
    const { update, orderedIds } = computeCrossQuadrantMove(5, "urgent-important", [10, 20], 20);
    expect(update).toEqual({ id: 5, quadrant: "urgent-important", priority: "high" });
    expect(orderedIds).toEqual([10, 5, 20]);
  });

  it("appends when dropped on the quadrant container (overId null)", () => {
    const { orderedIds } = computeCrossQuadrantMove(5, "not-urgent-not-important", [10, 20], null);
    expect(orderedIds).toEqual([10, 20, 5]);
  });

  it("appends when overId is not found in the target list", () => {
    const { orderedIds } = computeCrossQuadrantMove(5, "urgent-not-important", [10, 20], 99);
    expect(orderedIds).toEqual([10, 20, 5]);
  });

  it("works for an empty target quadrant", () => {
    const { update, orderedIds } = computeCrossQuadrantMove(5, "not-urgent-important", [], null);
    expect(update.priority).toBe("medium");
    expect(orderedIds).toEqual([5]);
  });

  it("ignores the active id if it already appears in the target list", () => {
    const { orderedIds } = computeCrossQuadrantMove(5, "urgent-important", [10, 5, 20], 10);
    expect(orderedIds).toEqual([5, 10, 20]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run client/src/lib/matrixDnd.test.ts`
Expected: FAIL —— `Cannot find module './matrixDnd'`。

- [ ] **Step 4: Write minimal implementation**

```ts
// client/src/lib/matrixDnd.ts
import { QUADRANT_MAP, type Quadrant } from "./quadrants";

export function splitByCompletion<T extends { completed: boolean }>(
  tasks: T[]
): { active: T[]; completed: T[] } {
  return {
    active: tasks.filter((t) => !t.completed),
    completed: tasks.filter((t) => t.completed),
  };
}

export function computeQuadrantReorder<T extends { id: number }>(
  quadrantTasks: T[],
  activeId: number,
  overId: number
): number[] | null {
  const oldIndex = quadrantTasks.findIndex((t) => t.id === activeId);
  const newIndex = quadrantTasks.findIndex((t) => t.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;
  const ids = quadrantTasks.map((t) => t.id);
  ids.splice(oldIndex, 1);
  ids.splice(newIndex, 0, activeId);
  return ids;
}

export function quadrantDefaultPriority(quadrant: Quadrant): "high" | "medium" | "low" {
  return QUADRANT_MAP[quadrant].priority;
}

export function computeCrossQuadrantMove(
  activeId: number,
  targetQuadrant: Quadrant,
  targetTaskIds: number[],
  overId: number | null
): {
  update: { id: number; quadrant: Quadrant; priority: "high" | "medium" | "low" };
  orderedIds: number[];
} {
  const ids = targetTaskIds.filter((id) => id !== activeId);
  let insertAt = ids.length;
  if (overId !== null) {
    const overIndex = ids.indexOf(overId);
    if (overIndex !== -1) insertAt = overIndex;
  }
  ids.splice(insertAt, 0, activeId);
  return {
    update: { id: activeId, quadrant: targetQuadrant, priority: quadrantDefaultPriority(targetQuadrant) },
    orderedIds: ids,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run client/src/lib/matrixDnd.test.ts`
Expected: PASS(13 tests)。

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/quadrants.ts client/src/lib/matrixDnd.ts client/src/lib/matrixDnd.test.ts
git commit -m "feat(matrix): quadrant config single-source + dnd/completion pure helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: CompletedSection 元件 + 頁面接上(完成移下方、復原、確認刪除)

**Files:**
- Create: `client/src/components/matrix/CompletedSection.tsx`
- Modify: `client/src/pages/EisenhowerMatrix.tsx`

**Interfaces:**
- Consumes: Task 1 的 `splitByCompletion`、`QUADRANTS`、`QUADRANT_MAP`、`Quadrant`、`QuadrantConfig`。
- Produces: `CompletedSection` props:`{ tasks: CompletedTask[]; onRestore: (id: number) => void; onDelete: (task: CompletedTask) => void; isBusy?: boolean }`,其中 `interface CompletedTask { id: number; title: string; quadrant: string | null; dueDate: Date | null }`(export)。Task 3 不改此元件。

- [ ] **Step 1: 建立 CompletedSection.tsx(完整內容)**

```tsx
// client/src/components/matrix/CompletedSection.tsx
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { RotateCcw, Trash2 } from "lucide-react";
import { QUADRANT_MAP, type Quadrant } from "@/lib/quadrants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface CompletedTask {
  id: number;
  title: string;
  quadrant: string | null;
  dueDate: Date | null;
}

interface CompletedSectionProps {
  tasks: CompletedTask[];
  onRestore: (id: number) => void;
  onDelete: (task: CompletedTask) => void;
  isBusy?: boolean;
}

export function CompletedSection({ tasks, onRestore, onDelete, isBusy = false }: CompletedSectionProps) {
  const [pendingDelete, setPendingDelete] = useState<CompletedTask | null>(null);

  return (
    <Card className="border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-gray-700 mb-2">
        已完成{tasks.length > 0 ? `（${tasks.length}）` : ""}
      </h3>

      {tasks.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">尚無已完成任務</p>
      ) : (
        <div className="space-y-1">
          {tasks.map((task) => {
            const meta = task.quadrant ? QUADRANT_MAP[task.quadrant as Quadrant] : undefined;
            return (
              <div
                key={task.id}
                className="flex items-center gap-2 rounded p-2 text-xs group hover:bg-gray-50"
              >
                {meta && (
                  <span className="flex items-center gap-1 shrink-0 text-gray-500">
                    <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                    {meta.label}
                  </span>
                )}
                <span className="flex-1 line-through text-gray-400 truncate">{task.title}</span>
                <button
                  onClick={() => onRestore(task.id)}
                  disabled={isBusy}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title="復原"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                </button>
                <button
                  onClick={() => setPendingDelete(task)}
                  disabled={isBusy}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title="刪除"
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要永久刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingDelete?.title}」將被永久刪除，此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
```

- [ ] **Step 2: 頁面接上——移除本地象限定義、改用 lib、過濾已完成、掛 CompletedSection**

對 `client/src/pages/EisenhowerMatrix.tsx` 做以下修改:

(a) 刪除檔內的 `type Quadrant`、`interface QuadrantConfig`、`const QUADRANTS`(第 11-60 行),imports 改為:

```tsx
import { QUADRANTS, type Quadrant } from "@/lib/quadrants";
import { splitByCompletion } from "@/lib/matrixDnd";
import { CompletedSection } from "@/components/matrix/CompletedSection";
```

(b) query 之後加分組,並讓 `tasksByQuadrant` 只看未完成(原函式改一行):

```tsx
  const { active: activeTasks, completed: completedTasks } = splitByCompletion(tasks);

  // Filter tasks by quadrant (active tasks only; completed ones live in CompletedSection)
  const tasksByQuadrant = (quadrant: Quadrant) =>
    activeTasks.filter((task) => task.quadrant === quadrant);
```

(c) 在四象限 grid 的 `</div>` 之後、`<TaskNotesModal ...>` 之前插入:

```tsx
      {/* 已完成歷史區 */}
      <CompletedSection
        tasks={completedTasks}
        onRestore={(id) =>
          updateTaskMutation.mutate(
            { id, completed: false },
            { onSuccess: () => toast.success("已復原") }
          )
        }
        onDelete={(task) =>
          deleteTaskMutation.mutate({ id: task.id, dueDate: task.dueDate })
        }
        isBusy={updateTaskMutation.isPending || deleteTaskMutation.isPending}
      />
```

(d) 象限列的勾選 checkbox 行為不變(打勾 → `completed: true` → invalidate 後任務自動移到下方)。

- [ ] **Step 3: 型別檢查與既有測試**

Run: `pnpm check && pnpm vitest run`
Expected: `tsc` 無錯誤;除已知 4 個 pre-existing DB 失敗外全 PASS。

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/quadrants.ts client/src/components/matrix/CompletedSection.tsx client/src/pages/EisenhowerMatrix.tsx
git commit -m "feat(matrix): completed-history section with restore and confirmed delete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 拖拉排序(同象限 reorder + 跨象限移動)

**Files:**
- Modify: `server/routers.ts:72-89`(tasks.update input schema 加一行)
- Modify: `client/src/pages/EisenhowerMatrix.tsx`

**Interfaces:**
- Consumes: Task 1 的 `computeQuadrantReorder`、`computeCrossQuadrantMove`;Task 2 後的頁面結構(`activeTasks`、`tasksByQuadrant`);既有 `trpc.tasks.reorderDay`(input `{ orderedIds: number[] }`)、`trpc.tasks.update`。
- Produces: `tasks.update` 新增可選欄位 `quadrant`。

- [ ] **Step 0: 後端——tasks.update schema 加 quadrant 欄位**

`server/routers.ts` 的 `tasks.update` input(`priority` 欄位那行之後)插入一行,與 `tasks.create`(routers.ts:36)的定義一致:

```ts
        quadrant: z.enum(["urgent-important", "not-urgent-important", "urgent-not-important", "not-urgent-not-important"]).optional(),
```

(db 層 `updateTask` 收 `Partial<Omit<Task, ...>>`,`quadrant` 是 tasks 表欄位,直接透傳,不需改。)

- [ ] **Step 1: 加 imports、sensors、reorderDay mutation、drag state**

imports 增加:

```tsx
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
import { computeQuadrantReorder, computeCrossQuadrantMove } from "@/lib/matrixDnd";
```

(`splitByCompletion` 的 import 行改為一併匯入這三個函式。)

元件內(`updateTaskMutation` 之後)加:

```tsx
  const reorderDayMutation = trpc.tasks.reorderDay.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate({ category: "eisenhower" });
    },
    onError: () => {
      utils.tasks.list.invalidate({ category: "eisenhower" });
      toast.error("排序失敗");
    },
  });

  const [dragActiveId, setDragActiveId] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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
      updateTaskMutation.mutate(update, {
        onSuccess: () => {
          reorderDayMutation.mutate({ orderedIds });
        },
      });
    }
  };

  const dragActiveTask = dragActiveId != null ? activeTasks.find((t) => t.id === dragActiveId) : null;
```

- [ ] **Step 2: 加 SortableTaskRow 與 DroppableQuadrant 包裝元件(檔案底部、EisenhowerMatrix 元件之外)**

```tsx
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
```

(檔頭需要 `import type React from "react";` 嗎?——`React.ReactNode`/`React.CSSProperties` 型別用法在本專案 TaskList.tsx 直接使用且 tsconfig 支援,不需額外 import;若 `pnpm check` 報錯,補 `import type * as React from "react";`。)

- [ ] **Step 3: JSX 改造——DndContext 包 grid、每象限 Droppable + SortableContext、任務列包 SortableTaskRow、加 DragOverlay**

(a) 四象限 grid 外層包 DndContext(在 `space-y-6` 容器內):

```tsx
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ...QUADRANTS.map 不變... */}
        </div>

        <DragOverlay>
          {dragActiveTask ? (
            <div className="flex items-center gap-2 rounded bg-white p-2 text-xs shadow-lg border border-slate-200 opacity-90">
              <span className="text-gray-900">{dragActiveTask.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
```

(注意:CompletedSection 移到 `</DndContext>` 之後,維持在最外層 `space-y-6` 容器內。)

(b) 任務列表容器(原 `<div className="mb-3 space-y-2 flex-1">`)改為:

```tsx
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
                      {/* 原本的任務列 div(checkbox / 標題 span / 筆記按鈕 / 刪除按鈕)原封不動放這裡,
                          僅移除原本 div 上的 key={task.id}(key 移到 SortableTaskRow) */}
                    </SortableTaskRow>
                  ))
                )}
              </SortableContext>
            </DroppableQuadrant>
```

任務列 div 完整內容(照抄現行,去掉 key):

```tsx
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
```

- [ ] **Step 4: 型別檢查與既有測試**

Run: `pnpm check && pnpm vitest run`
Expected: `tsc` 無錯誤;除已知 4 個 pre-existing DB 失敗外全 PASS。

- [ ] **Step 5: Commit**

```bash
git add server/routers.ts client/src/pages/EisenhowerMatrix.tsx
git commit -m "feat(matrix): drag-and-drop reordering within and across quadrants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Dev 環境端到端驗證(browser)

**Files:** 無(驗證;發現 bug 以 systematic-debugging 處理後補 commit)

**Interfaces:** 無。

前置:dev 容器已在跑(http://localhost:4179,程式碼 volume 掛載即時生效)。

- [ ] **Step 1: 已完成區驗證**

用 browser 開 http://localhost:4179 → Eisenhower Matrix:
1. 各象限新增測試任務(至少一個象限 2 筆以便排序測試)。
2. 打勾任一任務 → 任務從象限消失,出現在下方「已完成(1)」,帶象限標籤 + 劃線。
3. 點復原鍵 → 任務回到原象限、勾選消失,toast「已復原」。
4. 再完成一筆 → 點刪除鍵 → AlertDialog 出現 → 點「取消」→ 任務還在;再點刪除 → 點「刪除」→ 任務永久消失。
5. 已完成區為空時顯示「尚無已完成任務」。

- [ ] **Step 2: 拖拉驗證**

1. 同象限:把第 2 筆拖到第 1 筆上方 → 順序交換;重新整理頁面順序仍保持(DB 已存)。
2. 跨象限:把任務從「緊急且重要」拖到「不緊急但重要」→ 任務出現在目標象限、原象限消失;用筆記視窗或 DB 確認 priority 變成 medium;重新整理仍在目標象限。
3. 拖到空象限的容器上放下 → 成功移入。
4. 點擊任務文字(不拖)→ 筆記視窗照常開啟;checkbox 照常勾選(8px 觸發距離未破壞點擊)。

- [ ] **Step 3: 回歸與最終確認**

1. Work/Life 分頁拖拉與筆記功能不受影響(改動只在 Matrix 頁與新檔案)。
2. Run: `pnpm check && pnpm vitest run` → 全綠(除已知 4 個 pre-existing DB 失敗)。把證據貼給使用者。
3. 清除 dev DB 測試資料。

- [ ] **Step 4: 收尾**

進入 superpowers:requesting-code-review(全分支 review 含本功能與筆記視窗功能的堆疊)/ finishing-a-development-branch 流程。
