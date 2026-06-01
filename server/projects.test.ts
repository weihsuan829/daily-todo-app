import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function ctx(): TrpcContext {
  const user: User = { id: 1, openId: "t", email: "t@e.com", name: "T", loginMethod: "manus",
    role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

describe("projects router", () => {
  it("projects.list returns an array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).projects.list())).toBe(true);
  });
  it("projects.create rejects empty name", async () => {
    await expect(appRouter.createCaller(ctx()).projects.create({ name: "" })).rejects.toThrow();
  });
  it("tasks.setStatus validates the enum", async () => {
    const c = appRouter.createCaller(ctx());
    expect(c.tasks.setStatus).toBeDefined();
    // @ts-expect-error invalid status
    await expect(c.tasks.setStatus({ id: 1, status: "nope" })).rejects.toThrow();
  });
  it("tasks.listByProject returns an array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).tasks.listByProject({ projectId: 1 }))).toBe(true);
  });
  it("tasks.reorder is defined", async () => {
    expect(appRouter.createCaller(ctx()).tasks.reorder).toBeDefined();
  });
});
