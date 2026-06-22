import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

/**
 * Dev-login bypass route (no OAuth required).
 *
 * Manus-generated apps authenticate via the Manus OAuth server. This route
 * creates a fixed local user and issues a valid session cookie signed with
 * JWT_SECRET — letting you in with one click, without an OAuth server.
 *
 * The route is registered when EITHER condition is true:
 *   1. NODE_ENV === "development"  (local dev server)
 *   2. ALLOW_DEV_LOGIN === "1"     (self-hosted production without an OAuth
 *                                   server — set explicitly in .env.prod)
 *
 * It is OFF by default in production: a cloud deploy that sets neither
 * NODE_ENV=development nor ALLOW_DEV_LOGIN=1 never registers this route.
 *
 * Visit http://localhost:<port>/api/dev-login to sign in.
 */
export function registerDevAuthRoutes(app: Express) {
  app.get("/api/dev-login", async (_req: Request, res: Response) => {
    const openId = ENV.ownerOpenId || "dev-user";
    try {
      await db.upsertUser({
        openId,
        name: "Dev User",
        email: "dev@local.test",
        loginMethod: "dev",
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name: "Dev User",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(_req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[DevAuth] dev-login failed", error);
      res.status(500).json({ error: "dev-login failed", detail: String(error) });
    }
  });
}
