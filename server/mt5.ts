import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { mt5Accounts, mt5CommandEvents, mt5Commands } from "../drizzle/schema";

const ONLINE_WINDOW_MS = 15_000;
const COMMAND_TTL_MS = 45_000;
const UNACKNOWLEDGED_COMMAND_STATES = ["queued", "delivered"] as const;
const eaModeSchema = z.enum(["auto", "manual"]);
const telemetrySchema = z.object({
  balance: z.number().finite().min(0).max(1e15),
  equity: z.number().finite().min(-1e12).max(1e15),
  maxDdBuyPct: z.number().finite().min(0).max(100),
  maxDdSellPct: z.number().finite().min(0).max(100),
  running: z.boolean(),
  eaMode: eaModeSchema,
  currency: z.string().trim().regex(/^[A-Z]{3,8}$/).optional(),
  latencyMs: z.number().int().min(0).max(60_000).optional(),
}).strict();

const ackSchema = z.object({
  status: z.enum(["accepted", "succeeded", "failed"]),
  message: z.string().trim().max(500).optional(),
}).strict();

type CommandAction = "auto" | "manual" | "buy" | "sell" | "close_buy" | "close_sell" | "close_all" | "reset";
type CommandStatus = "queued" | "delivered" | "accepted" | "succeeded" | "failed" | "expired";

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function eventRow(command: { id: string; accountId: string; ownerOpenId: string }, status: CommandStatus, message?: string | null) {
  return {
    id: randomUUID().replaceAll("-", "").toLowerCase(),
    commandId: command.id,
    accountId: command.accountId,
    ownerOpenId: command.ownerOpenId,
    status,
    message: message ?? null,
  };
}

function bearer(req: Request): string | null {
  const value = req.header("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7).trim();
  return token.length >= 40 && token.length <= 128 ? token : null;
}

async function authenticateEa(req: Request) {
  const token = bearer(req);
  if (!token) return null;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db.select().from(mt5Accounts).where(eq(mt5Accounts.tokenHash, hashToken(token))).limit(1);
  return rows[0] ?? null;
}

function safeError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

export function registerMt5Routes(app: Express) {
  app.post("/api/mt5/telemetry", async (req, res) => {
    try {
      const account = await authenticateEa(req);
      if (!account) return safeError(res, 401, "Invalid EA token");
      const parsed = telemetrySchema.safeParse(req.body);
      if (!parsed.success) return safeError(res, 400, "Invalid telemetry payload");
      const value = parsed.data;
      const db = await getDb();
      if (!db) return safeError(res, 503, "Database unavailable");
      await db.update(mt5Accounts).set({
        telemetryReceived: true,
        balance: value.balance,
        equity: value.equity,
        maxDdBuyPct: value.maxDdBuyPct,
        maxDdSellPct: value.maxDdSellPct,
        running: value.running,
        eaMode: value.eaMode,
        ...(value.currency ? { currency: value.currency } : {}),
        latencyMs: value.latencyMs ?? null,
        lastSeenAt: new Date(),
      }).where(eq(mt5Accounts.id, account.id));
      res.status(200).json({ ok: true, serverTime: new Date().toISOString() });
    } catch (error) {
      console.error("[MT5] Telemetry failed", error instanceof Error ? error.message : "unknown error");
      safeError(res, 500, "Telemetry could not be stored");
    }
  });

  app.get("/api/mt5/commands/next", async (req, res) => {
    try {
      const account = await authenticateEa(req);
      if (!account) return safeError(res, 401, "Invalid EA token");
      const db = await getDb();
      if (!db) return safeError(res, 503, "Database unavailable");
      const now = new Date();
      const command = await db.transaction(async tx => {
        const rows = await tx.select().from(mt5Commands).where(and(
          eq(mt5Commands.accountId, account.id),
          inArray(mt5Commands.status, [...UNACKNOWLEDGED_COMMAND_STATES]),
        )).orderBy(asc(mt5Commands.createdAt)).limit(10).for("update");
        const current = rows.find((item) => item.status === "queued" || item.expiresAt > now);
        if (!current) return null;
        if (current.status === "queued") {
          await tx.update(mt5Commands).set({ status: "delivered", deliveredAt: now, expiresAt: new Date(now.getTime() + COMMAND_TTL_MS) }).where(eq(mt5Commands.id, current.id));
          await tx.insert(mt5CommandEvents).values(eventRow(current, "delivered"));
        }
        return current;
      });
      if (!command) return res.status(204).end();
      res.set("Cache-Control", "no-store").json({
        commandId: command.id,
        action: command.action,
        expiresAt: command.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("[MT5] Command poll failed", error instanceof Error ? error.message : "unknown error");
      safeError(res, 500, "Command queue unavailable");
    }
  });

  app.post("/api/mt5/commands/:commandId/ack", async (req, res) => {
    try {
      const account = await authenticateEa(req);
      if (!account) return safeError(res, 401, "Invalid EA token");
      if (!/^[a-f0-9]{32}$/i.test(req.params.commandId)) return safeError(res, 400, "Invalid command ID");
      const parsed = ackSchema.safeParse(req.body);
      if (!parsed.success) return safeError(res, 400, "Invalid acknowledgement");
      const db = await getDb();
      if (!db) return safeError(res, 503, "Database unavailable");
      const outcome = await db.transaction(async tx => {
        const rows = await tx.select().from(mt5Commands).where(and(
          eq(mt5Commands.id, req.params.commandId),
          eq(mt5Commands.accountId, account.id),
        )).limit(1).for("update");
        const command = rows[0];
        if (!command) return { kind: "missing" as const };
        if (command.status === "succeeded" || command.status === "failed" || command.status === "expired") {
          return { kind: "done" as const, status: command.status };
        }
        const now = new Date();
        if (command.status !== "accepted" && command.expiresAt <= now) {
          const message = "EA acknowledgement arrived after expiry";
          await tx.update(mt5Commands).set({ status: "expired", completedAt: now, resultMessage: message }).where(eq(mt5Commands.id, command.id));
          await tx.insert(mt5CommandEvents).values(eventRow(command, "expired", message));
          return { kind: "expired" as const };
        }
        if (command.status === parsed.data.status) return { kind: "done" as const, status: command.status };
        const acceptedTransition = parsed.data.status === "accepted" && ["queued", "delivered"].includes(command.status);
        const finalTransition = ["succeeded", "failed"].includes(parsed.data.status) && ["delivered", "accepted"].includes(command.status);
        if (!acceptedTransition && !finalTransition) return { kind: "conflict" as const };
        const terminal = parsed.data.status === "succeeded" || parsed.data.status === "failed";
        await tx.update(mt5Commands).set({
          status: parsed.data.status,
          resultMessage: parsed.data.message ?? null,
          ...(terminal ? { completedAt: now } : {}),
        }).where(eq(mt5Commands.id, command.id));
        await tx.insert(mt5CommandEvents).values(eventRow(command, parsed.data.status, parsed.data.message));
        return { kind: "done" as const, status: parsed.data.status };
      });
      if (outcome.kind === "missing") return safeError(res, 404, "Command not found");
      if (outcome.kind === "expired") return safeError(res, 410, "Command expired");
      if (outcome.kind === "conflict") return safeError(res, 409, "Invalid command status transition");
      res.status(200).json({ ok: true, status: outcome.status });
    } catch (error) {
      console.error("[MT5] Acknowledgement failed", error instanceof Error ? error.message : "unknown error");
      safeError(res, 500, "Acknowledgement could not be stored");
    }
  });
}

export async function listAccountsForOwner(ownerOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const accounts = await db.select({
    id: mt5Accounts.id,
    label: mt5Accounts.label,
    mt5Login: mt5Accounts.mt5Login,
    serverName: mt5Accounts.serverName,
    currency: mt5Accounts.currency,
    telemetryReceived: mt5Accounts.telemetryReceived,
    balance: mt5Accounts.balance,
    equity: mt5Accounts.equity,
    maxDdBuyPct: mt5Accounts.maxDdBuyPct,
    maxDdSellPct: mt5Accounts.maxDdSellPct,
    running: mt5Accounts.running,
    eaMode: mt5Accounts.eaMode,
    latencyMs: mt5Accounts.latencyMs,
    lastSeenAt: mt5Accounts.lastSeenAt,
    tokenHint: mt5Accounts.tokenHint,
    createdAt: mt5Accounts.createdAt,
  }).from(mt5Accounts).where(eq(mt5Accounts.ownerOpenId, ownerOpenId)).orderBy(asc(mt5Accounts.createdAt));
  if (accounts.length === 0) return [];

  const commandBuckets = await Promise.all(accounts.map(account => db.select().from(mt5Commands)
    .where(eq(mt5Commands.accountId, account.id)).orderBy(desc(mt5Commands.createdAt)).limit(8)));
  const commands = commandBuckets.flat();
  const eventBuckets = await Promise.all(accounts.map(account => db.select().from(mt5CommandEvents)
    .where(eq(mt5CommandEvents.accountId, account.id)).orderBy(desc(mt5CommandEvents.createdAt)).limit(40)));
  const events = eventBuckets.flat();
  const now = new Date();

  return accounts.map(account => {
    const lastSeenAgeMs = account.lastSeenAt ? Math.max(0, now.getTime() - account.lastSeenAt.getTime()) : null;
    return {
      ...account,
      connectionStatus: lastSeenAgeMs !== null && lastSeenAgeMs <= ONLINE_WINDOW_MS ? "online" as const : "offline" as const,
      lastSeenAgeMs,
      commands: commands.filter(command => command.accountId === account.id).slice(0, 8).map(command => ({
        ...command,
        status: ["queued", "delivered"].includes(command.status) && command.expiresAt <= now ? "expired" as const : command.status,
        events: events.filter(event => event.commandId === command.id).reverse().map(event => ({ status: event.status, message: event.message, createdAt: event.createdAt })),
      })),
    };
  });
}

export async function createAccountForOwner(ownerOpenId: string, input: {
  label: string;
  mt5Login?: string;
  serverName?: string;
  currency?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rawToken = randomBytes(32).toString("base64url");
  const id = randomUUID().replaceAll("-", "").toLowerCase();
  const tokenHint = rawToken.slice(-8);
  await db.insert(mt5Accounts).values({
    id,
    ownerOpenId,
    label: input.label,
    mt5Login: input.mt5Login || null,
    serverName: input.serverName || null,
    currency: (input.currency || "USD").toUpperCase(),
    tokenHash: hashToken(rawToken),
    tokenHint,
  });
  return { id, label: input.label, token: rawToken, tokenHint };
}

export async function queueCommandForOwner(ownerOpenId: string, accountId: string, action: CommandAction) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const accountRows = await tx.select().from(mt5Accounts).where(and(
      eq(mt5Accounts.id, accountId),
      eq(mt5Accounts.ownerOpenId, ownerOpenId),
    )).limit(1).for("update");
    const account = accountRows[0];
    if (!account) throw new Error("ACCOUNT_NOT_FOUND");
    if (!account.lastSeenAt || Date.now() - account.lastSeenAt.getTime() > ONLINE_WINDOW_MS) throw new Error("ACCOUNT_OFFLINE");
    const now = new Date();
    const id = randomUUID().replaceAll("-", "").toLowerCase();
    const expiresAt = new Date(now.getTime() + COMMAND_TTL_MS);
    const command = { id, accountId, ownerOpenId };
    await tx.insert(mt5Commands).values({ id, accountId, ownerOpenId, action, status: "queued", createdAt: now, expiresAt });
    await tx.insert(mt5CommandEvents).values(eventRow(command, "queued"));
    return { id, action, status: "queued", createdAt: now, expiresAt };
  });
}
