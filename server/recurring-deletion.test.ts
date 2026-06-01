import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
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
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("Recurring Task Deletion Persistence", () => {
  it("should generate recurring task instances for multiple weeks", async () => {
    const ctx = createAuthContext(9999);
    const caller = appRouter.createCaller(ctx);

    // Create a recurring task
    await caller.recurring.create({
      category: "work",
      title: "Test Weekly Meeting",
      description: "Test meeting every Tuesday",
      priority: "high",
      recurrenceType: "weekly",
      dayOfWeek: 2, // Tuesday
    });

    // Get tasks - should include recurring instances
    const tasks = await caller.tasks.list({ category: "work" });
    const testTaskInstances = tasks.filter(t => t.title === "Test Weekly Meeting");

    // Should have multiple instances (at least 10 for 90 days with weekly recurrence)
    expect(testTaskInstances.length).toBeGreaterThanOrEqual(10);
  });

  it("should allow deleting a single recurring instance", async () => {
    const ctx = createAuthContext(9998);
    const caller = appRouter.createCaller(ctx);

    // Create a recurring task
    await caller.recurring.create({
      category: "work",
      title: "Test Weekly Task",
      description: "Test task every Tuesday",
      priority: "medium",
      recurrenceType: "weekly",
      dayOfWeek: 2, // Tuesday
    });

    // Get initial tasks
    const initialTasks = await caller.tasks.list({ category: "work" });
    const initialCount = initialTasks.filter(t => t.title === "Test Weekly Task").length;

    // Get the first instance
    const firstInstance = initialTasks.find(t => t.title === "Test Weekly Task" && t.id < 0);
    expect(firstInstance).toBeDefined();

    if (firstInstance) {
      // Delete the first instance
      await caller.tasks.delete({
        id: firstInstance.id,
        dueDate: firstInstance.dueDate,
      });

      // Get tasks again
      const tasksAfterDelete = await caller.tasks.list({ category: "work" });
      const countAfterDelete = tasksAfterDelete.filter(t => t.title === "Test Weekly Task").length;

      // Should have one less instance
      expect(countAfterDelete).toBe(initialCount - 1);
    }
  });

  it("should still generate instances for future weeks", async () => {
    const ctx = createAuthContext(9997);
    const caller = appRouter.createCaller(ctx);

    // Create a recurring task
    await caller.recurring.create({
      category: "work",
      title: "Test Future Task",
      description: "Test task every Wednesday",
      priority: "low",
      recurrenceType: "weekly",
      dayOfWeek: 3, // Wednesday
    });

    // Get tasks
    const tasks = await caller.tasks.list({ category: "work" });
    const testTaskInstances = tasks.filter(t => t.title === "Test Future Task");

    // Should have multiple instances spanning multiple weeks
    expect(testTaskInstances.length).toBeGreaterThanOrEqual(10);

    // Verify instances span different dates
    const dates = testTaskInstances.map(t => new Date(t.dueDate!).toISOString().split('T')[0]);
    const uniqueDates = new Set(dates);
    expect(uniqueDates.size).toBeGreaterThanOrEqual(8);
  });
});
