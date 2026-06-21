import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function ctx(): TrpcContext {
  const user = { id: 1 } as User;
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

describe("frameworks router", () => {
  it("frameworks.list returns an array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).frameworks.list())).toBe(true);
  });
  it("frameworks.delete validates id type", async () => {
    // @ts-expect-error invalid input
    await expect(appRouter.createCaller(ctx()).frameworks.delete({ id: "x" })).rejects.toThrow();
  });
});
