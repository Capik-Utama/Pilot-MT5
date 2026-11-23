import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { pilotUserAccess } from "../../drizzle/schema";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import {
  DUMMY_PASSWORD_HASH,
  PASSWORD_LOGIN_METHOD,
  verifyPassword,
} from "./password";
import { sdk } from "./sdk";

const GENERIC_LOGIN_ERROR = "Email atau kata sandi tidak valid.";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const validEmail = (value: string) =>
  value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const json = (res: Response, status: number, value: unknown) =>
  res.status(status).set("Cache-Control", "no-store").json(value);
const fail = (res: Response, status: number, error: string) =>
  json(res, status, { error });

function passwordLockTime(value: unknown): number {
  if (value == null) return 0;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function recordFailedAttempt(database: any, accessId: string) {
  await database.transaction(async (tx: any) => {
    const rows = await tx
      .select({ failedPasswordAttempts: pilotUserAccess.failedPasswordAttempts })
      .from(pilotUserAccess)
      .where(eq(pilotUserAccess.id, accessId))
      .limit(1)
      .for("update");
    if (!rows[0]) return;
    const attempts = Number(rows[0].failedPasswordAttempts || 0) + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await tx
        .update(pilotUserAccess)
        .set({
          failedPasswordAttempts: 0,
          passwordLockedUntil: new Date(Date.now() + LOCKOUT_MS),
        })
        .where(eq(pilotUserAccess.id, accessId));
    } else {
      await tx
        .update(pilotUserAccess)
        .set({ failedPasswordAttempts: attempts })
        .where(eq(pilotUserAccess.id, accessId));
    }
  });
}

export function registerPasswordAuthRoutes(app: Express) {
  app.post("/api/auth/password/login", async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    if (!req.is("application/json"))
      return fail(res, 415, "Permintaan login harus memakai JSON.");

    const requestBody =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const email =
      typeof requestBody.email === "string"
        ? normalizeEmail(requestBody.email)
        : "";
    const password =
      typeof requestBody.password === "string" ? requestBody.password : "";
    if (
      !validEmail(email) ||
      !password.length ||
      password.length > 128 ||
      Buffer.byteLength(password, "utf8") > 512
    ) {
      await verifyPassword(password.slice(0, 128), DUMMY_PASSWORD_HASH).catch(
        () => false
      );
      return fail(res, 401, GENERIC_LOGIN_ERROR);
    }

    try {
      const database = await db.getDb();
      if (!database)
        return fail(res, 503, "Layanan login sementara tidak tersedia.");

      const rows = await database
        .select()
        .from(pilotUserAccess)
        .where(eq(pilotUserAccess.email, email))
        .limit(2);
      // The application has one owner scope. Ambiguous email records fail closed.
      const access = rows.length === 1 ? rows[0] : undefined;
      const storedHash = access?.passwordHash || DUMMY_PASSWORD_HASH;
      const now = Date.now();
      const locked =
        !!access && passwordLockTime(access.passwordLockedUntil) > now;
      const valid = await verifyPassword(password, storedHash).catch(() => false);

      if (!access || !access.passwordHash || locked || !valid) {
        if (access?.passwordHash && !locked)
          await recordFailedAttempt(database, access.id);
        return fail(res, 401, GENERIC_LOGIN_ERROR);
      }

      await database
        .update(pilotUserAccess)
        .set({ failedPasswordAttempts: 0, passwordLockedUntil: null })
        .where(eq(pilotUserAccess.id, access.id));

      const sessionOpenId =
        access.accessRole === "owner"
          ? access.ownerOpenId
          : access.openId ||
            `pwd_${createHash("sha256").update(email).digest("hex").slice(0, 60)}`;
      if (!sessionOpenId || sessionOpenId.length > 64)
        return fail(res, 401, GENERIC_LOGIN_ERROR);

      const existingUser = await db.getUserByOpenId(sessionOpenId);
      const displayName = email.split("@")[0].slice(0, 80) || email;
      await db.upsertUser({
        openId: sessionOpenId,
        name: existingUser?.name ?? displayName,
        email,
        loginMethod: PASSWORD_LOGIN_METHOD,
        role: access.accessRole === "owner" ? "admin" : "user",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(sessionOpenId, {
        name: existingUser?.name ?? displayName,
        expiresInMs: ONE_YEAR_MS,
      });
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      return json(res, 200, { ok: true, sessionToken });
    } catch {
      // Never log request bodies or credential material.
      console.error("[PasswordAuth] Login request failed.");
      return fail(res, 503, "Layanan login sementara tidak tersedia.");
    }
  });
}
