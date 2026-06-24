import { describe, it, expect, beforeAll } from "vitest";
import { buildPreview, commitImport } from "./importService";
import { COLUMNS } from "./types";
import { upsertUser, getUserByOpenId, createProject, listProjects, listTasksByProject, listTags, listPlaceholders } from "../db";

// Inline user+workspace+project setup (mirrors projects.test.ts approach but hits the real test DB)
let userId: number;
let projectId: number;

const TEST_OPEN_ID = `import-test-${Date.now()}`;

beforeAll(async () => {
  // Create user
  await upsertUser({ openId: TEST_OPEN_ID, name: "Import Tester", email: "import@test.com" });
  const user = await getUserByOpenId(TEST_OPEN_ID);
  if (!user) throw new Error("Failed to create test user");
  userId = user.id;

  // createProject creates a default workspace automatically via ensureDefaultWorkspace
  await createProject(userId, `Test Project ${Date.now()}`);
  const projs = await listProjects(userId);
  if (!projs.length) throw new Error("Failed to create test project");
  projectId = projs[projs.length - 1].id;
});

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
