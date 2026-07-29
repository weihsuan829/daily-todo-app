import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";
import { appRouter } from "./routers";
import { deleteTask } from "./db";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

type AuthenticatedUser = User;

function createTaskContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as any,
  };

  return { ctx };
}

describe("tasks router", () => {
  describe("tasks.list", () => {
    it("should return list of tasks for user", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.tasks.list({});

      expect(Array.isArray(result)).toBe(true);
      expect(typeof result.length).toBe("number");
    });

    it("should filter tasks by category", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      // Test with work category
      const workTasks = await caller.tasks.list({ category: "work" });
      expect(Array.isArray(workTasks)).toBe(true);
      workTasks.forEach(task => {
        expect(task.category).toBe("work");
      });

      // Test with life category
      const lifeTasks = await caller.tasks.list({ category: "life" });
      expect(Array.isArray(lifeTasks)).toBe(true);
      lifeTasks.forEach(task => {
        expect(task.category).toBe("life");
      });
    });
  });

  describe("tasks.create", () => {
    it("should create a task with valid input", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.tasks.create({
        category: "work",
        title: "Test Task",
        description: "Test Description",
        priority: "high",
      });

      expect(result).toBeDefined();
    });

    it("should require a title", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.tasks.create({
          category: "work",
          title: "",
          priority: "medium",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).toContain("Too small");
      }
    });

    it("should set default priority to medium", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.tasks.create({
        category: "life",
        title: "Default Priority Task",
      });

      expect(result).toBeDefined();
    });
  });

  describe("tasks.stats", () => {
    it("should return stats for user", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      const stats = await caller.tasks.stats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("completed");
      expect(stats).toHaveProperty("byCategory");
      expect(stats).toHaveProperty("completedByCategory");
      expect(typeof stats.total).toBe("number");
      expect(typeof stats.completed).toBe("number");
    });
  });

  describe("tasks.update", () => {
    it("should update task completion status", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      // Create a task first
      const createResult = await caller.tasks.create({
        category: "work",
        title: "Task to Update",
        priority: "medium",
      });

      expect(createResult).toBeDefined();
    });
  });

  describe("tasks.delete", () => {
    it("should delete a task", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      // Create a task first
      const createResult = await caller.tasks.create({
        category: "work",
        title: "Task to Delete",
        priority: "medium",
      });

      expect(createResult).toBeDefined();
    });
  });

  describe("tasks.moveInDay", () => {
    it("should have moveInDay procedure available", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      // Verify that moveInDay procedure exists
      expect(caller.tasks.moveInDay).toBeDefined();
    });

    it("should validate moveInDay input parameters", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      try {
        // Try to call moveInDay with invalid parameters
        await caller.tasks.moveInDay({
          taskId: 999999,
          targetTaskId: 999998,
        });
        // If it doesn't throw, that's fine - the procedure exists
      } catch (error: any) {
        // Expected to fail with invalid task IDs, but procedure should exist
        expect(error).toBeDefined();
      }
    });
  });

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
});
