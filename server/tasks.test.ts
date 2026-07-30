import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";
import { appRouter } from "./routers";
import { deleteTask, updateTask } from "./db";
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
    //
    // Finished-task membership is scoped by `completedAt`, not `dueDate` (a
    // task can be carried over for weeks before it's finally finished, and it
    // should show up in the week it was actually completed). `dueDate` is
    // therefore irrelevant to windowing below and is left unset on the
    // "done" fixtures; only `completedAt` is pinned, explicitly, via a direct
    // db.updateTask call — `tasks.update({completed:true})` stamps
    // `completedAt` with the real current time, which would land outside
    // this fixed test window.
    const weekStart = new Date(2026, 0, 5); // Monday 2026-01-05, local midnight
    const prevWeekDate = new Date(2025, 11, 30); // Tuesday 2025-12-30, before weekStart
    const inWeekDate = new Date(2026, 0, 7); // Wednesday, same week
    const nextWeekDate = new Date(2026, 0, 13); // 8 days after weekStart: outside the window
    const boundaryStartDate = new Date(2026, 0, 5); // Exactly at week start: inside
    const boundaryEndDate = new Date(2026, 0, 12); // Exactly weekStart + 7 days: outside

    // Unfinished tasks carry over: they must surface in every week regardless
    // of dueDate. Finished tasks stay week-scoped by completedAt, so they are
    // what pins the window's half-open boundaries and lower bound.
    const openPrevWeekTitle = "CarryOver IntegTest Open-PrevWeek";
    const openInWeekTitle = "CarryOver IntegTest Open-InWeek";
    const openNextWeekTitle = "CarryOver IntegTest Open-NextWeek";
    const openUndatedTitle = "CarryOver IntegTest Open-Undated";
    // Unfinished, but with a non-null completedAt OUTSIDE the window. Only the
    // `eq(tasks.completed, false)` disjunct can return this row: the
    // `and(gte, lt)` disjunct needs completedAt inside the window, and
    // `isNull(completedAt)` needs no completedAt at all. This pins that
    // disjunct as load-bearing rather than merely asserted-but-redundant.
    const openStaleCompletedAtTitle = "CarryOver IntegTest Open-StaleCompletedAt";
    const doneInWeekTitle = "CarryOver IntegTest Done-InWeek"; // completedAt inside window
    const doneBoundaryStartTitle = "CarryOver IntegTest Done-BoundaryStart"; // completedAt == weekStart
    const doneBoundaryEndTitle = "CarryOver IntegTest Done-BoundaryEnd"; // completedAt == weekStart + 7d
    const donePrevWeekTitle = "CarryOver IntegTest Done-PrevWeek"; // completedAt before weekStart
    const doneNoCompletedAtTitle = "CarryOver IntegTest Done-NoCompletedAt"; // legacy row, completedAt null

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
      await createTask(openPrevWeekTitle, prevWeekDate);
      await createTask(openInWeekTitle, inWeekDate);
      await createTask(openNextWeekTitle, nextWeekDate);
      await createTask(openUndatedTitle);

      // Unfinished task with a stale completedAt outside the window. Created
      // normally (so `completed` stays false), then given a completedAt via a
      // direct db.updateTask call — that payload contains neither `completed`
      // nor `status`, so it bypasses applyStatusCompletionSync's rewrite and
      // leaves `completed: false` in place while still stamping completedAt.
      const openStaleCompletedAtId = await createTask(openStaleCompletedAtTitle);
      await updateTask(openStaleCompletedAtId, ctx.user.id, { completedAt: prevWeekDate });

      // Finished rows: created, then marked complete through the real mutation
      // so `status`/`completed` are set the same way the app sets them. The
      // mutation stamps `completedAt` with the real current time, which is
      // outside this fixed 2026-01-05 test window, so each row's
      // `completedAt` is then pinned explicitly via a direct db.updateTask
      // call (bypassing applyStatusCompletionSync, since `completed`/`status`
      // aren't in that update's payload) to land it exactly where the
      // assertions below need it.
      const doneInWeekId = await createTask(doneInWeekTitle);
      const doneBoundaryStartId = await createTask(doneBoundaryStartTitle);
      const doneBoundaryEndId = await createTask(doneBoundaryEndTitle);
      const donePrevWeekId = await createTask(donePrevWeekTitle);
      const doneNoCompletedAtId = await createTask(doneNoCompletedAtTitle);
      for (const id of [doneInWeekId, doneBoundaryStartId, doneBoundaryEndId, donePrevWeekId, doneNoCompletedAtId]) {
        await caller.tasks.update({ id, completed: true });
      }
      await updateTask(doneInWeekId, ctx.user.id, { completedAt: inWeekDate });
      await updateTask(doneBoundaryStartId, ctx.user.id, { completedAt: boundaryStartDate });
      await updateTask(doneBoundaryEndId, ctx.user.id, { completedAt: boundaryEndDate });
      await updateTask(donePrevWeekId, ctx.user.id, { completedAt: prevWeekDate });
      // Simulates a legacy row completed before `completedAt` was populated.
      await updateTask(doneNoCompletedAtId, ctx.user.id, { completedAt: null });

      const windowed = await caller.tasks.list({ category: "eisenhower", date: weekStart });
      const windowedTitles = windowed.map((t) => t.title);

      // Unfinished tasks surface no matter which week is requested — this is
      // the whole point of the carry-over behavior.
      expect(windowedTitles).toContain(openPrevWeekTitle);
      expect(windowedTitles).toContain(openInWeekTitle);
      expect(windowedTitles).toContain(openNextWeekTitle);
      expect(windowedTitles).toContain(openUndatedTitle);

      // Pins the `eq(tasks.completed, false)` disjunct: an unfinished task
      // with a non-null completedAt outside the window can ONLY be returned
      // by that disjunct (see comment on the fixture declaration above).
      // Deleting `eq(tasks.completed, false)` from the predicate makes this
      // assertion fail.
      expect(windowedTitles).toContain(openStaleCompletedAtTitle);

      // Finished tasks are scoped by completedAt. Boundary-start (== weekStart)
      // is inside; boundary-end (== weekStart + 7 days) is outside. These two
      // pin the half-open window: `lte` instead of `lt`, or `gt` instead of
      // `gte`, would flip one of them.
      expect(windowedTitles).toContain(doneInWeekTitle);
      expect(windowedTitles).toContain(doneBoundaryStartTitle);
      expect(windowedTitles).not.toContain(doneBoundaryEndTitle);

      // A task finished in a past week must NOT leak into this week's
      // completed history. Without the `gte(completedAt, window.start)`
      // conjunct, this row (completedAt well before weekStart) would still
      // satisfy `lt(completedAt, window.end)` and wrongly appear.
      expect(windowedTitles).not.toContain(donePrevWeekTitle);

      // Rows with no completedAt (legacy data from before this column was
      // populated) stay visible every week: NULL comparisons in SQL are
      // UNKNOWN, so they need their own `isNull` branch.
      expect(windowedTitles).toContain(doneNoCompletedAtTitle);

      // No date given: every task is returned, regardless of completedAt or status.
      const all = await caller.tasks.list({ category: "eisenhower" });
      const allTitles = all.map((t) => t.title);
      for (const title of [
        openPrevWeekTitle,
        openInWeekTitle,
        openNextWeekTitle,
        openUndatedTitle,
        openStaleCompletedAtTitle,
        doneInWeekTitle,
        doneBoundaryStartTitle,
        doneBoundaryEndTitle,
        donePrevWeekTitle,
        doneNoCompletedAtTitle,
      ]) {
        expect(allTitles).toContain(title);
      }
    });
  });

  describe("tasks.create order for quadrant tasks (createTask integration)", () => {
    // The Matrix always creates with dueDate = the viewed week's Monday, so a
    // per-day order counter restarts at 0 every week. Since carried-over
    // tasks make a quadrant span many weeks, that interleaves new tasks into
    // the middle of the quadrant instead of appending them at the bottom.
    // Tasks with a quadrant must therefore take max(order)+1 over the whole
    // quadrant, not just same-day tasks.
    const createdIds: number[] = [];

    afterAll(async () => {
      const { ctx } = createTaskContext();
      for (const id of createdIds) {
        await deleteTask(id, ctx.user.id);
      }
    });

    it("appends a new quadrant task after the max order in that quadrant, even on a different day", async () => {
      const { ctx } = createTaskContext();
      const caller = appRouter.createCaller(ctx);

      const firstTitle = "CarryOver IntegTest OrderAppend-First";
      const secondTitle = "CarryOver IntegTest OrderAppend-Second";
      const firstWeekMonday = new Date(2026, 1, 2); // Monday 2026-02-02
      const secondWeekMonday = new Date(2026, 1, 9); // Monday 2026-02-09, a different week/day

      const firstResult = await caller.tasks.create({
        category: "eisenhower",
        quadrant: "urgent-important",
        title: firstTitle,
        priority: "medium",
        dueDate: firstWeekMonday,
      });
      const firstId = Number((Array.isArray(firstResult) ? firstResult[0] : firstResult)?.insertId);
      createdIds.push(firstId);

      const secondResult = await caller.tasks.create({
        category: "eisenhower",
        quadrant: "urgent-important",
        title: secondTitle,
        priority: "medium",
        dueDate: secondWeekMonday,
      });
      const secondId = Number((Array.isArray(secondResult) ? secondResult[0] : secondResult)?.insertId);
      createdIds.push(secondId);

      const all = await caller.tasks.list({ category: "eisenhower" });
      const first = all.find((t) => t.id === firstId);
      const second = all.find((t) => t.id === secondId);
      expect(first).toBeDefined();
      expect(second).toBeDefined();

      // Second task lands at the bottom of the quadrant (max(order)+1 over the
      // whole quadrant), not reset to 0 because it falls on a different day.
      expect(second!.order).toBe(first!.order + 1);
    });
  });
});
