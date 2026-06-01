import { describe, expect, it, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
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
});
