import { afterEach, describe, expect, it, vi } from "vitest";
import { getLoginUrl } from "./const";

describe("getLoginUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not throw and falls back to /api/dev-login when VITE_OAUTH_PORTAL_URL is unset", () => {
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "");
    expect(() => getLoginUrl()).not.toThrow();
    expect(getLoginUrl()).toBe("/api/dev-login");
  });

  it("builds the Manus portal URL when VITE_OAUTH_PORTAL_URL is configured", () => {
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "https://portal.example.com");
    vi.stubEnv("VITE_APP_ID", "app123");
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    const url = getLoginUrl();
    expect(url.startsWith("https://portal.example.com/app-auth?")).toBe(true);
    expect(url).toContain("appId=app123");
    expect(url).toContain("type=signIn");
  });
});
