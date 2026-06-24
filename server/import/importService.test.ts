import { describe, it, expect, beforeAll } from "vitest";
import { buildPreview, commitImport } from "./importService";
import { COLUMNS } from "./types";
import { upsertUser, getUserByOpenId, createProject, listProjects, listTasksByProject, listTags, listPlaceholders, checkUserOwnsProject, createTask } from "../db";

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

  it("in-sheet duplicate titles: first row is create, second row is error; commit creates only one task", async () => {
    const dupTitle = `重複任務-${Date.now()}`;
    const preview = await buildPreview(userId, projectId, [
      raw({ [COLUMNS.title]: dupTitle, [COLUMNS.priority]: "中" }),
      raw({ [COLUMNS.title]: dupTitle, [COLUMNS.priority]: "高" }),
    ]);

    // First occurrence should be create, second should be error
    expect(preview.rows[0].action).toBe("create");
    expect(preview.rows[1].action).toBe("error");
    expect(preview.summary.create).toBe(1);
    expect(preview.summary.error).toBeGreaterThanOrEqual(1);

    // After commit, only one task with that title should exist
    const tasksBefore = (await listTasksByProject(userId, projectId)).filter((t) => t.title === dupTitle);
    expect(tasksBefore.length).toBe(0); // not yet committed

    const res = await commitImport(userId, projectId, preview.rows);
    expect(res.created).toBe(1);
    expect(res.skipped).toBeGreaterThanOrEqual(1);

    const tasksAfter = (await listTasksByProject(userId, projectId)).filter((t) => t.title === dupTitle);
    expect(tasksAfter.length).toBe(1);
  });

  it("I1: commitImport re-derives action server-side — DB duplicate blocks client update", async () => {
    // Create TWO tasks with the same title directly in the DB to simulate a pre-existing duplicate
    const dupTitle = `DB重複-${Date.now()}`;
    await createTask(userId, { title: dupTitle, priority: "medium", status: "todo", projectId, order: 0 });
    await createTask(userId, { title: dupTitle, priority: "medium", status: "todo", projectId, order: 1 });

    const beforeCount = (await listTasksByProject(userId, projectId)).filter((t) => t.title === dupTitle).length;
    expect(beforeCount).toBe(2);

    // Client sends action:"update" for that title — commit must re-classify as error/skip
    const fakeRows = [
      {
        rowNum: 2,
        action: "update" as const,
        task: {
          title: dupTitle,
          description: null,
          priority: "high" as const,
          status: "todo" as const,
          startDate: null,
          dueDate: null,
          assigneeName: null,
          tagNames: [],
          parentName: null,
        },
        messages: [],
      },
    ];
    const res = await commitImport(userId, projectId, fakeRows);
    expect(res.updated).toBe(0);
    expect(res.skipped).toBeGreaterThanOrEqual(1);

    // Both original tasks must remain untouched
    const afterTasks = (await listTasksByProject(userId, projectId)).filter((t) => t.title === dupTitle);
    expect(afterTasks.length).toBe(2);
    // Neither should have priority changed to "high"
    expect(afterTasks.every((t) => t.priority !== "high")).toBe(true);
  });

  it("C1: checkUserOwnsProject returns correct ownership", async () => {
    // Owner can access their own project
    expect(await checkUserOwnsProject(userId, projectId)).toBe(true);

    // A different userId (that has never created a project here) cannot access this project
    const otherUserId = userId + 9999;
    expect(await checkUserOwnsProject(otherUserId, projectId)).toBe(false);
  });
});
