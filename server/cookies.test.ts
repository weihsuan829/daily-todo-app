import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";

function reqWith(opts: { protocol?: string; xfp?: string }) {
  return {
    protocol: opts.protocol ?? "http",
    headers: opts.xfp ? { "x-forwarded-proto": opts.xfp } : {},
  } as any;
}

describe("getSessionCookieOptions", () => {
  it("plain http → sameSite=lax + secure=false (browsers reject SameSite=None without Secure)", () => {
    const o = getSessionCookieOptions(reqWith({ protocol: "http" }));
    expect(o.secure).toBe(false);
    expect(o.sameSite).toBe("lax");
  });

  it("https → sameSite=none + secure=true (cross-site production behavior)", () => {
    const o = getSessionCookieOptions(reqWith({ protocol: "https" }));
    expect(o.secure).toBe(true);
    expect(o.sameSite).toBe("none");
  });

  it("x-forwarded-proto=https → treated as secure", () => {
    const o = getSessionCookieOptions(reqWith({ protocol: "http", xfp: "https" }));
    expect(o.secure).toBe(true);
    expect(o.sameSite).toBe("none");
  });
});
