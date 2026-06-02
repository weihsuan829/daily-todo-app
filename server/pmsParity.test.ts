import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
function ctx(): TrpcContext {
  const user: User = { id: 1, openId: "t", email: "t@e.com", name: "T", loginMethod: "manus",
    role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}
describe("pms parity routers", () => {
  it("tags.list returns an array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).tags.list({ projectId: 1 }))).toBe(true);
  });
  it("tags.create rejects empty name", async () => {
    await expect(appRouter.createCaller(ctx()).tags.create({ projectId: 1, name: "" })).rejects.toThrow();
  });
  it("tags.taskMap returns an array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).tags.taskMap({ projectId: 1 }))).toBe(true);
  });
  it("bulk + setTags procedures exist", () => {
    const c = appRouter.createCaller(ctx());
    expect(c.tasks.bulkUpdate).toBeDefined();
    expect(c.tasks.bulkDelete).toBeDefined();
    expect(c.tasks.setTags).toBeDefined();
  });
});
