import { normalizeRow } from "./normalizeRow";
import { COLUMNS, type ImportPreview, type NormalizedTaskInput, type PreviewRow, type RawRow } from "./types";
import { applyStatusCompletionSync } from "../taskStatus";
import {
  listTasksByProject, createTask, updateTask, listTags, createTag,
  listPlaceholders, createPlaceholder, setTaskTags,
  listWorkspaceMembers, listTaskTags, checkUserOwnsProject,
} from "../db";
import { buildExportWorkbook } from "./xlsx";
import { taskToRow, type ExportCtx, type ExportTask } from "./exportFormat";

// ---------- helpers ----------

/** Build RawRow back from NormalizedTaskInput for server-side re-validation. */
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

/** Map existing project tasks by title -> { ids }. Used for upsert + dup detection. */
async function existingTitleIndex(userId: number, projectId: number) {
  const taskList = await listTasksByProject(userId, projectId);
  const idx = new Map<string, { ids: number[] }>();
  for (const t of taskList) {
    const e = idx.get(t.title) ?? { ids: [] };
    e.ids.push(t.id);
    idx.set(t.title, e);
  }
  return idx;
}

/** Create a task and reliably return its id by re-fetching the project task list. */
async function createTaskReturnId(
  userId: number,
  fields: Parameters<typeof createTask>[1],
): Promise<number | null> {
  await createTask(userId, fields);
  // createTask returns the drizzle insert result (no .id); re-fetch to find the new task.
  const all = await listTasksByProject(userId, fields.projectId as number);
  // Find the most recently created task with this title (last in list, since ordered by createdAt desc).
  const matches = all.filter((t) => t.title === fields.title);
  if (!matches.length) return null;
  // Take the one with the highest id (most recently inserted)
  return matches.reduce((max, t) => (t.id > max ? t.id : max), 0);
}

/** Resolve or auto-create a placeholder member by name; caches ids. */
async function resolvePlaceholderId(
  userId: number,
  projectId: number,
  name: string,
  cache: Map<string, number>,
): Promise<number | null> {
  if (cache.has(name)) return cache.get(name)!;
  // Check if already exists before creating
  let list = await listPlaceholders(userId, projectId);
  let found = list.find((p) => p.name === name);
  if (!found) {
    await createPlaceholder(userId, projectId, name);
    list = await listPlaceholders(userId, projectId);
    found = list.find((p) => p.name === name);
  }
  if (found) cache.set(name, found.id);
  return found?.id ?? null;
}

/** Resolve or auto-create tags by name; caches ids. */
async function resolveTagIds(
  userId: number,
  projectId: number,
  names: string[],
  cache: Map<string, number>,
): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    if (!cache.has(name)) {
      let list = await listTags(userId, projectId);
      let found = list.find((t) => t.name === name);
      if (!found) {
        await createTag(userId, projectId, name);
        list = await listTags(userId, projectId);
        found = list.find((t) => t.name === name);
      }
      if (found) cache.set(name, found.id);
    }
    const id = cache.get(name);
    if (id != null) ids.push(id);
  }
  return ids;
}

/**
 * Classify a normalized task row as "create" | "update" | "error" based on:
 *   - existing DB title index (multiple matching → error; one → update; none → create)
 *   - in-sheet claimed-titles set (already claimed by a prior non-error row → error)
 * Returns action + optional error message.  Does NOT mutate claimedTitles.
 */
function classifyRow(
  title: string,
  idx: Map<string, { ids: number[] }>,
  claimedTitles: Set<string>,
  rowNum: number,
): { action: "create" | "update" | "error"; message?: string } {
  const existing = idx.get(title);
  if (existing && existing.ids.length > 1) {
    return {
      action: "error",
      message: `第 ${rowNum} 列:專案內有多筆同名任務「${title}」,無法判斷要更新哪一筆`,
    };
  }
  if (claimedTitles.has(title)) {
    return {
      action: "error",
      message: `第 ${rowNum} 列:任務名稱「${title}」在本表重複,已略過`,
    };
  }
  if (existing && existing.ids.length === 1) return { action: "update" };
  return { action: "create" };
}

/**
 * On update, only overwrite optional fields that the sheet actually provided;
 * don't blank out fields that the sheet left empty.
 * title, priority, status are always updated.
 */
function pruneForUpdate(
  fields: Record<string, unknown>,
  task: NormalizedTaskInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    title: fields.title,
    priority: fields.priority,
    status: fields.status,
  };
  // completed/completedAt are driven by status — updateTask in db.ts calls applyStatusCompletionSync internally
  if (task.description != null) out.description = task.description;
  if (task.startDate != null) out.startDate = task.startDate;
  if (task.dueDate != null) out.dueDate = task.dueDate;
  if (task.assigneeName != null) out.assigneePlaceholderId = fields.assigneePlaceholderId;
  return out;
}

// ---------- public API ----------

export async function buildPreview(
  userId: number,
  projectId: number,
  rawRows: RawRow[],
): Promise<ImportPreview> {
  const idx = await existingTitleIndex(userId, projectId);
  const sheetTitles = new Set<string>();
  // Track titles already claimed by a non-error row in this sheet (for in-sheet duplicate detection)
  const claimedTitles = new Set<string>();
  const rows: PreviewRow[] = [];

  rawRows.forEach((rawRow, i) => {
    const rowNum = i + 2; // header is row 1
    const { task, messages, ok } = normalizeRow(rawRow, rowNum);

    if (!ok) {
      rows.push({ rowNum, action: "error", task, messages });
      return;
    }

    const msgs = [...messages];
    const classification = classifyRow(task.title, idx, claimedTitles, rowNum);
    if (classification.action === "error") {
      rows.push({ rowNum, action: "error", task, messages: [classification.message!] });
      return;
    }
    const action = classification.action;

    // Parent self-reference warning (other "not found" warnings deferred until after full scan)
    if (task.parentName && task.parentName === task.title) {
      msgs.push(`第 ${rowNum} 列:上層任務不可為自己,已忽略`);
    }

    claimedTitles.add(task.title);
    sheetTitles.add(task.title);
    rows.push({ rowNum, action, task, messages: msgs });
  });

  // Second scan: finalize "parent not found" warnings now that all sheet titles are known
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

export async function commitImport(
  userId: number,
  projectId: number,
  rows: PreviewRow[],
): Promise<{ created: number; updated: number; skipped: number; warnings: string[] }> {
  const warnings: string[] = [];
  let created = 0, updated = 0, skipped = 0;
  const phCache = new Map<string, number>();
  const tagCache = new Map<string, number>();

  // Server-side re-validation: re-normalize AND re-classify action (ignore client-supplied action).
  // Re-build the existing-title index fresh so classification mirrors buildPreview's rules.
  const commitIdx = await existingTitleIndex(userId, projectId);
  const commitClaimed = new Set<string>();

  type ValidRow = { rowNum: number; action: "create" | "update"; task: NormalizedTaskInput; _taskId?: number };
  const valid: ValidRow[] = [];
  for (const r of rows) {
    const re = normalizeRow(toRaw(r.task), r.rowNum);
    if (!re.ok) { skipped++; warnings.push(`第 ${r.rowNum} 列:伺服器重新驗證失敗`); continue; }
    const cls = classifyRow(re.task.title, commitIdx, commitClaimed, r.rowNum);
    if (cls.action === "error") { skipped++; continue; }
    commitClaimed.add(re.task.title);
    valid.push({ rowNum: r.rowNum, action: cls.action, task: re.task });
  }

  // title -> taskId map (seeded with existing tasks for parent resolution)
  const titleToId = new Map<string, number>();
  for (const t of await listTasksByProject(userId, projectId)) {
    titleToId.set(t.title, t.id);
  }

  // Pass 1: create/update tasks (parentTaskId not set yet)
  for (const r of valid) {
    const assigneeId = r.task.assigneeName
      ? await resolvePlaceholderId(userId, projectId, r.task.assigneeName, phCache)
      : null;
    const tagIds = r.task.tagNames.length
      ? await resolveTagIds(userId, projectId, r.task.tagNames, tagCache)
      : [];

    // Apply status<->completed sync so createTask stores correct completed/completedAt.
    // Input typed as StatusSyncInput so the generic T picks up completed/completedAt.
    const syncInput = { status: r.task.status, completed: undefined as boolean | undefined, completedAt: undefined as Date | null | undefined };
    const synced = applyStatusCompletionSync(syncInput);

    const allFields = {
      title: r.task.title,
      description: r.task.description ?? undefined,
      priority: r.task.priority,
      status: r.task.status,
      completed: synced.completed ?? false,
      completedAt: synced.completedAt ?? undefined,
      startDate: r.task.startDate ?? undefined,
      dueDate: r.task.dueDate ?? undefined,
      assigneePlaceholderId: assigneeId ?? undefined,
      projectId,
    } as const;

    let taskId: number | null = null;

    if (r.action === "update") {
      const existingId = titleToId.get(r.task.title);
      if (existingId != null) {
        // updateTask(taskId, userId, updates) — already calls applyStatusCompletionSync internally
        const updateFields = pruneForUpdate(allFields as Record<string, unknown>, r.task);
        await updateTask(existingId, userId, updateFields as Parameters<typeof updateTask>[2]);
        taskId = existingId;
        updated++;
      } else {
        // Existing task disappeared between preview and commit — create instead
        r.action = "create";
      }
    }

    if (taskId == null) {
      // create
      const id = await createTaskReturnId(userId, allFields);
      if (id == null) {
        skipped++;
        warnings.push(`第 ${r.rowNum} 列:建立失敗`);
        continue;
      }
      taskId = id;
      titleToId.set(r.task.title, id);
      created++;
    }

    if (tagIds.length) await setTaskTags(userId, taskId, tagIds);
    r._taskId = taskId;
  }

  // Pass 2: wire parent references
  for (const r of valid) {
    const p = r.task.parentName;
    const selfId = r._taskId;
    if (!p || p === r.task.title || selfId == null) continue;
    const parentId = titleToId.get(p);
    if (parentId == null) {
      warnings.push(`第 ${r.rowNum} 列:找不到上層任務「${p}」,已建為頂層`);
      continue;
    }
    // updateTask already handles applyStatusCompletionSync; we just set parentTaskId
    await updateTask(selfId, userId, { parentTaskId: parentId });
  }

  return { created, updated, skipped, warnings };
}

export async function buildExport(userId: number, projectId: number): Promise<Buffer> {
  const owns = await checkUserOwnsProject(userId, projectId);
  if (!owns) throw new Error("User does not own project");

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
