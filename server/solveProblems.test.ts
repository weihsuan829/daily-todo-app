import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function ctx(): TrpcContext {
  const user = { id: 1 } as User;
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

describe("solveProblems router", () => {
  it("history returns an array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).solveProblems.history())).toBe(true);
  });
  it("analyze rejects empty problemText", async () => {
    await expect(appRouter.createCaller(ctx()).solveProblems.analyze({ problemText: "" })).rejects.toThrow();
  });
  it("get returns solution and messages shape", async () => {
    const r = await appRouter.createCaller(ctx()).solveProblems.get({ id: 999999 });
    expect(r).toHaveProperty("solution");
    expect(r).toHaveProperty("messages");
    expect(Array.isArray(r.messages)).toBe(true);
  });
  it("discuss rejects empty message", async () => {
    await expect(appRouter.createCaller(ctx()).solveProblems.discuss({ problemSolutionId: 1, message: "" }))
      .rejects.toThrow();
  });
});
