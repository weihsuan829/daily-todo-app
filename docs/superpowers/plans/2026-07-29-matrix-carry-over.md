# Matrix 未完成任務跨週延續 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓未完成的 Matrix 任務不再因為週次推進而消失——象限永遠顯示所有未完成任務,週次箭頭只控制下方已完成區。

**Architecture:** 後端把既有的 7 天週窗從「套用在所有任務」縮小為「只套用在已完成任務」,一次查詢回傳「全部未完成 + 該週已完成 + 無日期」。前端配合兩件事:象限排序改為只依 `order`(否則跨週拖拉會彈回),已完成區標題加上週範圍讓週次箭頭的作用可被察覺。

**Tech Stack:** TypeScript、drizzle-orm(MySQL)、tRPC、React、vitest。

**Spec:** `docs/superpowers/specs/2026-07-29-matrix-carry-over-design.md`

## Global Constraints

- 分支:`feature/matrix-carry-over`(已建立,spec 已 commit)。
- 資料庫 schema 一律不改;不修改任何任務的 `dueDate`(不做資料層搬移)。
- 未傳 `weekStart` 的呼叫(Work/Life、Admin)行為必須完全不變。
- 循環任務虛擬列邏輯不動(它們沒有 `quadrant`,不出現在 Matrix)。
- 已完成區日期格式為 `MM/DD`(零補位),週範圍格式為 `MM/DD - MM/DD`。
- 型別檢查 `pnpm check` 必須乾淨;`pnpm vitest run` 全綠(目前基準 143 passed)。
- 整合測試需要測試資料庫;若 `server/tasks.test.ts` 因無 DB 而 skip/fail,請先執行 `pnpm db:setup:test`(見 `scripts/setup-test-db.sh`),並在報告中說明實際狀況。
- 每個 Task 結束時 commit,訊息附 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 後端——週窗只套用在已完成任務(TDD)

**Files:**
- Modify: `server/tasks.test.ts:188-283`(整個 `describe("tasks.list week window ...")` 區塊改寫)
- Modify: `server/db.ts:117-124`(`getUserTasks` 的 window 條件)

**Interfaces:**
- Consumes: 既有的 `weekWindow(date)`(來自 `server/weekWindow.ts`,回傳 `{ start: Date; end: Date }`)、既有的 drizzle 匯入 `eq, and, or, isNull, gte, lt`(`server/db.ts:1` 已全部匯入,不需新增)。
- Produces: `getUserTasks(userId, category?, weekStart?)` 的新語意——傳入 `weekStart` 時回傳「所有未完成任務 + `dueDate` 落在 `[weekStart, weekStart+7)` 的已完成任務 + 所有 `dueDate IS NULL` 的任務」。Task 2 的前端依賴此語意。

**重要背景:** 現行測試斷言「不在週窗內的任務不會回傳」,而那些測試資料全是**未完成**任務。本次改動後未完成任務一律回傳,所以那些斷言**必然失敗**——這正是 RED。改寫後,週窗邊界的把關必須改由**已完成**任務承擔,否則邊界測試會變成空測。

- [ ] **Step 1: 改寫整個測試區塊(先寫測試,這是 TDD 的 RED)**

把 `server/tasks.test.ts` 中 `describe("tasks.list week window (getUserTasks integration)", ...)` 的**整個區塊**(自 `describe(` 起至其對應的 `});` 止)替換為以下內容:

```ts
  describe("tasks.list week window (getUserTasks integration)", () => {
    // getUserTasks anchors its 7-day window on the exact date it's given, so
    // this test uses a fixed Monday as the weekStart argument (matching the
    // only real caller's contract) rather than "today", which would make the
    // test's pass/fail depend on which day it happens to run.
    const weekStart = new Date(2026, 0, 5); // Monday 2026-01-05, local midnight
    const inWeekDate = new Date(2026, 0, 7); // Wednesday, same week
    const nextWeekDate = new Date(2026, 0, 13); // 8 days after weekStart: outside the window
    const boundaryStartDate = new Date(2026, 0, 5); // Exactly at week start: inside
    const boundaryEndDate = new Date(2026, 0, 12); // Exactly weekStart + 7 days: outside

    // Unfinished tasks carry over: they must surface in every week regardless
    // of dueDate. Finished tasks stay week-scoped, so they are what pins the
    // window's half-open boundaries.
    const openInWeekTitle = "CarryOver IntegTest Open-InWeek";
    const openNextWeekTitle = "CarryOver IntegTest Open-NextWeek";
    const openUndatedTitle = "CarryOver IntegTest Open-Undated";
    const doneInWeekTitle = "CarryOver IntegTest Done-InWeek";
    const doneBoundaryStartTitle = "CarryOver IntegTest Done-BoundaryStart";
    const doneBoundaryEndTitle = "CarryOver IntegTest Done-BoundaryEnd";
    const doneUndatedTitle = "CarryOver IntegTest Done-Undated";

    const createdIds: number[] = [];

    function extractInsertId(result: unknown): number | null {
      const header: any = Array.isArray(result) ? result[0] : result;
      return header?.insertId != null ? Number(header.insertId) : null;
    }

    afterAll(async () => {
      const { ctx } = createTaskContext();
      for (const id of createdIds) {
        await deleteTask(id, ctx.user.id);
      }
    });

    it("carries unfinished tasks into every week, keeps finished tasks week-scoped, and returns everything when no week is given", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      async function createTask(title: string, dueDate?: Date): Promise<number> {
        const result = await caller.tasks.create({
          category: "eisenhower",
          title,
          priority: "medium",
          ...(dueDate ? { dueDate } : {}),
        });
        const id = extractInsertId(result);
        expect(id).not.toBeNull();
        createdIds.push(id!);
        return id!;
      }

      // Unfinished rows.
      await createTask(openInWeekTitle, inWeekDate);
      await createTask(openNextWeekTitle, nextWeekDate);
      await createTask(openUndatedTitle);

      // Finished rows: created, then marked complete through the real mutation
      // so completedAt/status are set the same way the app sets them.
      const doneInWeekId = await createTask(doneInWeekTitle, inWeekDate);
      const doneBoundaryStartId = await createTask(doneBoundaryStartTitle, boundaryStartDate);
      const doneBoundaryEndId = await createTask(doneBoundaryEndTitle, boundaryEndDate);
      const doneUndatedId = await createTask(doneUndatedTitle);
      for (const id of [doneInWeekId, doneBoundaryStartId, doneBoundaryEndId, doneUndatedId]) {
        await caller.tasks.update({ id, completed: true });
      }

      const windowed = await caller.tasks.list({ category: "eisenhower", date: weekStart });
      const windowedTitles = windowed.map((t) => t.title);

      // Unfinished tasks surface no matter which week is requested — this is
      // the whole point of the carry-over behavior.
      expect(windowedTitles).toContain(openInWeekTitle);
      expect(windowedTitles).toContain(openNextWeekTitle);
      expect(windowedTitles).toContain(openUndatedTitle);

      // Finished tasks are week-scoped. Boundary-start (== weekStart) is inside;
      // boundary-end (== weekStart + 7 days) is outside. These two pin the
      // half-open window: `lte` instead of `lt`, or `gt` instead of `gte`,
      // would flip one of them.
      expect(windowedTitles).toContain(doneInWeekTitle);
      expect(windowedTitles).toContain(doneBoundaryStartTitle);
      expect(windowedTitles).not.toContain(doneBoundaryEndTitle);

      // Undated tasks stay visible every week whether or not they are finished:
      // NULL comparisons in SQL are UNKNOWN, so they need their own branch.
      expect(windowedTitles).toContain(doneUndatedTitle);

      // No date given: every task is returned, regardless of dueDate or status.
      const all = await caller.tasks.list({ category: "eisenhower" });
      const allTitles = all.map((t) => t.title);
      for (const title of [
        openInWeekTitle,
        openNextWeekTitle,
        openUndatedTitle,
        doneInWeekTitle,
        doneBoundaryStartTitle,
        doneBoundaryEndTitle,
        doneUndatedTitle,
      ]) {
        expect(allTitles).toContain(title);
      }
    });
  });
```

- [ ] **Step 2: 執行測試確認失敗(RED)**

Run: `pnpm vitest run server/tasks.test.ts`
Expected: FAIL —— `expect(windowedTitles).toContain("CarryOver IntegTest Open-NextWeek")` 這行斷言失敗(目前的實作把未完成且不在週窗內的任務排除了)。確認失敗訊息確實指向這個斷言,而不是 DB 連線問題。

- [ ] **Step 3: 修改後端條件**

把 `server/db.ts` 中的 window 條件區塊:

```ts
  if (window) {
    // Undated tasks must remain visible rather than silently vanishing from
    // every week (NULL comparisons in SQL are UNKNOWN, not true), so they're
    // included alongside tasks whose dueDate falls inside the window.
    conditions.push(
      or(
        and(gte(tasks.dueDate, window.start), lt(tasks.dueDate, window.end)),
        isNull(tasks.dueDate)
      )!
    );
  }
```

替換為:

```ts
  if (window) {
    // Unfinished tasks are the whole point of the board, so they must stay
    // visible no matter which week is being viewed — otherwise they silently
    // vanish the moment the week rolls over. Only finished tasks are
    // week-scoped, which is what keeps the completed history bounded.
    // Undated tasks must remain visible rather than silently vanishing from
    // every week (NULL comparisons in SQL are UNKNOWN, not true), so they're
    // included alongside tasks whose dueDate falls inside the window.
    conditions.push(
      or(
        eq(tasks.completed, false),
        and(gte(tasks.dueDate, window.start), lt(tasks.dueDate, window.end)),
        isNull(tasks.dueDate)
      )!
    );
  }
```

(`eq` 已在 `server/db.ts:1` 匯入,不需改動 import。)

- [ ] **Step 4: 執行測試確認通過(GREEN)**

Run: `pnpm vitest run server/tasks.test.ts`
Expected: PASS(全部 it 綠燈)。

- [ ] **Step 5: 全套測試 + 型別檢查**

Run: `pnpm check && pnpm vitest run`
Expected: `tsc` 無錯誤;測試全綠(143 passed)。

- [ ] **Step 6: Commit**

```bash
git add server/db.ts server/tasks.test.ts
git commit -m "feat(tasks): carry unfinished tasks across weeks; scope only finished ones to the week

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 前端——象限排序改依 order + 已完成區顯示週範圍

**Files:**
- Create: `client/src/lib/weekLabel.ts`
- Test: `client/src/lib/weekLabel.test.ts`
- Modify: `client/src/pages/EisenhowerMatrix.tsx:111-120`(`tasksByQuadrant` 排序)與 CompletedSection 呼叫處(約 `:342`)
- Modify: `client/src/components/matrix/CompletedSection.tsx:16-35`(props 與標題)

**Interfaces:**
- Consumes: Task 1 的後端語意(象限現在會收到跨週的未完成任務);既有的 `CompletedSection` props `{ tasks, onRestore, onDelete, busyId }`。
- Produces:
  - `client/src/lib/weekLabel.ts` 匯出 `formatMonthDay(date: Date): string`(回傳 `MM/DD`,零補位)與 `weekRangeLabel(weekStart: Date): string`(回傳 `MM/DD - MM/DD`,結束日為 `weekStart + 6` 天)。
  - `CompletedSection` 新增必要 prop `weekLabel: string`。

- [ ] **Step 1: 寫失敗的測試(weekLabel)**

```ts
// client/src/lib/weekLabel.test.ts
import { describe, it, expect } from "vitest";
import { formatMonthDay, weekRangeLabel } from "./weekLabel";

describe("formatMonthDay", () => {
  it("zero-pads month and day", () => {
    expect(formatMonthDay(new Date(2026, 0, 5))).toBe("01/05");
    expect(formatMonthDay(new Date(2026, 11, 25))).toBe("12/25");
  });
});

describe("weekRangeLabel", () => {
  it("spans the week start through six days later", () => {
    expect(weekRangeLabel(new Date(2026, 6, 27))).toBe("07/27 - 08/02");
  });

  it("handles a week that crosses a year boundary", () => {
    expect(weekRangeLabel(new Date(2026, 11, 28))).toBe("12/28 - 01/03");
  });

  it("does not mutate the date it is given", () => {
    const start = new Date(2026, 6, 27);
    weekRangeLabel(start);
    expect(start.getTime()).toBe(new Date(2026, 6, 27).getTime());
  });
});
```

- [ ] **Step 2: 執行測試確認失敗(RED)**

Run: `pnpm vitest run client/src/lib/weekLabel.test.ts`
Expected: FAIL —— `Cannot find module './weekLabel'`。

- [ ] **Step 3: 實作 weekLabel.ts**

```ts
// client/src/lib/weekLabel.ts

/** Month/day of a date as MM/DD, zero-padded. */
export function formatMonthDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

/**
 * Label for the 7-day week starting at `weekStart`, e.g. "07/27 - 08/02".
 * The input date is not mutated.
 */
export function weekRangeLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return `${formatMonthDay(weekStart)} - ${formatMonthDay(end)}`;
}
```

- [ ] **Step 4: 執行測試確認通過(GREEN)**

Run: `pnpm vitest run client/src/lib/weekLabel.test.ts`
Expected: PASS(4 tests)。

- [ ] **Step 5: 象限排序改為只依 order**

把 `client/src/pages/EisenhowerMatrix.tsx` 的:

```ts
  // Sorted to mirror the server's own ordering (dueDate first, then order) so that
  // optimistic `order` rewrites in handleDragEnd actually change visual position.
  const tasksByQuadrant = (quadrant: Quadrant) =>
    activeTasks
      .filter((task) => task.quadrant === quadrant)
      .sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const db_ = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        return da !== db_ ? da - db_ : (a.order ?? 0) - (b.order ?? 0);
      });
```

替換為:

```ts
  // Quadrants now mix tasks from many weeks (unfinished ones carry over), so
  // sorting by dueDate first would demote `order` to a within-week tiebreaker
  // and drag-reordering across a dueDate boundary would snap back. Sorting on
  // `order` alone keeps the optimistic `order` rewrites in handleDragEnd
  // visually effective; equal `order` values keep the server's
  // ORDER BY order ASC, createdAt DESC because Array#sort is stable.
  const tasksByQuadrant = (quadrant: Quadrant) =>
    activeTasks
      .filter((task) => task.quadrant === quadrant)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
```

- [ ] **Step 6: CompletedSection 加 weekLabel prop**

在 `client/src/components/matrix/CompletedSection.tsx`,把 props 介面:

```ts
interface CompletedSectionProps {
  tasks: CompletedTask[];
  onRestore: (id: number) => void;
  onDelete: (task: CompletedTask) => void;
  busyId?: number | null;
}

export function CompletedSection({ tasks, onRestore, onDelete, busyId = null }: CompletedSectionProps) {
```

替換為:

```ts
interface CompletedSectionProps {
  tasks: CompletedTask[];
  /** Week this section is scoped to, e.g. "07/27 - 08/02". The quadrants above
   *  are not week-scoped, so without this the week arrows look like a no-op. */
  weekLabel: string;
  onRestore: (id: number) => void;
  onDelete: (task: CompletedTask) => void;
  busyId?: number | null;
}

export function CompletedSection({ tasks, weekLabel, onRestore, onDelete, busyId = null }: CompletedSectionProps) {
```

並把標題:

```tsx
      <h3 className="text-sm font-bold text-gray-700 mb-2">
        已完成{tasks.length > 0 ? `（${tasks.length}）` : ""}
      </h3>
```

替換為:

```tsx
      <h3 className="text-sm font-bold text-gray-700 mb-2">
        已完成{tasks.length > 0 ? `（${tasks.length}）` : ""}
        <span className="ml-2 text-xs font-normal text-gray-400">{weekLabel}</span>
      </h3>
```

- [ ] **Step 7: 頁面傳入 weekLabel**

在 `client/src/pages/EisenhowerMatrix.tsx` 的 import 區加入:

```ts
import { weekRangeLabel } from "@/lib/weekLabel";
```

在 `<CompletedSection` 的 props 中加一行(放在 `tasks={completedTasks}` 之後):

```tsx
        weekLabel={weekRangeLabel(selectedDate)}
```

- [ ] **Step 8: 型別檢查與全套測試**

Run: `pnpm check && pnpm vitest run`
Expected: `tsc` 無錯誤;測試全綠(147 passed —— 原 143 加上本 task 的 4 個)。

- [ ] **Step 9: Commit**

```bash
git add client/src/lib/weekLabel.ts client/src/lib/weekLabel.test.ts client/src/pages/EisenhowerMatrix.tsx client/src/components/matrix/CompletedSection.tsx
git commit -m "feat(matrix): order-only quadrant sort for carried-over tasks; label the completed section's week

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Dev 環境端到端驗證

**Files:** 無(驗證;發現 bug 以 systematic-debugging 處理後補 commit)

**Interfaces:** 無。

前置:dev 容器已在跑(http://localhost:4179,原始碼 volume 掛載即時生效)。dev 資料庫是 `daily-todo-mysql`(port 3307),與 prod 分離。

- [ ] **Step 1: 建立跨週測試資料**

用 browser 開 http://localhost:4179 → Eisenhower Matrix:
1. 在本週的「緊急且重要」新增兩筆任務 `延續測試A`、`延續測試B`。
2. 把 `延續測試B` 打勾完成。
3. 按「下一週」箭頭切到下一週。

- [ ] **Step 2: 驗證延續行為**

在下一週的畫面上確認:
1. `延續測試A`(未完成)**仍然出現**在「緊急且重要」象限——這是本功能的核心。
2. `延續測試B`(已完成)**不在**下方已完成區(它屬於上一週)。
3. 已完成區標題顯示的是**下一週**的日期範圍。
4. 按「上一週」切回去:`延續測試B` 重新出現在已完成區,且 `延續測試A` 依然在象限中。

- [ ] **Step 3: 驗證跨週拖拉排序**

1. 停在下一週,於「緊急且重要」新增一筆 `本週任務C`。此時象限內同時有上週的 `延續測試A` 與本週的 `本週任務C`。
2. 把 `本週任務C` 拖到 `延續測試A` 上方 → 順序立即改變且**不彈回**。
3. 重新整理頁面 → 順序保持(已寫入資料庫)。

- [ ] **Step 4: 回歸檢查**

1. 切到 Work 與 Life 分頁,確認任務照常顯示、拖拉與筆記功能正常(這兩頁不傳日期,行為應完全未變)。
2. 點任務文字開筆記視窗、勾選 checkbox、象限 X 刪除確認框,皆正常。

- [ ] **Step 5: 最終驗證與清理**

1. Run: `pnpm check && pnpm vitest run` → 全綠,把輸出貼給使用者。
2. 刪除 dev 資料庫中的測試任務(`延續測試A`、`延續測試B`、`本週任務C`)。

- [ ] **Step 6: 收尾**

進入 superpowers:requesting-code-review(全分支 review)與 finishing-a-development-branch 流程。
