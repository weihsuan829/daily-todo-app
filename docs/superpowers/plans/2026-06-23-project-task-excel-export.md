# 專案任務 Excel 匯出(round-trip)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有匯入功能上新增「匯出現有任務」:把選定專案的所有任務(含完成/封存)以與匯入範本相同的欄位格式匯出成 .xlsx,可改後用既有匯入同名更新回寫。

**Architecture:** 反向格式化純函式(碼→中文 enum、日期、組列)→ 既有 `xlsx.ts` 加 `buildExportWorkbook` 寫出 → `importService.ts` 加 `buildExport`(讀任務/標籤/負責人/父任務,組列)→ tRPC `projectImport.export`(含擁有權檢查)→ 前端對話框加「匯出現有任務」按鈕。

**Tech Stack:** exceljs、tRPC、Drizzle/MySQL、React、Vitest。

## Global Constraints

- 用 **pnpm**;沿用 `exceljs`、既有 db 層、`HEADER_ORDER`/`COLUMNS`/型別。
- 匯出路徑**必須驗證使用者擁有該專案**(非擁有者 → `TRPCError FORBIDDEN`),與匯入一致(`checkUserOwnsProject` 已存在於 db.ts)。
- 匯出欄序必須與 `HEADER_ORDER` 一致;enum 輸出中文、日期 `yyyy/M/d`;格式必須能被既有匯入吃回(round-trip)。
- `pnpm run check` 0 錯、`pnpm run build` 成功、`pnpm test` 不低於現況 99 綠;新邏輯要有測試。
- 不改既有匯入邏輯,只新增匯出路徑與一顆按鈕。
- 分支 `feature/project-excel-import`。

`HEADER_ORDER`(欄序)= [任務名稱, 描述, 優先級, 狀態, 開始日, 截止日, 負責人, 標籤, 上層任務名稱]。

---

## Task 1: 後端匯出(純函式 + workbook 寫出 + 服務 + 端點)

**Files:**
- Create: `server/import/exportFormat.ts`
- Create: `server/import/exportFormat.test.ts`
- Modify: `server/import/xlsx.ts`(加 `buildExportWorkbook`)
- Modify: `server/import/importService.ts`(加 `buildExport`)
- Modify: `server/import/importService.test.ts`(加匯出 round-trip 整合測試)
- Modify: `server/routers.ts`(`projectImport` 加 `export` query)

**Interfaces:**
- Consumes:`HEADER_ORDER`/`Priority`/`Status`(types.ts);`parseWorkbook`(xlsx.ts,測試用);db `listTasksByProject`/`listPlaceholders`/`listWorkspaceMembers`/`listTags`/`listTaskTags`/`checkUserOwnsProject`。
- Produces:`priorityToZh`/`statusToZh`/`formatDate`/`taskToRow`(+型別 `ExportTask`/`ExportCtx`);`buildExportWorkbook(dataRows)`;`buildExport(userId, projectId)`;tRPC `projectImport.export`。

- [ ] **Step 1: 寫失敗測試 `server/import/exportFormat.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { priorityToZh, statusToZh, formatDate, taskToRow, type ExportCtx } from "./exportFormat";
import { HEADER_ORDER } from "./types";

describe("exportFormat", () => {
  it("maps priority/status codes to Chinese", () => {
    expect(priorityToZh("urgent")).toBe("緊急");
    expect(priorityToZh("medium")).toBe("中");
    expect(statusToZh("in_progress")).toBe("進行中");
    expect(statusToZh("done")).toBe("完成");
  });

  it("formats dates as yyyy/M/d, blank for null", () => {
    expect(formatDate(new Date(2026, 5, 30))).toBe("2026/6/30");
    expect(formatDate(null)).toBe("");
  });

  it("taskToRow outputs values in HEADER_ORDER column order", () => {
    const ctx: ExportCtx = {
      placeholderName: new Map([[7, "阿明"]]),
      memberName: new Map(),
      tagNamesByTask: new Map([[1, ["購料", "急件"]]]),
      titleById: new Map([[9, "大任務"]]),
    };
    const row = taskToRow({
      id: 1, title: "小任務", description: "說明",
      priority: "high", status: "done",
      startDate: new Date(2026, 5, 30), dueDate: new Date(2026, 6, 15),
      assigneePlaceholderId: 7, assigneeId: null, parentTaskId: 9,
    }, ctx);
    expect(row.length).toBe(HEADER_ORDER.length);
    expect(row).toEqual(["小任務", "說明", "高", "完成", "2026/6/30", "2026/7/15", "阿明", "購料,急件", "大任務"]);
  });

  it("falls back to member name, then blank, for assignee", () => {
    const ctx: ExportCtx = { placeholderName: new Map(), memberName: new Map([[3, "我"]]), tagNamesByTask: new Map(), titleById: new Map() };
    const base = { id: 2, title: "T", description: null, priority: "low" as const, status: "todo" as const, startDate: null, dueDate: null, parentTaskId: null };
    expect(taskToRow({ ...base, assigneePlaceholderId: null, assigneeId: 3 }, ctx)[6]).toBe("我");
    expect(taskToRow({ ...base, assigneePlaceholderId: null, assigneeId: null }, ctx)[6]).toBe("");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run server/import/exportFormat.test.ts`
Expected: FAIL（`exportFormat` 不存在）。

- [ ] **Step 3: 實作 `server/import/exportFormat.ts`**

```ts
import { type Priority, type Status } from "./types";

const PRIORITY_ZH: Record<Priority, string> = { low: "低", medium: "中", high: "高", urgent: "緊急" };
const STATUS_ZH: Record<Status, string> = { todo: "待辦", in_progress: "進行中", done: "完成", archived: "封存" };

export function priorityToZh(p: Priority): string { return PRIORITY_ZH[p] ?? ""; }
export function statusToZh(s: Status): string { return STATUS_ZH[s] ?? ""; }

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
}

export interface ExportTask {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  startDate: Date | null;
  dueDate: Date | null;
  assigneePlaceholderId: number | null;
  assigneeId: number | null;
  parentTaskId: number | null;
}

export interface ExportCtx {
  placeholderName: Map<number, string>;
  memberName: Map<number, string>;
  tagNamesByTask: Map<number, string[]>;
  titleById: Map<number, string>;
}

// Column order MUST match HEADER_ORDER:
// [任務名稱, 描述, 優先級, 狀態, 開始日, 截止日, 負責人, 標籤, 上層任務名稱]
export function taskToRow(t: ExportTask, ctx: ExportCtx): string[] {
  const assignee =
    t.assigneePlaceholderId != null ? (ctx.placeholderName.get(t.assigneePlaceholderId) ?? "")
    : t.assigneeId != null ? (ctx.memberName.get(t.assigneeId) ?? "")
    : "";
  const tags = (ctx.tagNamesByTask.get(t.id) ?? []).join(",");
  const parent = t.parentTaskId != null ? (ctx.titleById.get(t.parentTaskId) ?? "") : "";
  return [
    t.title,
    t.description ?? "",
    priorityToZh(t.priority),
    statusToZh(t.status),
    formatDate(t.startDate),
    formatDate(t.dueDate),
    assignee,
    tags,
    parent,
  ];
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run server/import/exportFormat.test.ts`
Expected: PASS。

- [ ] **Step 5: `xlsx.ts` 加 `buildExportWorkbook`**

在 `server/import/xlsx.ts` 末端加(沿用既有 `ExcelJS`/`HEADER_ORDER` import):
```ts
export async function buildExportWorkbook(dataRows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tasks");
  ws.addRow(HEADER_ORDER);
  ws.getRow(1).font = { bold: true };
  for (const r of dataRows) ws.addRow(r);
  ws.columns.forEach((c) => (c.width = 18));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

- [ ] **Step 6: `importService.ts` 加 `buildExport`**

在 `server/import/importService.ts` 加(補 import:`buildExportWorkbook` from "./xlsx";`taskToRow`, type `ExportCtx`, `ExportTask` from "./exportFormat";db 的 `listPlaceholders`, `listWorkspaceMembers`, `listTags`, `listTaskTags` 若尚未 import):
```ts
export async function buildExport(userId: number, projectId: number): Promise<Buffer> {
  const tasksList = await listTasksByProject(userId, projectId);
  const placeholders = await listPlaceholders(userId, projectId);
  const members = await listWorkspaceMembers(userId, projectId);
  const tags = await listTags(userId, projectId);
  const taskTags = await listTaskTags(userId, projectId);

  const placeholderName = new Map<number, string>(placeholders.map((p) => [p.id, p.name]));
  const memberName = new Map<number, string>(members.map((m) => [m.id, m.name ?? ""]));
  const tagName = new Map<number, string>(tags.map((t) => [t.id, t.name]));
  const tagNamesByTask = new Map<number, string[]>();
  for (const tt of taskTags) {
    const arr = tagNamesByTask.get(tt.taskId) ?? [];
    const n = tagName.get(tt.tagId);
    if (n) arr.push(n);
    tagNamesByTask.set(tt.taskId, arr);
  }
  const titleById = new Map<number, string>(tasksList.map((t) => [t.id, t.title]));
  const ctx: ExportCtx = { placeholderName, memberName, tagNamesByTask, titleById };

  const dataRows = tasksList.map((t) => taskToRow(t as ExportTask, ctx));
  return buildExportWorkbook(dataRows);
}
```
(註:`listTasksByProject` 已對非擁有者回 `[]`;端點仍會先做 `checkUserOwnsProject` 擋下並回 FORBIDDEN。)

- [ ] **Step 7: 加匯出 round-trip 整合測試到 `server/import/importService.test.ts`**

於該檔(已連 `daily_todo_test`、已有建立 user+project 的 setup)新增:
```ts
import { buildExport } from "./importService";
import { parseWorkbook } from "./xlsx";
import { COLUMNS } from "./types";

it("buildExport produces a sheet that round-trips back through parseWorkbook", async () => {
  // create a parent + child task with tag + placeholder assignee via the commit path
  const preview = await buildPreview(userId, projectId, [
    { [COLUMNS.title]: "匯出大任務", [COLUMNS.assignee]: "匯出阿明", [COLUMNS.tags]: "匯出購料", [COLUMNS.priority]: "高" } as Record<string, unknown>,
    { [COLUMNS.title]: "匯出小任務", [COLUMNS.parent]: "匯出大任務", [COLUMNS.status]: "完成" } as Record<string, unknown>,
  ]);
  await commitImport(userId, projectId, preview.rows);

  const buf = await buildExport(userId, projectId);
  const { rows, error } = await parseWorkbook(buf);
  expect(error).toBeUndefined();
  const big = rows.find((r) => r[COLUMNS.title] === "匯出大任務")!;
  const small = rows.find((r) => r[COLUMNS.title] === "匯出小任務")!;
  expect(big[COLUMNS.priority]).toBe("高");
  expect(String(big[COLUMNS.assignee])).toBe("匯出阿明");
  expect(String(big[COLUMNS.tags])).toContain("匯出購料");
  expect(small[COLUMNS.status]).toBe("完成");
  expect(String(small[COLUMNS.parent])).toBe("匯出大任務");
});
```
(若該檔的 user/project 變數名不同,沿用該檔既有命名。)

- [ ] **Step 8: `routers.ts` 加 `export` query**

在 `projectImport` router 內(template/preview/commit 旁)加(`checkUserOwnsProject` 與 `TRPCError` 已在本檔可用):
```ts
    export: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!(await checkUserOwnsProject(ctx.user.id, input.projectId)))
          throw new TRPCError({ code: "FORBIDDEN", message: "無權存取此專案" });
        const buf = await buildExport(ctx.user.id, input.projectId);
        return { filename: "任務匯出.xlsx", base64: buf.toString("base64") };
      }),
```
補 import:於既有 `import { buildPreview, commitImport } from "./import/importService";` 加上 `buildExport`。

- [ ] **Step 9: 測試 + 型別 + build**

Run: `pnpm db:setup:test && pnpm vitest run server/import/exportFormat.test.ts server/import/importService.test.ts && pnpm run check`
Expected: 全 PASS;tsc 0 錯。

- [ ] **Step 10: Commit**

```bash
git add server/import/exportFormat.ts server/import/exportFormat.test.ts server/import/xlsx.ts server/import/importService.ts server/import/importService.test.ts server/routers.ts
git commit -m "feat(export): project task export service + projectImport.export endpoint"
```

---

## Task 2: 前端 — 對話框加「匯出現有任務」按鈕

**Files:**
- Modify: `client/src/components/project/ImportExcelDialog.tsx`

**Interfaces:**
- Consumes:tRPC `projectImport.export`(query → `{ filename, base64 }`);既有 `projectId` prop;既有 base64→blob 下載寫法。

- [ ] **Step 1: 抽出 base64→下載 helper 並加匯出按鈕**

Read `client/src/components/project/ImportExcelDialog.tsx`。`downloadTemplate`(約 41 行)目前內含 base64→Blob→a.click 流程。將該下載動作抽成檔內 helper(若尚未抽):
```tsx
function downloadXlsx(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```
`downloadTemplate` 改用 `downloadXlsx(res.data.base64, res.data.filename)`。

加匯出 query 與 handler(`projectId` 已是 prop):
```tsx
const exportQuery = trpc.projectImport.export.useQuery({ projectId }, { enabled: false });

async function exportTasks() {
  const res = await exportQuery.refetch();
  if (!res.data) return;
  downloadXlsx(res.data.base64, res.data.filename);
}
```

在「下載範本」按鈕旁加(約 101-102 行該 Button 之後):
```tsx
<Button variant="outline" onClick={exportTasks} disabled={exportQuery.isFetching}>
  匯出現有任務
</Button>
```

- [ ] **Step 2: 型別 + build**

Run: `pnpm run check && pnpm run build`
Expected: tsc 0 錯;build 成功。

- [ ] **Step 3: 實機驗收(開發容器 :4179)**

確保開發環境在跑(`docker compose up -d`)。瀏覽器開 `http://localhost:4179` → 進一個有任務的專案 → 開「匯入 Excel」對話框:
- 看到「下載範本」與「匯出現有任務」兩顆按鈕。
- 點「匯出現有任務」下載 xlsx;打開確認含該專案任務、欄位與範本一致、值正確(中文 enum、日期、標籤、負責人、上層任務名)。
- 不改檔直接用「選檔上傳」上傳該匯出檔 → 預覽應全為「更新」、確認後任務數不變。

- [ ] **Step 4: Commit**

```bash
git add client/src/components/project/ImportExcelDialog.tsx
git commit -m "feat(export): add export-current-tasks button to import dialog"
```

---

## Self-Review

**Spec coverage:**
- 反向 enum/日期/組列純函式 + 測試 → Task 1 Step 1-4 ✅
- `buildExportWorkbook`(HEADER_ORDER 標題 + 資料列)→ Task 1 Step 5 ✅
- `buildExport`(讀任務/標籤/負責人/父任務、建對照、組列)→ Task 1 Step 6 ✅
- 全部任務(含完成/封存)→ `listTasksByProject` 回全部,未過濾 ✅
- 端點含擁有權檢查(FORBIDDEN)→ Task 1 Step 8 ✅
- round-trip 可被匯入吃回 → Task 1 Step 7 整合測試(parseWorkbook 驗)✅
- 前端按鈕 + 下載 → Task 2 ✅
- 保留下載範本、不改匯入邏輯 → Task 2 只加按鈕;Task 1 只新增匯出路徑 ✅

**Placeholder scan:** 無 TBD/TODO。Task 1 Step 7「沿用該檔既有命名」「若尚未 import」是要求實作者對齊現檔的具體動作,非缺漏。

**Type consistency:** `ExportTask`/`ExportCtx`(Task 1 Step 3 定義)於 Step 6 `buildExport` 使用一致;`taskToRow` 回傳欄序對齊 `HEADER_ORDER`(Step 3 註明、Step 1 測試斷言 length 與值);`buildExport`/`buildExportWorkbook`/`export` 端點簽章 Task 1 與 Task 2 一致(`{filename, base64}`)。
