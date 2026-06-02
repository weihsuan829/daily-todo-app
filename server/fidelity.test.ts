import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
function ctx(): TrpcContext {
  const user: User = { id: 1, openId: "t", email: "t@e.com", name: "T", loginMethod: "manus",
    role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}
describe("fidelity routers", () => {
  it("members.list returns array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).members.list({ projectId: 1 }))).toBe(true);
  });
  it("placeholders.list returns array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).placeholders.list({ projectId: 1 }))).toBe(true);
  });
  it("placeholders.create rejects empty name", async () => {
    await expect(appRouter.createCaller(ctx()).placeholders.create({ projectId: 1, name: "" })).rejects.toThrow();
  });
  it("tasks.update accepts priority urgent + assigneeId", async () => {
    // should not throw a validation error (DB no-op is fine)
    await appRouter.createCaller(ctx()).tasks.update({ id: 999999, priority: "urgent", assigneeId: 1 });
    expect(true).toBe(true);
  });
});
