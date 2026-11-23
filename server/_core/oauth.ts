import { randomUUID } from "node:crypto";
import {
  COOKIE_NAME,
  LOCAL_OAUTH_STATE_COOKIE,
  ONE_YEAR_MS,
  OAUTH_STATE_COOKIE,
  decodeOAuthState,
  encodeOAuthState,
} from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function configuredOrigin(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  const url = new URL(value);
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an origin without a path`);
  }
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error(`${name} must use HTTPS in production`);
  }
  return url.origin;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/start", (_req: Request, res: Response) => {
    res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer");
    try {
      configuredOrigin(process.env.FRONTEND_URL, "FRONTEND_URL");
      const apiOrigin = configuredOrigin(
        process.env.PUBLIC_API_URL,
        "PUBLIC_API_URL"
      );
      const portalUrl = process.env.MANUS_OAUTH_PORTAL_URL?.replace(/\/+$/, "");
      if (!portalUrl || !ENV.appId) {
        throw new Error("Manus OAuth portal URL or project ID is not configured");
      }

      const nonce = randomUUID();
      res.cookie(OAUTH_STATE_COOKIE, nonce, {
        httpOnly: true,
        path: "/",
        secure: true,
        sameSite: "none",
        maxAge: 10 * 60 * 1000,
      });

      const redirectUri = `${apiOrigin}/api/oauth/callback`;
      const state = encodeOAuthState({ redirectUri, nonce });
      const authorizationUrl = new URL(`${portalUrl}/app-auth`);
      authorizationUrl.searchParams.set("appId", ENV.appId);
      authorizationUrl.searchParams.set("redirectUri", redirectUri);
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("responseType", "code");
      res.redirect(302, authorizationUrl.toString());
    } catch (error) {
      console.error(
        "[OAuth] Login start is not configured",
        error instanceof Error ? error.message : "unknown error"
      );
      res.status(503).json({ error: "OAuth login is not configured on the API server" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer");
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const localHttp = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      req.hostname.toLowerCase()
    );
    const stateCookie = localHttp
      ? LOCAL_OAUTH_STATE_COOKIE
      : OAUTH_STATE_COOKIE;
    const stateCookieOptions = localHttp
      ? { path: "/", sameSite: "lax" as const }
      : { path: "/", secure: true, sameSite: "none" as const };
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[
      stateCookie
    ];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(stateCookie, stateCookieOptions);

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      const frontendOrigin = process.env.FRONTEND_URL
        ? configuredOrigin(process.env.FRONTEND_URL, "FRONTEND_URL")
        : undefined;
      if (frontendOrigin) {
        const frontendUrl = new URL("/", frontendOrigin);
        frontendUrl.hash = new URLSearchParams({
          pilot_session: sessionToken,
        }).toString();
        res.redirect(302, frontendUrl.toString());
      } else {
        res.redirect(302, "/");
      }
    } catch (error) {
      console.error(
        "[OAuth] Callback failed",
        error instanceof Error ? error.message : "unknown error"
      );
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
