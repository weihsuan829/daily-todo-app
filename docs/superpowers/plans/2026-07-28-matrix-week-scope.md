# Matrix 按週分期 + 象限刪除確認 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 Eisenhower Matrix(含已完成歷史區)只顯示所選週的任務,並為象限列的刪除加上確認對話框。

**Architecture:** 後端 `getUserTasks` 目前收下 `date` 參數卻沒使用;把週窗邊界計算抽成純函式 `server/weekWindow.ts`(vitest node,TDD),再於 `getUserTasks` 以 `gte/lt` 條件套用。前端 Matrix 的 query 已帶 `date`,零改動即隨週切換。象限刪除確認為 EisenhowerMatrix 頁內的 AlertDialog,文案沿用 CompletedSection。

**Tech Stack:** TypeScript、drizzle-orm(mysql2)、tRPC、React、shadcn/ui AlertDialog、vitest。

**Spec:** `docs/superpowers/specs/2026-07-28-matrix-week-scope-design.md`

## Global Constraints

- 分支:`feature/matrix-week-scope`(已建立,從 main 分出)。**只在本地 git:不 push、不開 PR**(使用者明確指示)。
- 資料庫 schema 不改;`tasks.list` router 不改(zod 已有 `date: z.date().optional()`)。
- 未傳 `date` 的呼叫端(Work/Life、Admin、專案頁)行為必須完全不變。
- 週窗定義:`dueDate >= date` 且 `dueDate < date + 7 天`;`date` 為前端傳入的週起始日。
- 刪除確認文案與 `client/src/components/matrix/CompletedSection.tsx` 一致:標題「確定要永久刪除?」、說明「「<任務名稱>」將被永久刪除,此操作無法復原。」、按鈕「取消」/「刪除」(紅色)。
- 測試指令:`pnpm vitest run <file>`;型別檢查 `pnpm check`。整合測試需 test DB(`pnpm db:setup:test`),目前本機已設定,`pnpm vitest run` 應為 132/132 全綠。
- Commit 訊息附 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 週窗純函式 + getUserTasks 套用(TDD)

**Files:**
- Create: `server/weekWindow.ts`
- Test: `server/weekWindow.test.ts`
- Modify: `server/db.ts`(`getUserTasks`,約 94-113 行)

**Interfaces:**
- Consumes: drizzle-orm 的 `gte` / `lt`(現有 import 行 `import { eq, and, asc, desc, isNull, inArray, notInArray } from "drizzle-orm";` 需補這兩個)。
- Produces: `weekWindow(date: Date): { start: Date; end: Date }` —— start 為傳入日期當天 00:00:00.000,end 為 start + 7 天(不含)。Task 2 不依賴此介面。

- [ ] **Step 1: Write the failing test**

```ts
// server/weekWindow.test.ts
import { describe, it, expect } from "vitest";
import { weekWindow } from "./weekWindow";

describe("weekWindow", () => {
  it("starts at midnight of the given day", () => {
    const { start } = weekWindow(new Date("2026-07-27T13:45:30.123Z"));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getDate()).toBe(new Date("2026-07-27T13:45:30.123Z").getDate());
  });

  it("ends exactly 7 days after the start", () => {
    const { start, end } = weekWindow(new Date("2026-07-27T00:00:00.000Z"));
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("does not mutate the input date", () => {
    const input = new Date("2026-07-27T13:45:30.123Z");
    const snapshot = input.getTime();
    weekWindow(input);
    expect(input.getTime()).toBe(snapshot);
  });

  it("handles a month boundary", () => {
    const { start, end } = weekWindow(new Date(2026, 6, 27, 9, 0, 0)); // 2026-07-27 local
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(27);
    expect(end.getMonth()).toBe(7); // August
    expect(end.getDate()).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/weekWindow.test.ts`
Expected: FAIL —— `Cannot find module './weekWindow'`。

- [ ] **Step 3: Write minimal implementation**

```ts
// server/weekWindow.ts

/**
 * Week window for task queries: [start, end) where start is midnight of the
 * given day and end is exactly 7 days later.
 */
export function weekWindow(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/weekWindow.test.ts`
Expected: PASS(4 tests)。

- [ ] **Step 5: 在 getUserTasks 套用週窗**

`server/db.ts` 第 1 行的 drizzle-orm import 補上 `gte` 與 `lt`:

```ts
import { eq, and, asc, desc, isNull, inArray, notInArray, gte, lt } from "drizzle-orm";
```

檔頭 import 區加:

```ts
import { weekWindow } from "./weekWindow";
```

`getUserTasks` 內,`if (category) { conditions.push(eq(tasks.category, category)); }` 之後加入:

```ts
  if (date) {
    const { start, end } = weekWindow(date);
    conditions.push(gte(tasks.dueDate, start));
    conditions.push(lt(tasks.dueDate, end));
  }
```

(其餘不動:未傳 `date` 時條件不追加,Work/Life 與 Admin 行為不變;虛擬循環任務生成邏輯保持原樣。)

- [ ] **Step 6: 型別檢查與完整測試**

Run: `pnpm check && pnpm vitest run`
Expected: `tsc` 無錯誤;測試全綠(新增 4 個 weekWindow 測試,總數應為 136)。若有整合測試因週窗而失敗,表示該測試依賴「帶 date 卻回傳全部」的舊行為——回報為 concern 而非自行放寬實作。

- [ ] **Step 7: Commit**

```bash
git add server/weekWindow.ts server/weekWindow.test.ts server/db.ts
git commit -m "feat(tasks): honor the date argument in getUserTasks as a 7-day window

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 象限列刪除確認對話框

**Files:**
- Modify: `client/src/pages/EisenhowerMatrix.tsx`

**Interfaces:**
- Consumes: 既有 `deleteTaskMutation`;shadcn AlertDialog(`@/components/ui/alert-dialog`,已用於 CompletedSection)。
- Produces: 無新對外介面。

- [ ] **Step 1: 加 import 與 state**

檔頭 imports 增加:

```tsx
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
```

元件內(其他 useState 附近)加:

```tsx
  const [pendingDeleteTask, setPendingDeleteTask] = useState<(typeof tasks)[number] | null>(null);
```

- [ ] **Step 2: 象限列的 X 按鈕改為開確認框**

把象限任務列裡的刪除按鈕 onClick 從直接 mutate 改為:

```tsx
                        <button
                          onClick={() => setPendingDeleteTask(task)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          title="刪除"
                        >
                          <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                        </button>
```

- [ ] **Step 3: 頁面底部加 AlertDialog**

在 `<TaskNotesModal ... />` 之後(仍在最外層容器內)加入:

```tsx
      <AlertDialog
        open={pendingDeleteTask !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteTask(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要永久刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingDeleteTask?.title}」將被永久刪除，此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => {
                if (pendingDeleteTask) {
                  deleteTaskMutation.mutate({
                    id: pendingDeleteTask.id,
                    dueDate: pendingDeleteTask.dueDate ?? undefined,
                  });
                }
                setPendingDeleteTask(null);
              }}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 4: 型別檢查與完整測試**

Run: `pnpm check && pnpm vitest run`
Expected: `tsc` 無錯誤;測試全綠(136)。

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/EisenhowerMatrix.tsx
git commit -m "feat(matrix): confirm before deleting a task from a quadrant row

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Dev 環境端到端驗證

**Files:** 無(驗證;發現 bug 以 systematic-debugging 處理後補 commit)

**Interfaces:** 無。

前置:dev 容器在跑(http://localhost:4179,原始碼 volume 掛載即時生效)。tsx watch 會在 server 檔案變更後自動重啟。

- [ ] **Step 1: 週別過濾驗證**

1. 開 http://localhost:4179 → Eisenhower Matrix,在本週某象限新增任務「本週任務」。
2. 點日期列的「>」切到下一週 → 「本週任務」**不應**出現;新增「下週任務」。
3. 切回本週 → 只見「本週任務」;再切下週 → 只見「下週任務」。
4. 在本週完成一筆任務 → 出現在本週的已完成區;切到下週 → 已完成區**不含**該筆(歷史區同樣按週)。

- [ ] **Step 2: 刪除確認驗證**

1. 象限列 hover → 點 X → 出現「確定要永久刪除?」對話框,顯示正確任務名稱。
2. 點「取消」→ 任務仍在。
3. 再點 X → 點「刪除」→ 任務消失。
4. 已完成區的刪除確認仍正常(回歸)。

- [ ] **Step 3: Work/Life 回歸**

切到 Work 與 Life 分頁:任務照常顯示(這兩頁的 query 不帶 date,行為不應改變)、拖拉與筆記功能正常。

- [ ] **Step 4: 最終確認**

Run: `pnpm check && pnpm vitest run` → 全綠;貼出證據。清除 dev DB 測試資料。

- [ ] **Step 5: 收尾**

進入 superpowers:requesting-code-review 全分支審查;完成後依使用者指示**保留在本地分支**(不 push、不開 PR)。
