# 專案任務 Excel 批次匯入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者在專案頁面用 `.xlsx` 範本批次填好任務,一鍵上傳、預覽後確認,把任務灌進選定專案(同名更新、負責人/標籤自動建、子任務階層)。

**Architecture:** 純函式核心(每列正規化+驗證,無 DB,好測)→ exceljs 讀寫(範本產生 + 解析)→ 服務層(用 DB 分類 create/update/error、upsert、自動建負責人/標籤、兩段式回填子任務)→ tRPC `projectImport` router(template/preview/commit)→ 前端 `ImportExcelDialog` + 工具列按鈕。

**Tech Stack:** exceljs(MIT)、tRPC、Drizzle/MySQL、React + shadcn Dialog、Vitest。

## Global Constraints

- 用 **pnpm**;新增相依 `exceljs`。
- Upsert 鍵 =(projectId + title);同名多筆 → 該列錯誤跳過。
- 更新時只覆寫 Excel 有提供值的選填欄(留白不覆寫既有值)。
- `status` 為 done/完成 時透過既有 `applyStatusCompletionSync` 同步 `completed`/`completedAt`。
- 寫入綁目前使用者 + 選定專案;沿用既有 db 層(`createTask`/`createTag`/`createPlaceholder`/`setTaskTags`/`listTasksByProject`/`listTags`/`listPlaceholders`),不另造平行邏輯。
- 只收 `.xlsx`;列數上限 2000。
- `pnpm run check` 0 錯、`pnpm run build` 成功、`pnpm test` 不低於現況 83 綠;新邏輯要有測試。
- 分支 `feature/project-excel-import`。

欄位(標題列,以文字辨識):`任務名稱`(必填)、`描述`、`優先級`、`狀態`、`開始日`、`截止日`、`負責人`、`標籤`、`上層任務名稱`。

---

## Task 1: 純函式核心 — 型別 + 每列正規化/驗證

**Files:**
- Create: `server/import/types.ts`
- Create: `server/import/normalizeRow.ts`
- Test: `server/import/normalizeRow.test.ts`

**Interfaces:**
- Produces:
  - 型別 `NormalizedTaskInput`、`PreviewRow`、`ImportPreview`、`RawRow`、欄位常數 `COLUMNS`。
  - `normalizeRow(raw: RawRow, rowNum: number): { task: NormalizedTaskInput; messages: string[]; ok: boolean }` — 純函式,只做格子值→正規化 + 必填/enum/日期驗證 + 標籤切分,**不碰 DB、不判斷 create/update**(那在 Task 3)。

- [ ] **Step 1: 寫型別 `server/import/types.ts`**

```ts
export const COLUMNS = {
  title: "任務名稱",
  description: "描述",
  priority: "優先級",
  status: "狀態",
  startDate: "開始日",
  dueDate: "截止日",
  assignee: "負責人",
  tags: "標籤",
  parent: "上層任務名稱",
} as const;

export const HEADER_ORDER: string[] = [
  COLUMNS.title, COLUMNS.description, COLUMNS.priority, COLUMNS.status,
  COLUMNS.startDate, COLUMNS.dueDate, COLUMNS.assignee, COLUMNS.tags, COLUMNS.parent,
];

export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "todo" | "in_progress" | "done" | "archived";

// One raw row read from the sheet: header text -> cell value (string | number | Date | null)
export type RawRow = Record<string, string | number | Date | null | undefined>;

export interface NormalizedTaskInput {
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  startDate: Date | null;
  dueDate: Date | null;
  assigneeName: string | null;
  tagNames: string[];
  parentName: string | null;
}

export type ImportRowAction = "create" | "update" | "error";

export interface PreviewRow {
  rowNum: number;
  action: ImportRowAction;
  task: NormalizedTaskInput;
  messages: string[]; // errors (action==="error") or warnings
}

export interface ImportPreview {
  summary: { create: number; update: number; error: number; warning: number };
  rows: PreviewRow[];
}
```

- [ ] **Step 2: 寫失敗測試 `server/import/normalizeRow.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { normalizeRow } from "./normalizeRow";
import { COLUMNS } from "./types";

const base = () => ({ [COLUMNS.title]: "買料" } as Record<string, unknown>);

describe("normalizeRow", () => {
  it("requires title", () => {
    const r = normalizeRow({ [COLUMNS.title]: "  " }, 2);
    expect(r.ok).toBe(false);
    expect(r.messages.join()).toContain("任務名稱");
  });

  it("defaults priority=medium, status=todo when blank", () => {
    const r = normalizeRow(base(), 2);
    expect(r.ok).toBe(true);
    expect(r.task.priority).toBe("medium");
    expect(r.task.status).toBe("todo");
  });

  it("maps Chinese enums", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.priority]: "緊急", [COLUMNS.status]: "進行中" }, 2);
    expect(r.task.priority).toBe("urgent");
    expect(r.task.status).toBe("in_progress");
  });

  it("accepts english enums", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.priority]: "high", [COLUMNS.status]: "done" }, 2);
    expect(r.task.priority).toBe("high");
    expect(r.task.status).toBe("done");
  });

  it("errors on invalid enum", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.priority]: "超急" }, 2);
    expect(r.ok).toBe(false);
    expect(r.messages.join()).toContain("優先級");
  });

  it("parses date strings and Date cells", () => {
    const r1 = normalizeRow({ ...base(), [COLUMNS.dueDate]: "2026/7/15" }, 2);
    expect(r1.task.dueDate?.getFullYear()).toBe(2026);
    const d = new Date(2026, 6, 1);
    const r2 = normalizeRow({ ...base(), [COLUMNS.startDate]: d }, 2);
    expect(r2.task.startDate?.getMonth()).toBe(6);
  });

  it("errors on unparseable date", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.dueDate]: "下週" }, 2);
    expect(r.ok).toBe(false);
    expect(r.messages.join()).toContain("截止日");
  });

  it("splits tags on Chinese/English commas, trims, drops blanks", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.tags]: "購料, 急件，" }, 2);
    expect(r.task.tagNames).toEqual(["購料", "急件"]);
  });

  it("captures assignee and parent names, null when blank", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.assignee]: " 阿明 ", [COLUMNS.parent]: "大任務" }, 2);
    expect(r.task.assigneeName).toBe("阿明");
    expect(r.task.parentName).toBe("大任務");
    const r2 = normalizeRow(base(), 2);
    expect(r2.task.assigneeName).toBeNull();
    expect(r2.task.parentName).toBeNull();
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm vitest run server/import/normalizeRow.test.ts`
Expected: FAIL（`normalizeRow` 不存在 / 匯入錯誤）。

- [ ] **Step 4: 實作 `server/import/normalizeRow.ts`**

```ts
import { COLUMNS, type NormalizedTaskInput, type Priority, type RawRow, type Status } from "./types";

const PRIORITY_MAP: Record<string, Priority> = {
  "低": "low", "中": "medium", "高": "high", "緊急": "urgent",
  low: "low", medium: "medium", high: "high", urgent: "urgent",
};
const STATUS_MAP: Record<string, Status> = {
  "待辦": "todo", "進行中": "in_progress", "完成": "done", "封存": "archived",
  todo: "todo", in_progress: "in_progress", done: "done", archived: "archived",
};

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function parseDateCell(v: unknown): { date: Date | null; ok: boolean } {
  if (v == null || (typeof v === "string" && v.trim() === "")) return { date: null, ok: true };
  if (v instanceof Date && !isNaN(v.getTime())) return { date: v, ok: true };
  const s = String(v).trim();
  // accept yyyy/m/d or yyyy-m-d
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d.getTime())) return { date: d, ok: true };
  }
  return { date: null, ok: false };
}

export function normalizeRow(raw: RawRow, rowNum: number): { task: NormalizedTaskInput; messages: string[]; ok: boolean } {
  const messages: string[] = [];
  const get = (k: string) => cellToString(raw[k]);

  const title = get(COLUMNS.title);
  if (!title) messages.push(`第 ${rowNum} 列:缺「任務名稱」`);

  let priority: Priority = "medium";
  const pRaw = get(COLUMNS.priority);
  if (pRaw) {
    const mapped = PRIORITY_MAP[pRaw];
    if (!mapped) messages.push(`第 ${rowNum} 列:「優先級」值不合法(${pRaw})`);
    else priority = mapped;
  }

  let status: Status = "todo";
  const sRaw = get(COLUMNS.status);
  if (sRaw) {
    const mapped = STATUS_MAP[sRaw];
    if (!mapped) messages.push(`第 ${rowNum} 列:「狀態」值不合法(${sRaw})`);
    else status = mapped;
  }

  const startP = parseDateCell(raw[COLUMNS.startDate]);
  if (!startP.ok) messages.push(`第 ${rowNum} 列:「開始日」無法解析`);
  const dueP = parseDateCell(raw[COLUMNS.dueDate]);
  if (!dueP.ok) messages.push(`第 ${rowNum} 列:「截止日」無法解析`);

  const descRaw = get(COLUMNS.description);
  const assignee = get(COLUMNS.assignee);
  const parent = get(COLUMNS.parent);
  const tagNames = get(COLUMNS.tags)
    .split(/[,，]/).map((t) => t.trim()).filter(Boolean);

  const task: NormalizedTaskInput = {
    title,
    description: descRaw || null,
    priority,
    status,
    startDate: startP.date,
    dueDate: dueP.date,
    assigneeName: assignee || null,
    tagNames,
    parentName: parent || null,
  };

  return { task, messages, ok: messages.length === 0 };
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm vitest run server/import/normalizeRow.test.ts`
Expected: PASS（全綠）。

- [ ] **Step 6: Commit**

```bash
git add server/import/types.ts server/import/normalizeRow.ts server/import/normalizeRow.test.ts
git commit -m "feat(import): row normalization + validation core for excel task import"
```

---

## Task 2: exceljs I/O — 範本產生 + 工作表解析

**Files:**
- Modify: `package.json`(加 `exceljs` 相依)
- Create: `server/import/xlsx.ts`
- Test: `server/import/xlsx.test.ts`

**Interfaces:**
- Consumes:Task 1 的 `COLUMNS`/`HEADER_ORDER`/`RawRow`。
- Produces:
  - `buildTemplate(): Promise<Buffer>` — 產生範本 xlsx(標題列 + 一列範例 + 「說明」分頁)。
  - `parseWorkbook(buf: Buffer): Promise<{ rows: RawRow[]; error?: string }>` — 讀第一個工作表,首列為標題,之後每列轉成以標題為鍵的 `RawRow`;超過 2000 列回 `error`。

- [ ] **Step 1: 裝 exceljs**

```bash
pnpm add exceljs
```
Expected: package.json 出現 `exceljs`;`pnpm install` 成功。

- [ ] **Step 2: 寫失敗測試 `server/import/xlsx.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildTemplate, parseWorkbook } from "./xlsx";
import { COLUMNS, HEADER_ORDER } from "./types";

describe("xlsx io", () => {
  it("buildTemplate produces a parseable workbook whose headers match HEADER_ORDER", async () => {
    const buf = await buildTemplate();
    expect(buf.length).toBeGreaterThan(0);
    const { rows, error } = await parseWorkbook(buf);
    expect(error).toBeUndefined();
    // template has 1 example row; its keys must include all headers
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const h of HEADER_ORDER) expect(Object.keys(rows[0])).toContain(h);
  });

  it("parseWorkbook maps rows by header text", async () => {
    // round-trip: build a workbook via exceljs in-test, then parse
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tasks");
    ws.addRow([COLUMNS.title, COLUMNS.priority]);
    ws.addRow(["買料", "高"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const { rows } = await parseWorkbook(buf);
    expect(rows[0][COLUMNS.title]).toBe("買料");
    expect(rows[0][COLUMNS.priority]).toBe("高");
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm vitest run server/import/xlsx.test.ts`
Expected: FAIL（`buildTemplate`/`parseWorkbook` 不存在）。

- [ ] **Step 4: 實作 `server/import/xlsx.ts`**

```ts
import ExcelJS from "exceljs";
import { COLUMNS, HEADER_ORDER, type RawRow } from "./types";

const MAX_ROWS = 2000;

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tasks");
  ws.addRow(HEADER_ORDER);
  ws.getRow(1).font = { bold: true };
  // example row
  ws.addRow([
    "範例:採購10台server的料", "需求單已開,等供應商報價",
    "高", "進行中", "2026/6/30", "2026/7/15", "阿明", "購料,急件", "",
  ]);
  ws.columns.forEach((c) => (c.width = 18));

  const help = wb.addWorksheet("說明");
  const lines: string[][] = [
    ["欄位", "必填", "接受值"],
    [COLUMNS.title, "是", "任意文字"],
    [COLUMNS.description, "否", "任意文字"],
    [COLUMNS.priority, "否", "低 / 中 / 高 / 緊急(或 low/medium/high/urgent);空白=中"],
    [COLUMNS.status, "否", "待辦 / 進行中 / 完成 / 封存(或 todo/in_progress/done/archived);空白=待辦"],
    [COLUMNS.startDate, "否", "2026/6/30 或 2026-06-30"],
    [COLUMNS.dueDate, "否", "同開始日"],
    [COLUMNS.assignee, "否", "人名;不存在自動建立掛名成員"],
    [COLUMNS.tags, "否", "逗號分隔,如 購料,急件;不存在自動建立"],
    [COLUMNS.parent, "否", "填同表/同專案另一任務名稱 → 設為其子任務"],
  ];
  lines.forEach((l) => help.addRow(l));
  help.getRow(1).font = { bold: true };
  help.columns.forEach((c) => (c.width = 30));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function parseWorkbook(buf: Buffer): Promise<{ rows: RawRow[]; error?: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    return { rows: [], error: "無法讀取檔案,請確認是有效的 .xlsx" };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], error: "找不到工作表" };

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value ?? "").trim();
  });

  const rows: RawRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: RawRow = {};
    let hasAny = false;
    headerRow.eachCell({ includeEmpty: true }, (_c, col) => {
      const key = headers[col];
      if (!key) return;
      let v = row.getCell(col).value as unknown;
      // exceljs may return { text } for rich text / hyperlinks
      if (v && typeof v === "object" && !(v instanceof Date) && "text" in (v as any)) {
        v = (v as any).text;
      }
      if (v != null && String(v).trim() !== "") hasAny = true;
      obj[key] = (v as RawRow[string]) ?? null;
    });
    if (hasAny) rows.push(obj);
    if (rows.length > MAX_ROWS) return { rows: [], error: `列數超過上限 ${MAX_ROWS}` };
  }
  return { rows };
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm vitest run server/import/xlsx.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml server/import/xlsx.ts server/import/xlsx.test.ts
git commit -m "feat(import): exceljs template builder + workbook parser"
```

---

## Task 3: 服務層(preview/commit)+ tRPC router

**Files:**
- Create: `server/import/importService.ts`
- Test: `server/import/importService.test.ts`
- Modify: `server/routers.ts`(新增 `projectImport` router + import)

**Interfaces:**
- Consumes:Task 1 `normalizeRow`/型別;Task 2 `buildTemplate`/`parseWorkbook`;既有 db 層 `listTasksByProject`、`createTask`、`listTags`、`createTag`、`listPlaceholders`、`createPlaceholder`、`setTaskTags`;`applyStatusCompletionSync`。
- Produces:
  - `buildPreview(userId: number, projectId: number, rawRows: RawRow[]): Promise<ImportPreview>` — 用 DB 既有任務做 create/update/同名多筆分類(read-only)。
  - `commitImport(userId: number, projectId: number, rows: PreviewRow[]): Promise<{ created: number; updated: number; skipped: number; warnings: string[] }>` — 伺服器端**重新驗證**(對 `row.task` 跑必填/enum 再檢查)後寫入。
  - tRPC `projectImport.template` / `.preview` / `.commit`。

- [ ] **Step 1: 確認 `createTask` 回傳形狀(取得新 taskId)**

Read `server/db.ts` 的 `createTask`(約 204 行起)結尾,確認它回傳的物件如何取得新任務 `id`。在 `importService.ts` 取得新 id 時依實際回傳處理:
- 若回傳建立後的 task 物件 → 取 `.id`。
- 若回傳 drizzle insert 結果 → 用既有專案慣例擷取:`const header:any = Array.isArray(ins)?ins[0]:ins; const id = header?.insertId!=null?Number(header.insertId):null;`
- 保險作法(本計畫採用):建立後以 `listTasksByProject` 重新取回,依 title 找剛建立者拿 id。

- [ ] **Step 2: 寫失敗測試 `server/import/importService.test.ts`(需測試 DB)**

> 前置:測試連 `daily_todo_test`(由 `pnpm db:setup:test` 建好);測試自行建立 workspace/project/user 或重用既有測試輔助。參考既有 `server/projects.test.ts` 的建置方式建立 user+workspace+project,取得 `userId`/`projectId`。

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { buildPreview, commitImport } from "./importService";
import { COLUMNS } from "./types";
import { listTasksByProject, listTags, listPlaceholders } from "../db";
// reuse test helpers to create a user + workspace + project; see server/projects.test.ts
import { makeUserProject } from "../testHelpers"; // if none exists, inline the setup as projects.test.ts does

let userId: number, projectId: number;
beforeAll(async () => { ({ userId, projectId } = await makeUserProject()); });

const raw = (o: Record<string, unknown>) => ({ ...o }) as Record<string, unknown>;

describe("import service", () => {
  it("classifies new vs invalid rows in preview", async () => {
    const preview = await buildPreview(userId, projectId, [
      raw({ [COLUMNS.title]: "任務A", [COLUMNS.priority]: "高" }),
      raw({ [COLUMNS.title]: "", [COLUMNS.priority]: "高" }),       // error: no title
      raw({ [COLUMNS.title]: "任務B", [COLUMNS.priority]: "亂" }),  // error: bad enum
    ]);
    expect(preview.summary.create).toBe(1);
    expect(preview.summary.error).toBe(2);
  });

  it("commit creates tasks, auto-creates assignee + tags, wires subtasks, upserts by title", async () => {
    const preview = await buildPreview(userId, projectId, [
      raw({ [COLUMNS.title]: "大任務", [COLUMNS.assignee]: "阿明", [COLUMNS.tags]: "購料,急件" }),
      raw({ [COLUMNS.title]: "小任務", [COLUMNS.parent]: "大任務", [COLUMNS.status]: "完成" }),
    ]);
    const res = await commitImport(userId, projectId, preview.rows);
    expect(res.created).toBe(2);

    const tasksNow = await listTasksByProject(userId, projectId);
    const big = tasksNow.find((t) => t.title === "大任務")!;
    const small = tasksNow.find((t) => t.title === "小任務")!;
    expect(small.parentTaskId).toBe(big.id);
    expect(small.status).toBe("done");
    expect(small.completed).toBe(true);

    const ph = await listPlaceholders(userId, projectId);
    expect(ph.some((p) => p.name === "阿明")).toBe(true);
    const tg = await listTags(userId, projectId);
    expect(tg.some((t) => t.name === "購料")).toBe(true);

    // re-upload same title => update, not duplicate
    const preview2 = await buildPreview(userId, projectId, [
      raw({ [COLUMNS.title]: "大任務", [COLUMNS.priority]: "緊急" }),
    ]);
    expect(preview2.summary.update).toBe(1);
    const res2 = await commitImport(userId, projectId, preview2.rows);
    expect(res2.updated).toBe(1);
    const after = await listTasksByProject(userId, projectId);
    expect(after.filter((t) => t.title === "大任務").length).toBe(1);
    expect(after.find((t) => t.title === "大任務")!.priority).toBe("urgent");
  });
});
```

> 若專案沒有現成 `makeUserProject`/`testHelpers`,在本測試檔頂端仿照 `server/projects.test.ts` 內聯建立 user+workspace+project(用既有 db 函式),並匯出/重用。實作者請先讀 `server/projects.test.ts` 對齊建置方式。

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm db:setup:test && pnpm vitest run server/import/importService.test.ts`
Expected: FAIL（service 不存在）。

- [ ] **Step 4: 實作 `server/import/importService.ts`**

```ts
import { normalizeRow } from "./normalizeRow";
import type { ImportPreview, NormalizedTaskInput, PreviewRow, RawRow } from "./types";
import { applyStatusCompletionSync } from "../taskStatus";
import {
  listTasksByProject, createTask, listTags, createTag,
  listPlaceholders, createPlaceholder, setTaskTags,
} from "../db";

// Map existing project tasks by title -> count + first id, for upsert + dup detection.
async function existingTitleIndex(userId: number, projectId: number) {
  const tasks = await listTasksByProject(userId, projectId);
  const idx = new Map<string, { ids: number[] }>();
  for (const t of tasks) {
    const e = idx.get(t.title) ?? { ids: [] };
    e.ids.push(t.id);
    idx.set(t.title, e);
  }
  return idx;
}

export async function buildPreview(userId: number, projectId: number, rawRows: RawRow[]): Promise<ImportPreview> {
  const idx = await existingTitleIndex(userId, projectId);
  const sheetTitles = new Set<string>();
  const rows: PreviewRow[] = [];

  rawRows.forEach((raw, i) => {
    const rowNum = i + 2; // header is row 1
    const { task, messages, ok } = normalizeRow(raw, rowNum);
    if (!ok) { rows.push({ rowNum, action: "error", task, messages }); return; }

    const msgs = [...messages];
    const existing = idx.get(task.title);
    let action: PreviewRow["action"] = "create";
    if (existing && existing.ids.length > 1) {
      rows.push({ rowNum, action: "error", task, messages: [`第 ${rowNum} 列:專案內有多筆同名任務「${task.title}」,無法判斷要更新哪一筆`] });
      return;
    }
    if (existing && existing.ids.length === 1) action = "update";

    // parent warning (resolve against sheet titles + existing)
    if (task.parentName) {
      if (task.parentName === task.title) msgs.push(`第 ${rowNum} 列:上層任務不可為自己,已忽略`);
      else if (!sheetTitles.has(task.parentName) && !idx.has(task.parentName)) {
        // may still be defined later in the sheet — defer: only warn if also not present after full pass
      }
    }
    sheetTitles.add(task.title);
    rows.push({ rowNum, action, task, messages: msgs });
  });

  // second scan: finalize parent "not found" warnings now that all sheet titles are known
  for (const r of rows) {
    if (r.action === "error") continue;
    const p = r.task.parentName;
    if (p && p !== r.task.title && !sheetTitles.has(p) && !idx.has(p)) {
      r.messages.push(`第 ${r.rowNum} 列:找不到上層任務「${p}」,將建為頂層`);
    }
  }

  const summary = {
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    error: rows.filter((r) => r.action === "error").length,
    warning: rows.filter((r) => r.action !== "error" && r.messages.length > 0).length,
  };
  return { summary, rows };
}

async function resolvePlaceholderId(userId: number, projectId: number, name: string, cache: Map<string, number>): Promise<number | null> {
  if (cache.has(name)) return cache.get(name)!;
  await createPlaceholder(userId, projectId, name); // no-op safe even if exists; we re-list to get id
  const list = await listPlaceholders(userId, projectId);
  const found = list.find((p) => p.name === name);
  if (found) cache.set(name, found.id);
  return found?.id ?? null;
}

async function resolveTagIds(userId: number, projectId: number, names: string[], cache: Map<string, number>): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    if (!cache.has(name)) {
      const existing = (await listTags(userId, projectId)).find((t) => t.name === name);
      if (existing) cache.set(name, existing.id);
      else { await createTag(userId, projectId, name); const created = (await listTags(userId, projectId)).find((t) => t.name === name); if (created) cache.set(name, created.id); }
    }
    const id = cache.get(name); if (id != null) ids.push(id);
  }
  return ids;
}

export async function commitImport(userId: number, projectId: number, rows: PreviewRow[]): Promise<{ created: number; updated: number; skipped: number; warnings: string[] }> {
  const warnings: string[] = [];
  let created = 0, updated = 0, skipped = 0;
  const phCache = new Map<string, number>();
  const tagCache = new Map<string, number>();

  // re-validate server-side; only act on create/update rows that still pass
  const valid = rows.filter((r) => r.action !== "error").map((r) => {
    const re = normalizeRow(toRaw(r.task), r.rowNum);
    return { rowNum: r.rowNum, action: r.action, task: re.ok ? re.task : null };
  }).filter((r) => r.task) as Array<{ rowNum: number; action: "create" | "update"; task: NormalizedTaskInput }>;

  skipped = rows.length - valid.length;

  // title -> taskId, seeded with existing tasks for parent resolution
  const titleToId = new Map<string, number>();
  for (const t of await listTasksByProject(userId, projectId)) titleToId.set(t.title, t.id);

  // pass 1: create/update tasks (no parent yet)
  for (const r of valid) {
    const assigneeId = r.task.assigneeName ? await resolvePlaceholderId(userId, projectId, r.task.assigneeName, phCache) : null;
    const tagIds = r.task.tagNames.length ? await resolveTagIds(userId, projectId, r.task.tagNames, tagCache) : [];
    const synced = applyStatusCompletionSync({ status: r.task.status });
    const fields = {
      title: r.task.title,
      description: r.task.description,
      priority: r.task.priority,
      status: r.task.status,
      startDate: r.task.startDate,
      dueDate: r.task.dueDate,
      assigneePlaceholderId: assigneeId,
      projectId,
      ...synced, // completed / completedAt
    };

    let taskId: number | null = null;
    if (r.action === "update") {
      const existingId = titleToId.get(r.task.title);
      if (existingId == null) { r.action = "create"; }
      else {
        await updateTaskFields(userId, existingId, pruneUndefined(fields, r.task));
        taskId = existingId; updated++;
      }
    }
    if (taskId == null) {
      const id = await createTaskReturnId(userId, fields);
      if (id == null) { skipped++; warnings.push(`第 ${r.rowNum} 列:建立失敗`); continue; }
      taskId = id; titleToId.set(r.task.title, id); created++;
    }
    if (tagIds.length) await setTaskTags(userId, taskId, tagIds);
    (r as any)._taskId = taskId;
  }

  // pass 2: wire parents
  for (const r of valid) {
    const p = r.task.parentName;
    const selfId = (r as any)._taskId as number | undefined;
    if (!p || p === r.task.title || selfId == null) continue;
    const parentId = titleToId.get(p);
    if (parentId == null) { warnings.push(`第 ${r.rowNum} 列:找不到上層任務「${p}」,已建為頂層`); continue; }
    await updateTaskFields(userId, selfId, { parentTaskId: parentId });
  }

  return { created, updated, skipped, warnings };
}
```

實作者另外在 `importService.ts` 補三個小 helper(就近放檔內):
```ts
import { COLUMNS, type NormalizedTaskInput } from "./types";

// Build a RawRow back from a normalized task for server-side re-validation.
function toRaw(t: NormalizedTaskInput): RawRow {
  return {
    [COLUMNS.title]: t.title,
    [COLUMNS.description]: t.description ?? "",
    [COLUMNS.priority]: t.priority,
    [COLUMNS.status]: t.status,
    [COLUMNS.startDate]: t.startDate ?? "",
    [COLUMNS.dueDate]: t.dueDate ?? "",
    [COLUMNS.assignee]: t.assigneeName ?? "",
    [COLUMNS.tags]: t.tagNames.join(","),
    [COLUMNS.parent]: t.parentName ?? "",
  };
}

// On update, only overwrite optional fields the sheet actually provided (don't blank out).
function pruneUndefined(fields: Record<string, unknown>, task: NormalizedTaskInput): Record<string, unknown> {
  const out: Record<string, unknown> = { title: fields.title, priority: fields.priority, status: fields.status, ...(("completed" in fields) ? { completed: (fields as any).completed, completedAt: (fields as any).completedAt } : {}) };
  if (task.description != null) out.description = task.description;
  if (task.startDate != null) out.startDate = task.startDate;
  if (task.dueDate != null) out.dueDate = task.dueDate;
  if (task.assigneeName != null) out.assigneePlaceholderId = fields.assigneePlaceholderId;
  return out;
}
```

`createTaskReturnId` 與 `updateTaskFields`:採 Step 1 的保險作法 —— `createTaskReturnId` 呼叫既有 `createTask(userId, fields)` 後,以 `listTasksByProject` 找回該 title 最新一筆的 id;`updateTaskFields(userId, taskId, partial)` 用既有 task 更新 db 函式(對齊 `tasks.update` 路徑所用的 db 函式;實作者讀 `server/routers.ts` 的 `tasks.update` 找出對應 db 函式並重用,套用 `applyStatusCompletionSync` 已在上面處理)。

- [ ] **Step 5: 在 `server/routers.ts` 加 `projectImport` router**

於檔案 import 區補:
```ts
import { buildTemplate, parseWorkbook } from "./import/xlsx";
import { buildPreview, commitImport } from "./import/importService";
```
在 `appRouter` 物件內(與 `tags`/`notes` 同層)加:
```ts
  projectImport: router({
    template: protectedProcedure.query(async () => {
      const buf = await buildTemplate();
      return { filename: "專案任務匯入範本.xlsx", base64: buf.toString("base64") };
    }),
    preview: protectedProcedure
      .input(z.object({ projectId: z.number(), base64: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { rows, error } = await parseWorkbook(Buffer.from(input.base64, "base64"));
        if (error) return { error, summary: { create: 0, update: 0, error: 0, warning: 0 }, rows: [] };
        return buildPreview(ctx.user.id, input.projectId, rows);
      }),
    commit: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        rows: z.array(z.object({
          rowNum: z.number(),
          action: z.enum(["create", "update", "error"]),
          task: z.object({
            title: z.string(), description: z.string().nullable(),
            priority: z.enum(["low", "medium", "high", "urgent"]),
            status: z.enum(["todo", "in_progress", "done", "archived"]),
            startDate: z.coerce.date().nullable(), dueDate: z.coerce.date().nullable(),
            assigneeName: z.string().nullable(), tagNames: z.array(z.string()),
            parentName: z.string().nullable(),
          }),
          messages: z.array(z.string()),
        })),
      }))
      .mutation(async ({ ctx, input }) => commitImport(ctx.user.id, input.projectId, input.rows as any)),
  }),
```

- [ ] **Step 6: 跑測試 + 型別**

Run: `pnpm db:setup:test && pnpm vitest run server/import/importService.test.ts && pnpm run check`
Expected: service 測試 PASS;tsc 0 錯。

- [ ] **Step 7: Commit**

```bash
git add server/import/importService.ts server/import/importService.test.ts server/routers.ts
git commit -m "feat(import): preview/commit service + projectImport tRPC router"
```

---

## Task 4: 前端 — 匯入對話框 + 工具列按鈕

**Files:**
- Create: `client/src/components/project/ImportExcelDialog.tsx`
- Modify: `client/src/components/project/ProjectToolbar.tsx`(加「匯入 Excel」按鈕開啟對話框)

**Interfaces:**
- Consumes:tRPC `projectImport.template/preview/commit`;`projectId`(目前選定專案,來自 ProjectToolbar 既有 props/context)。
- Produces:可操作的匯入 UI;成功後觸發既有任務清單重整(用既有 `trpc.useUtils()` invalidate `tasks.listByProject`)。

- [ ] **Step 1: 寫 `ImportExcelDialog.tsx`**

```tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Preview = Awaited<ReturnType<ReturnType<typeof trpc.projectImport.preview.useMutation>["mutateAsync"]>>;

export function ImportExcelDialog({ projectId, open, onOpenChange }: { projectId: number; open: boolean; onOpenChange: (v: boolean) => void; }) {
  const utils = trpc.useUtils();
  const [preview, setPreview] = useState<Preview | null>(null);
  const templateQuery = trpc.projectImport.template.useQuery(undefined, { enabled: false });
  const previewMut = trpc.projectImport.preview.useMutation();
  const commitMut = trpc.projectImport.commit.useMutation();

  async function downloadTemplate() {
    const res = await templateQuery.refetch();
    if (!res.data) return;
    const bytes = Uint8Array.from(atob(res.data.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = res.data.filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const base64 = await fileToBase64(file);
    const result = await previewMut.mutateAsync({ projectId, base64 });
    if ((result as any).error) { toast.error((result as any).error); return; }
    setPreview(result);
  }

  async function confirmImport() {
    if (!preview) return;
    const res = await commitMut.mutateAsync({ projectId, rows: preview.rows as any });
    toast.success(`新增 ${res.created}、更新 ${res.updated}、略過 ${res.skipped}`);
    if (res.warnings.length) toast.message(`提醒:${res.warnings.length} 筆`, { description: res.warnings.slice(0, 5).join("\n") });
    await utils.tasks.listByProject.invalidate({ projectId });
    onOpenChange(false); setPreview(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setPreview(null); }}>
      <DialogContent className="max-w-[800px]">
        <DialogHeader><DialogTitle>匯入 Excel 任務</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadTemplate}>下載範本</Button>
          <input type="file" accept=".xlsx" onChange={onFile} />
        </div>
        {previewMut.isPending && <p className="text-sm text-muted-foreground">解析中…</p>}
        {preview && (
          <div className="mt-3">
            <p className="text-sm">新增 {preview.summary.create}、更新 {preview.summary.update}、錯誤 {preview.summary.error}、提醒 {preview.summary.warning}</p>
            <div className="max-h-[320px] overflow-auto border rounded mt-2 text-sm">
              <table className="w-full">
                <thead><tr className="text-left"><th className="p-1">列</th><th className="p-1">動作</th><th className="p-1">任務</th><th className="p-1">訊息</th></tr></thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.rowNum} className={r.action === "error" ? "text-destructive" : ""}>
                      <td className="p-1">{r.rowNum}</td>
                      <td className="p-1">{r.action === "create" ? "新增" : r.action === "update" ? "更新" : "錯誤"}</td>
                      <td className="p-1">{r.task.title || "(空)"}</td>
                      <td className="p-1">{r.messages.join("；")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={confirmImport} disabled={!preview || preview.summary.create + preview.summary.update === 0 || commitMut.isPending}>確認匯入</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 2: 在 `ProjectToolbar.tsx` 加按鈕**

Read `ProjectToolbar.tsx` 找到工具列按鈕區與可取得的 `projectId`(若 props 沒有則由父層傳入)。加:
```tsx
import { Upload } from "lucide-react";
import { ImportExcelDialog } from "./ImportExcelDialog";
// ...在元件內:
const [importOpen, setImportOpen] = useState(false);
// ...在工具列 JSX 適當位置:
<PillButton active={false} onClick={() => setImportOpen(true)}>
  <Upload className="h-4 w-4 mr-1" /> 匯入 Excel
</PillButton>
<ImportExcelDialog projectId={projectId} open={importOpen} onOpenChange={setImportOpen} />
```
(若 `ProjectToolbar` 目前拿不到 `projectId`,於其 props 增加 `projectId: number` 並由父元件傳入;實作者讀父元件對齊。)

- [ ] **Step 3: 型別 + build**

Run: `pnpm run check && pnpm run build`
Expected: tsc 0 錯;build 成功。

- [ ] **Step 4: 實機驗收(開發容器 :4179)**

確保開發環境在跑(`docker compose up -d`)。瀏覽器開 `http://localhost:4179`,進一個專案 → 點「匯入 Excel」:
- 下載範本、填 5~10 列(含必填缺漏、非法優先級、同名、子任務、未知負責人/標籤各一例)、上傳。
- 確認預覽分類正確;按「確認匯入」;任務出現在專案、負責人/標籤已建、子任務正確、完成狀態打勾。

- [ ] **Step 5: Commit**

```bash
git add client/src/components/project/ImportExcelDialog.tsx client/src/components/project/ProjectToolbar.tsx
git commit -m "feat(import): project Excel import dialog + toolbar button"
```

---

## Self-Review

**Spec coverage:**
- 使用流程(下載範本/上傳/預覽/確認)→ Task 2 + Task 4 ✅
- Excel 欄位定義 + 接受值 → Task 1(enum/date/tags)+ Task 2(範本/說明頁)✅
- Upsert(同名更新、同名多筆錯誤)→ Task 3 `buildPreview`/`commitImport` ✅
- 更新只覆寫有提供的選填欄 → Task 3 `pruneUndefined` ✅
- 子任務兩段式 + 找不到上層警告 + 自我參照防護 → Task 3 pass1/pass2 + preview 警告 ✅
- 負責人/標籤自動建立 → Task 3 `resolvePlaceholderId`/`resolveTagIds` ✅
- done→completed 同步 → Task 3 `applyStatusCompletionSync` ✅
- 技術(exceljs、preview/commit、伺服器再驗、列數上限、僅 xlsx)→ Task 2/Task 3 ✅
- 前端對話框 + 工具列按鈕 + 重整 → Task 4 ✅
- 測試涵蓋(正規化/驗證/upsert/子任務/同名多筆)→ Task 1 + Task 3 測試 ✅

**Placeholder scan:** 無 TBD/TODO。Task 3 Step 1 與「讀 projects.test.ts 對齊測試建置」「讀 tasks.update 找對應 db 函式」是要求實作者對齊既有碼的具體動作(因 db 回傳/輔助形狀需現場確認),非缺漏;均附保險作法。

**Type consistency:** `NormalizedTaskInput`/`PreviewRow`/`ImportPreview`(Task 1 定義)於 Task 3 服務與 router、Task 4 前端一致使用;`COLUMNS`/`HEADER_ORDER`(Task 1)於 Task 2 範本與解析一致;`buildPreview`/`commitImport`/`buildTemplate`/`parseWorkbook` 簽章在 Task 3 router 與 Task 4 一致。
