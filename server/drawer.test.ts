import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
function ctx(): TrpcContext {
  const user: User = { id: 1, openId: "t", email: "t@e.com", name: "T", loginMethod: "manus",
    role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}
describe("drawer routers", () => {
  it("attachments.list returns array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).attachments.list({ taskId: 1 }))).toBe(true);
  });
  it("comments.list returns array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).comments.list({ taskId: 1 }))).toBe(true);
  });
  it("comments.create rejects empty content", async () => {
    await expect(appRouter.createCaller(ctx()).comments.create({ taskId: 1, content: "" })).rejects.toThrow();
  });
  it("tasks.update accepts color", async () => {
    await appRouter.createCaller(ctx()).tasks.update({ id: 999999, color: "#8b5cf6" });
    expect(true).toBe(true);
  });
});
