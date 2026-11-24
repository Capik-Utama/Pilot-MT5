import type { Express, Request, Response } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { getDb, upsertUserProfile } from "./db";
import { getSupabaseAdminClient } from "./_core/supabase";
import { isValidPassword } from "./_core/password";
import { sdk } from "./_core/sdk";
import {
  mt5Accounts,
  mt5Commands,
  mt5CommandEvents,
  pilotUserAccess,
  pilotUserAccountAccess,
  users,
} from "../drizzle/schema";
import {
  autoBalanceRejectionMessage,
  checkMinimumAutoBalance,
  DEFAULT_MINIMUM_AUTO_BALANCE,
  MINIMUM_AUTO_BALANCE,
} from "../shared/mt5-auto-safety";

const ONLINE_WINDOW_MS = 20_000;
const COMMAND_TTL_MS = 45_000;
const SUPPORTED_INTERVAL_MS = new Set([500, 1000, 2000]);
const isSupportedInterval = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  SUPPORTED_INTERVAL_MS.has(value);
const PENDING_STATUSES = ["queued", "delivered", "accepted"] as const;
const actions = new Set([
  "auto",
  "manual",
  "buy",
  "sell",
  "close_buy",
  "close_sell",
  "close_all",
  "reset",
]);
const configKeys = new Set([
  "ModePerdagangan",
  "MataUangTampilan",
  "KursUSD_IDR",
  "MagicBeli",
  "MagicJual",
  "LotAwal",
  "PenggandaLot",
  "LotMaksimal",
  "LangkahLayer",
  "JarakGrid",
  "JarakTrailingPending",
  "JenisBatasRugi",
  "BatasKerugian",
  "JedaSetelahSLMenit",
  "TargetHarian",
  "SetelahTargetTercapai",
  "ModeTrailing",
  "MulaiTrailingPoin",
  "KunciProfitPoin",
  "LangkahTrailingPoin",
  "MinimumAutoBalanceUSD",
]);
const configRanges: Record<string, readonly [number, number]> = {
  ModePerdagangan: [0, 2],
  MataUangTampilan: [0, 2],
  KursUSD_IDR: [0.0001, 1e9],
  MagicBeli: [0, 2147483647],
  MagicJual: [0, 2147483647],
  LotAwal: [0.000001, 1000],
  PenggandaLot: [0.000001, 100],
  LotMaksimal: [0.000001, 1000],
  LangkahLayer: [1, 100000],
  JarakGrid: [0, 1000000],
  JarakTrailingPending: [0, 1000000],
  JenisBatasRugi: [0, 1],
  BatasKerugian: [0, 1e12],
  JedaSetelahSLMenit: [0, 1000000],
  TargetHarian: [0, 1e12],
  SetelahTargetTercapai: [0, 1],
  ModeTrailing: [0, 1],
  MulaiTrailingPoin: [0, 1000000],
  KunciProfitPoin: [0, 1000000],
  LangkahTrailingPoin: [0, 1000000],
  MinimumAutoBalanceUSD: [
    MINIMUM_AUTO_BALANCE.min,
    MINIMUM_AUTO_BALANCE.max,
  ],
};
const integerConfigKeys = new Set([
  "ModePerdagangan",
  "MataUangTampilan",
  "MagicBeli",
  "MagicJual",
  "LangkahLayer",
  "JarakGrid",
  "JarakTrailingPending",
  "JenisBatasRugi",
  "JedaSetelahSLMenit",
  "SetelahTargetTercapai",
  "ModeTrailing",
  "MulaiTrailingPoin",
  "KunciProfitPoin",
  "LangkahTrailingPoin",
]);
type Obj = Record<string, any>;
const normEmail = (s: string) => s.trim().toLowerCase();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const date = (v: unknown): Date | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const validConfig = (v: unknown) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v as Obj).length > 0 &&
  Object.keys(v as Obj).length <= configKeys.size &&
  Object.entries(v as Obj).every(
    ([k, x]) => {
      if (!configKeys.has(k) || typeof x !== "number" || !Number.isFinite(x))
        return false;
      const range = configRanges[k];
      return (
        x >= range[0] &&
        x <= range[1] &&
        (!integerConfigKeys.has(k) || Number.isInteger(x))
      );
    }
  );
const requiredEaConfigKeys = new Set(
  [...configKeys].filter(key => key !== "MinimumAutoBalanceUSD")
);
const validEaConfig = (v: unknown) =>
  validConfig(v) &&
  [...requiredEaConfigKeys].every(key => Object.hasOwn(v as Obj, key));
const minimumAutoBalance = (config: unknown) => {
  const value = (config as Obj | null)?.MinimumAutoBalanceUSD;
  return finite(
    value,
    MINIMUM_AUTO_BALANCE.min,
    MINIMUM_AUTO_BALANCE.max
  )
    ? value
    : DEFAULT_MINIMUM_AUTO_BALANCE;
};
const autoBalanceError = (account: Obj, minimumBalance?: number): string | null => {
  if (!account.telemetryReceived)
    return "AUTO requires balance telemetry before activation.";
  const lastSeen = date(account.lastSeenAt);
  if (!lastSeen || Date.now() - lastSeen.getTime() > ONLINE_WINDOW_MS)
    return "AUTO requires fresh balance telemetry; wait for the next EA update.";
  const threshold = minimumBalance ?? minimumAutoBalance(account.eaConfig);
  const check = checkMinimumAutoBalance(
    account.balance,
    account.currency,
    account.isCentAccount,
    threshold
  );
  return check.allowed
    ? null
    : autoBalanceRejectionMessage(
        check,
        account.balance,
        account.currency,
        account.isCentAccount
      );
};
const body = (req: Request): Obj | null =>
  req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body
    : null;
const json = (res: Response, status: number, value: unknown) =>
  res.status(status).set("Cache-Control", "no-store").json(value);
const fail = (res: Response, status: number, error: string) =>
  json(res, status, { error });
const snake = (s: string) => s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
function accountJson(a: any): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(a)) out[snake(k)] = v;
  return out;
}
function cmdJson(c: any): Obj {
  return {
    id: c.id,
    action: c.action,
    status: c.status,
    result_message: c.resultMessage ?? null,
    created_at: c.createdAt,
    completed_at: c.completedAt ?? null,
    expires_at: c.expiresAt,
  };
}
function validEmail(s: string) {
  return s.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
async function writeEvent(
  db: any,
  c: any,
  status: string,
  message: string | null = null
) {
  await db.insert(mt5CommandEvents).values({
    id: randomUUID(),
    commandId: c.id,
    ownerId: c.ownerId,
    accountId: c.accountId,
    requestedByUserId: c.requestedByUserId ?? null,
    status,
    message,
    createdAt: new Date(),
  });
}
function asId(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v
    )
  );
}

export function registerMt5ApiRoutes(app: Express) {
  app.use("/api/mt5", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.all("/api/mt5/*", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) return fail(res, 503, "Database is unavailable.");
      const path = req.path.replace(/^\/api\/mt5/, "") || "/";
      const isDashboard = path.startsWith("/dashboard/");
      if (
        ["POST", "PATCH", "DELETE"].includes(req.method) &&
        !req.is("application/json")
      )
        return fail(res, 415, "JSON content type required.");
      let user: any = null,
        access: any = null;
      if (isDashboard) {
        try {
          user = await sdk.authenticateRequest(req);
        } catch {
          return fail(res, 401, "Valid Supabase session required.");
        }
        const email =
          typeof user.email === "string" ? normEmail(user.email) : "";
        if (!user.id || !email || !validEmail(email))
          return fail(res, 403, "Verified Supabase account must provide a valid email.");
        if (path === "/dashboard/profile" && req.method === "PATCH") {
          const existingAccess = await db
            .select({ id: pilotUserAccess.id })
            .from(pilotUserAccess)
            .where(eq(pilotUserAccess.userId, user.id))
            .limit(1);
          if (!existingAccess[0])
            return fail(res, 403, "MT5 access has not been provisioned by the owner.");
          await db
            .update(users)
            .set({ email, updatedAt: new Date() })
            .where(eq(users.id, user.id));
          await db
            .update(pilotUserAccess)
            .set({ email })
            .where(eq(pilotUserAccess.userId, user.id));
          return res.json({ ok: true, email });
        }
        const rows = await db
          .select()
          .from(pilotUserAccess)
          .where(
            and(
              eq(pilotUserAccess.userId, user.id),
              eq(pilotUserAccess.email, email)
            )
          )
          .limit(1);
        access = rows[0];
        if (
          !access &&
          normEmail(process.env.PILOT_OWNER_EMAIL || "") === email
        ) {
          const [otherOwner] = await db
            .select({ id: pilotUserAccess.id })
            .from(pilotUserAccess)
            .where(eq(pilotUserAccess.accessRole, "owner"))
            .limit(1);
          if (!otherOwner) {
            await db.insert(pilotUserAccess).values({
              id: randomUUID(),
              ownerId: user.id,
              userId: user.id,
              email,
              accessRole: "owner",
              createdAt: new Date(),
            }).onConflictDoNothing();
            access = (
              await db
                .select()
                .from(pilotUserAccess)
                .where(
                  and(
                    eq(pilotUserAccess.userId, user.id),
                    eq(pilotUserAccess.email, email)
                  )
                )
                .limit(1)
            )[0];
          }
        }
        if (!access)
          return fail(
            res,
            403,
            "MT5 access has not been provisioned by the owner."
          );
      }
      const owner = access?.ownerId;
      const requireOwner = () =>
        access?.accessRole === "owner" && access.ownerId === user.id;
      const ownAccount = async (id: string) =>
        (
          await db
            .select()
            .from(mt5Accounts)
            .where(
              and(eq(mt5Accounts.id, id), eq(mt5Accounts.ownerId, owner))
            )
            .limit(1)
        )[0];

      if (path === "/dashboard/session" && req.method === "GET")
        return json(res, 200, {
          user: {
            email: access.email,
            name: user.name,
            has_password: false,
          },
          role: access.accessRole,
        });
      if (path === "/dashboard/my-password" && req.method === "PATCH")
        return fail(res, 410, "Password management is handled by Supabase Auth.");
      if (path === "/dashboard/logs" && req.method === "GET") {
        const staffAccounts =
          access.accessRole === "staff"
            ? await db
                .select({ accountId: pilotUserAccountAccess.accountId })
                .from(pilotUserAccountAccess)
                .where(
                  and(
                    eq(pilotUserAccountAccess.ownerId, owner),
                    eq(pilotUserAccountAccess.userId, user.id)
                  )
                )
                .limit(25)
            : null;
        const visibleAccountIds = staffAccounts?.map(x => x.accountId);
        if (visibleAccountIds && !visibleAccountIds.length)
          return json(res, 200, { logs: [] });
        const logScope = visibleAccountIds
          ? and(
              eq(mt5Commands.ownerId, owner),
              inArray(mt5Commands.accountId, visibleAccountIds)
            )
          : eq(mt5Commands.ownerId, owner);
        const logs = await db
          .select()
          .from(mt5Commands)
          .where(logScope)
          .orderBy(desc(mt5Commands.createdAt))
          .limit(200);
        const accts = await db
          .select({ id: mt5Accounts.id, label: mt5Accounts.label })
          .from(mt5Accounts)
          .where(
            visibleAccountIds
              ? and(
                  eq(mt5Accounts.ownerId, owner),
                  inArray(mt5Accounts.id, visibleAccountIds)
                )
              : eq(mt5Accounts.ownerId, owner)
          )
          .limit(100);
        const users =
          access.accessRole === "owner"
            ? await db
                .select({
                  userId: pilotUserAccess.userId,
                  email: pilotUserAccess.email,
                  accessRole: pilotUserAccess.accessRole,
                })
                .from(pilotUserAccess)
                .where(eq(pilotUserAccess.ownerId, owner))
                .limit(100)
            : [];
        return json(res, 200, {
          logs: logs.map(c => ({
            ...cmdJson(c),
            account_label:
              accts.find(a => a.id === c.accountId)?.label || "EA account",
            actor_name:
              access.accessRole === "owner"
                ? users.find(u => u.userId === c.requestedByUserId)?.email ||
                  "System"
                : "",
            actor_role:
              access.accessRole === "owner"
                ? users.find(u => u.userId === c.requestedByUserId)
                    ?.accessRole || "system"
                : "operator",
          })),
        });
      }
      if (path === "/dashboard/users" && req.method === "GET") {
        if (!requireOwner())
          return fail(res, 403, "Only the owner can manage users.");
        const rows = await db
          .select()
          .from(pilotUserAccess)
          .where(
            and(
              eq(pilotUserAccess.ownerId, user.id),
              inArray(pilotUserAccess.accessRole, ["staff", "read_only"])
            )
          )
          .orderBy(pilotUserAccess.createdAt)
          .limit(100);
        const assigns = await db
          .select()
          .from(pilotUserAccountAccess)
          .where(eq(pilotUserAccountAccess.ownerId, user.id))
          .limit(2500);
        const profiles = rows.length
          ? await db.select().from(users)
              .where(inArray(users.id, rows.map(r => r.userId)))
              .limit(100)
          : [];
        const accts = await db
          .select({ id: mt5Accounts.id, label: mt5Accounts.label })
          .from(mt5Accounts)
          .where(eq(mt5Accounts.ownerId, user.id))
          .limit(25);
        return json(res, 200, {
          users: rows.map(u => {
            const profile = profiles.find(p => p.id === u.userId);
            const ids = assigns
              .filter(x => x.userId === u.userId)
              .map(x => x.accountId);
            return {
              user_id: u.userId,
              email: profile?.email || u.email,
              access_role: u.accessRole,
              created_at: u.createdAt,
              has_password: false,
              account_ids: ids,
              account_labels: ids
                .map(id => accts.find(a => a.id === id)?.label)
                .filter(Boolean),
            };
          }),
        });
      }
      if (path === "/dashboard/users" && req.method === "POST") {
        if (!requireOwner()) return fail(res, 403, "Only the owner can invite users.");
        const input = body(req), email = typeof input?.email === "string" ? normEmail(input.email) : "";
        const role = input?.accessRole;
        const accountIds = input?.accountIds;
        if (!email || !validEmail(email)) return fail(res, 400, "Enter a valid email address.");
        if (role !== "staff" && role !== "read_only") return fail(res, 400, "Invalid access role.");
        if (!Array.isArray(accountIds) || accountIds.length > 25 || accountIds.some(id => !asId(id)) || new Set(accountIds).size !== accountIds.length || (role === "staff" && accountIds.length < 1) || (role === "read_only" && accountIds.length))
          return fail(res, 400, "Invalid account assignments.");
        const validAccounts = accountIds.length ? await db.select({ id: mt5Accounts.id }).from(mt5Accounts).where(and(eq(mt5Accounts.ownerId, user.id), inArray(mt5Accounts.id, accountIds))).limit(25) : [];
        if (validAccounts.length !== accountIds.length) return fail(res, 400, "One or more assigned accounts are invalid.");
        const admin = getSupabaseAdminClient();
        let createdUserId: string | null = null;
        try {
          const created = await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo: process.env.FRONTEND_URL,
          });
          if (created.error || !created.data.user) return fail(res, 409, "Unable to send invitation; check whether the email is already registered and Auth email delivery is configured.");
          createdUserId = created.data.user.id;
          await upsertUserProfile({ id: createdUserId, email, name: null });
          await db.transaction(async (tx: any) => {
            await tx.insert(pilotUserAccess).values({ id: randomUUID(), ownerId: user.id, userId: createdUserId, email, accessRole: role, createdAt: new Date() });
            if (accountIds.length) await tx.insert(pilotUserAccountAccess).values(accountIds.map((accountId: string) => ({ id: randomUUID(), ownerId: user.id, userId: createdUserId, accountId, createdAt: new Date() })));
          });
          return json(res, 201, { ok: true, email, access_role: role });
        } catch {
          if (createdUserId) { try { await admin.auth.admin.deleteUser(createdUserId); } catch { /* avoid exposing admin errors */ } }
          return fail(res, 409, "Unable to grant access; verify the user and account details.");
        }
      }
      const passwordMatch = path.match(/^\/dashboard\/users\/([^/]+)\/password$/);
      if (passwordMatch && req.method === "PATCH") {
        if (!requireOwner()) return fail(res, 403, "Only the owner can manage users.");
        const email = normEmail(decodeURIComponent(passwordMatch[1]));
        const target = (await db.select().from(pilotUserAccess).where(and(eq(pilotUserAccess.ownerId, user.id), eq(pilotUserAccess.email, email), inArray(pilotUserAccess.accessRole, ["staff", "read_only"]))).limit(1))[0];
        if (!target) return fail(res, 404, "User not found.");
        const password = body(req)?.password;
        try { const result = await getSupabaseAdminClient().auth.admin.updateUserById(target.userId, { password }); if (result.error) throw result.error; return json(res, 200, { ok: true }); }
        catch { return fail(res, 400, "Unable to update password."); }
      }
      const userMatch = path.match(/^\/dashboard\/users\/([^/]+)$/);
      if (userMatch && req.method === "PATCH") {
        if (!requireOwner()) return fail(res, 403, "Only the owner can manage users.");
        const email = normEmail(decodeURIComponent(userMatch[1]));
        const target = (await db.select().from(pilotUserAccess).where(and(eq(pilotUserAccess.ownerId, user.id), eq(pilotUserAccess.email, email), inArray(pilotUserAccess.accessRole, ["staff", "read_only"]))).limit(1))[0];
        if (!target) return fail(res, 404, "User not found.");
        const input = body(req), role = input?.accessRole, accountIds = input?.accountIds;
        if (role !== "staff" && role !== "read_only") return fail(res, 400, "Invalid access role.");
        if (!Array.isArray(accountIds) || accountIds.length > 25 || accountIds.some((id: unknown) => !asId(id)) || new Set(accountIds).size !== accountIds.length || (role === "staff" && accountIds.length < 1) || (role === "read_only" && accountIds.length)) return fail(res, 400, "Invalid account assignments.");
        const validAccounts = accountIds.length ? await db.select({ id: mt5Accounts.id }).from(mt5Accounts).where(and(eq(mt5Accounts.ownerId, user.id), inArray(mt5Accounts.id, accountIds))).limit(25) : [];
        if (validAccounts.length !== accountIds.length) return fail(res, 400, "One or more assigned accounts are invalid.");
        try { await db.transaction(async (tx: any) => {
          await tx.update(pilotUserAccess).set({ accessRole: role }).where(and(eq(pilotUserAccess.id, target.id), eq(pilotUserAccess.ownerId, user.id), eq(pilotUserAccess.userId, target.userId)));
          await tx.delete(pilotUserAccountAccess).where(and(eq(pilotUserAccountAccess.ownerId, user.id), eq(pilotUserAccountAccess.userId, target.userId)));
          if (accountIds.length) await tx.insert(pilotUserAccountAccess).values(accountIds.map((accountId: string) => ({ id: randomUUID(), ownerId: user.id, userId: target.userId, accountId, createdAt: new Date() })));
        }); return json(res, 200, { ok: true }); } catch { return fail(res, 409, "Unable to update user access."); }
      }
      if (userMatch && req.method === "DELETE") {
        if (!requireOwner()) return fail(res, 403, "Only the owner can manage users.");
        const email = normEmail(decodeURIComponent(userMatch[1]));
        const target = (await db.select().from(pilotUserAccess).where(and(eq(pilotUserAccess.ownerId, user.id), eq(pilotUserAccess.email, email), inArray(pilotUserAccess.accessRole, ["staff", "read_only"]))).limit(1))[0];
        if (!target) return fail(res, 404, "User not found.");
        try {
          await db.transaction(async (tx: any) => {
            await tx.delete(pilotUserAccountAccess).where(and(eq(pilotUserAccountAccess.ownerId, user.id), eq(pilotUserAccountAccess.userId, target.userId)));
            await tx.delete(pilotUserAccess).where(and(eq(pilotUserAccess.ownerId, user.id), eq(pilotUserAccess.userId, target.userId)));
          });
          const removed = await getSupabaseAdminClient().auth.admin.deleteUser(target.userId);
          if (removed.error) return fail(res, 409, "Unable to revoke user access.");
          return json(res, 200, { ok: true });
        } catch { return fail(res, 409, "Unable to revoke user access."); }
      }
      if (path === "/dashboard/metrics" && req.method === "GET") {
        let allowed: string[] | null = null;
        if (access.accessRole === "staff") {
          const assignments = await db
            .select({ accountId: pilotUserAccountAccess.accountId })
            .from(pilotUserAccountAccess)
            .where(
              and(
                eq(pilotUserAccountAccess.ownerId, owner),
                eq(pilotUserAccountAccess.userId, user.id)
              )
            )
            .limit(25);
          allowed = assignments.map(item => item.accountId);
          if (!allowed.length) return json(res, 200, { metrics: [] });
        }
        const metricScope = allowed
          ? and(
              eq(mt5Accounts.ownerId, owner),
              inArray(mt5Accounts.id, allowed)
            )
          : eq(mt5Accounts.ownerId, owner);
        const metrics = await db
          .select({
            id: mt5Accounts.id,
            runningFloat: mt5Accounts.runningFloat,
            profit: mt5Accounts.profit,
            telemetryReceived: mt5Accounts.telemetryReceived,
          })
          .from(mt5Accounts)
          .where(metricScope)
          .orderBy(mt5Accounts.createdAt)
          .limit(25);
        return json(res, 200, {
          metrics: metrics.map(metric => ({
            id: metric.id,
            running_float: metric.runningFloat,
            profit: metric.profit,
            telemetry_received: metric.telemetryReceived,
          })),
        });
      }
      if (path === "/dashboard/accounts" && req.method === "GET") {
        let allowed: string[] | null = null;
        if (access.accessRole === "staff") {
          const a = await db
            .select()
            .from(pilotUserAccountAccess)
            .where(
              and(
                eq(pilotUserAccountAccess.ownerId, owner),
                eq(pilotUserAccountAccess.userId, user.id)
              )
            )
            .limit(25);
          allowed = a.map(x => x.accountId);
          if (!allowed.length) return json(res, 200, { accounts: [] });
        }
        const accountFilter = allowed
          ? and(
              eq(mt5Accounts.ownerId, owner),
              inArray(mt5Accounts.id, allowed)
            )
          : eq(mt5Accounts.ownerId, owner);
        const accountFields = {
          id: mt5Accounts.id,
          label: mt5Accounts.label,
          brokerAccountName: mt5Accounts.brokerAccountName,
          mt5Login: mt5Accounts.mt5Login,
          serverName: mt5Accounts.serverName,
          currency: mt5Accounts.currency,
          tokenHint: mt5Accounts.tokenHint,
          isCentAccount: mt5Accounts.isCentAccount,
          displayCurrency: mt5Accounts.displayCurrency,
          displayRate: mt5Accounts.displayRate,
          telemetryReceived: mt5Accounts.telemetryReceived,
          balance: mt5Accounts.balance,
          equity: mt5Accounts.equity,
          maxDdBuy: mt5Accounts.maxDdBuy,
          maxDdSell: mt5Accounts.maxDdSell,
          eaPanel: mt5Accounts.eaPanel,
          minimumBalanceSet: mt5Accounts.minimumBalanceSet,
          basketSlSet: mt5Accounts.basketSlSet,
          basketSlType: mt5Accounts.basketSlType,
          basketTpSet: mt5Accounts.basketTpSet,
          dailyTargetSet: mt5Accounts.dailyTargetSet,
          maxFloatBuy: mt5Accounts.maxFloatBuy,
          maxFloatSell: mt5Accounts.maxFloatSell,
          runningFloat: mt5Accounts.runningFloat,
          openPositions: mt5Accounts.openPositions,
          pendingOrders: mt5Accounts.pendingOrders,
          eaStatus: mt5Accounts.eaStatus,
          running: mt5Accounts.running,
          eaMode: mt5Accounts.eaMode,
          profit: mt5Accounts.profit,
          floatingProfit: mt5Accounts.floatingProfit,
          latencyMs: mt5Accounts.latencyMs,
          lastSeenAt: mt5Accounts.lastSeenAt,
          telemetryIntervalMs: mt5Accounts.telemetryIntervalMs,
          pollIntervalMs: mt5Accounts.pollIntervalMs,
        };
        const accounts =
          access.accessRole === "owner"
            ? await db
                .select({ ...accountFields, eaConfig: mt5Accounts.eaConfig })
                .from(mt5Accounts)
                .where(accountFilter)
                .orderBy(mt5Accounts.createdAt)
                .limit(25)
            : await db
                .select(accountFields)
                .from(mt5Accounts)
                .where(accountFilter)
                .orderBy(mt5Accounts.createdAt)
                .limit(25);
        const cmds = accounts.length
          ? await db
              .select()
              .from(mt5Commands)
              .where(
                and(
                  eq(mt5Commands.ownerId, owner),
                  inArray(
                    mt5Commands.accountId,
                    accounts.map(a => a.id)
                  )
                )
              )
              .orderBy(desc(mt5Commands.createdAt))
              .limit(50)
          : [];
        const now = Date.now();
        return json(res, 200, {
          accounts: accounts.map(a => ({
            ...accountJson(a),
            connection_status:
              a.lastSeenAt &&
              now - (date(a.lastSeenAt)?.getTime() || 0) <= ONLINE_WINDOW_MS
                ? "online"
                : "offline",
            commands: cmds
              .filter(c => c.accountId === a.id)
              .slice(0, 5)
              .map(c => ({
                ...cmdJson(c),
                status:
                  c.status === "delivered" &&
                  (date(c.expiresAt)?.getTime() || 0) <= now
                    ? "expired"
                    : c.status,
              })),
          })),
        });
      }
      if (path === "/dashboard/accounts" && req.method === "POST") {
        if (!requireOwner())
          return fail(res, 403, "Only the owner can create accounts.");
        const label =
          typeof body(req)?.label === "string" ? body(req)!.label.trim() : "";
        if (!label || label.length > 80)
          return fail(res, 400, "Label must be 1–80 characters.");
        const count = await db
          .select({ n: sql<number>`count(*)` })
          .from(mt5Accounts)
          .where(eq(mt5Accounts.ownerId, user.id));
        if (Number(count[0]?.n || 0) >= 10)
          return fail(res, 429, "Maximum 10 accounts reached.");
        const token = randomBytes(32).toString("base64url"),
          now = new Date(),
          id = randomUUID();
        const row = {
          id,
          ownerId: user.id,
          label,
          tokenHash: hash(token),
          tokenHint: token.slice(-8),
          eaMode: "manual" as const,
          running: false,
          intervalsConfigured: false,
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(mt5Accounts).values(row);
        return json(res, 201, {
          account: { id, label, token_hint: row.tokenHint, created_at: now },
          token,
        });
      }
      const polling = path.match(/^\/dashboard\/accounts\/([^/]+)\/polling$/),
        config = path.match(/^\/dashboard\/accounts\/([^/]+)\/config$/),
        cmdsPath = path.match(/^\/dashboard\/accounts\/([^/]+)\/commands$/),
        acctMatch = path.match(/^\/dashboard\/accounts\/([^/]+)$/);
      if (
        (polling || config || cmdsPath || acctMatch) &&
        !asId((polling || config || cmdsPath || acctMatch)![1])
      )
        return fail(res, 400, "Invalid account id.");
      if (acctMatch && req.method === "PATCH") {
        if (!requireOwner())
          return fail(res, 403, "Only the owner can rename accounts.");
        const label =
          typeof body(req)?.label === "string" ? body(req)!.label.trim() : "";
        if (!label || label.length > 80)
          return fail(res, 400, "Label must be 1–80 characters.");
        const a = await ownAccount(acctMatch[1]);
        if (!a) return fail(res, 404, "Account not found.");
        await db
          .update(mt5Accounts)
          .set({ label, updatedAt: new Date() })
          .where(eq(mt5Accounts.id, a.id));
        return json(res, 200, { account: { id: a.id, label } });
      }
      if (acctMatch && req.method === "DELETE") {
        if (!requireOwner())
          return fail(res, 403, "Only the owner can remove accounts.");
        if (body(req)?.confirm !== "HAPUS")
          return fail(res, 400, 'Kirim confirm: "HAPUS" untuk menghapus akun.');
        const a = await ownAccount(acctMatch[1]);
        if (!a) return fail(res, 404, "Account not found.");
        await db.transaction(async (tx: any) => {
          await tx
            .delete(mt5CommandEvents)
            .where(eq(mt5CommandEvents.accountId, a.id));
          await tx.delete(mt5Commands).where(eq(mt5Commands.accountId, a.id));
          await tx
            .delete(pilotUserAccountAccess)
            .where(eq(pilotUserAccountAccess.accountId, a.id));
          await tx.delete(mt5Accounts).where(eq(mt5Accounts.id, a.id));
        });
        return json(res, 200, { ok: true, label: a.label });
      }
      if (polling && req.method === "PATCH") {
        if (!requireOwner())
          return fail(res, 403, "Only the owner can change polling.");
        const values = body(req);
        const pollIntervalMs = values?.pollIntervalMs ?? values?.intervalMs;
        const telemetryIntervalMs = values?.telemetryIntervalMs;
        if (
          !isSupportedInterval(pollIntervalMs) ||
          (telemetryIntervalMs !== undefined &&
            !isSupportedInterval(telemetryIntervalMs))
        )
          return fail(
            res,
            400,
            "Telemetry and polling intervals must be 500, 1000, or 2000 ms."
          );
        const a = await ownAccount(polling[1]);
        if (!a) return fail(res, 404, "Account not found.");
        const update: Record<string, unknown> = {
          pollIntervalMs,
          intervalsConfigured: true,
          updatedAt: new Date(),
        };
        if (telemetryIntervalMs !== undefined)
          update.telemetryIntervalMs = telemetryIntervalMs;
        await db
          .update(mt5Accounts)
          .set(update)
          .where(eq(mt5Accounts.id, a.id));
        return json(res, 200, {
          telemetryIntervalMs:
            telemetryIntervalMs ?? a.telemetryIntervalMs ?? 500,
          pollIntervalMs,
        });
      }
      if (config && req.method === "POST") {
        if (!requireOwner())
          return fail(res, 403, "Only the owner can configure accounts.");
        const cfg = body(req)?.config;
        if (!validConfig(cfg))
          return fail(res, 400, "Invalid EA configuration.");
        const a = await ownAccount(config[1]);
        if (!a) return fail(res, 404, "Account not found.");
        if (
          !a.lastSeenAt ||
          Date.now() - (date(a.lastSeenAt)?.getTime() || 0) > ONLINE_WINDOW_MS
        )
          return fail(res, 409, "EA offline or heartbeat expired.");
        const restoreAuto =
          a.eaMode === "auto" &&
          autoBalanceError(a, minimumAutoBalance(cfg)) === null;
        const created = await db
          .transaction(async (tx: any) => {
            const locked = await tx
              .select({ id: mt5Accounts.id })
              .from(mt5Accounts)
              .where(eq(mt5Accounts.id, a.id))
              .for("update")
              .limit(1);
            if (!locked.length) throw new Error("ACCOUNT_NOT_FOUND");
            const pending = await tx
              .select({ id: mt5Commands.id })
              .from(mt5Commands)
              .where(
                and(
                  eq(mt5Commands.accountId, a.id),
                  inArray(mt5Commands.status, PENDING_STATUSES),
                  gt(mt5Commands.expiresAt, new Date())
                )
              )
              .limit(1);
            if (pending.length) throw new Error("PENDING");
            const now = new Date(),
              command = {
                id: randomUUID(),
                ownerId: owner,
                accountId: a.id,
                requestedByUserId: user.id,
                action: "config",
                payload: cfg,
                status: "queued",
                createdAt: now,
                expiresAt: new Date(Date.now() + COMMAND_TTL_MS),
              };
            await tx.insert(mt5Commands).values(command);
            await tx
              .update(mt5Accounts)
              .set({ eaConfig: cfg, updatedAt: now })
              .where(eq(mt5Accounts.id, a.id));
            await writeEvent(tx, command, "queued");
            let restore = null;
            if (a.eaMode === "auto") {
              if (restoreAuto) {
                restore = {
                  id: randomUUID(),
                  ownerId: owner,
                  accountId: a.id,
                  requestedByUserId: user.id,
                  action: "auto",
                  status: "queued",
                  createdAt: now,
                  expiresAt: new Date(Date.now() + COMMAND_TTL_MS),
                };
                await tx.insert(mt5Commands).values(restore);
                await writeEvent(tx, restore, "queued");
              } else {
                await tx
                  .update(mt5Accounts)
                  .set({ eaMode: "manual", running: false, updatedAt: now })
                  .where(eq(mt5Accounts.id, a.id));
              }
            }
            return { command, restoreModeCommand: restore };
          })
          .catch(e => {
            if (e.message === "PENDING") return null;
            throw e;
          });
        if (!created) return fail(res, 409, "A command is already pending.");
        return json(res, 201, created);
      }
      if (cmdsPath && req.method === "POST") {
        if (!["owner", "staff"].includes(access.accessRole))
          return fail(res, 403, "Role cannot send commands.");
        const action = body(req)?.action;
        if (typeof action !== "string" || !actions.has(action))
          return fail(res, 400, "Unknown command action.");
        const a = await ownAccount(cmdsPath[1]);
        if (!a) return fail(res, 404, "Account not found.");
        if (access.accessRole === "staff") {
          const ok = await db
            .select({ id: pilotUserAccountAccess.id })
            .from(pilotUserAccountAccess)
            .where(
              and(
                eq(pilotUserAccountAccess.ownerId, owner),
                eq(pilotUserAccountAccess.userId, user.id),
                eq(pilotUserAccountAccess.accountId, a.id)
              )
            )
            .limit(1);
          if (!ok.length)
            return fail(res, 403, "Staff is not assigned to this account.");
        }
        if (
          !a.lastSeenAt ||
          Date.now() - (date(a.lastSeenAt)?.getTime() || 0) > ONLINE_WINDOW_MS
        )
          return fail(res, 409, "EA offline or heartbeat expired.");
        if (action === "auto") {
          const balanceError = autoBalanceError(a);
          if (balanceError) return fail(res, 409, balanceError);
        }
        const c = {
          id: randomUUID(),
          ownerId: owner,
          accountId: a.id,
          requestedByUserId: user.id,
          action,
          status: "queued",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + COMMAND_TTL_MS),
        };
        await db.transaction(async (tx: any) => {
          const locked = await tx
            .select({ id: mt5Accounts.id })
            .from(mt5Accounts)
            .where(eq(mt5Accounts.id, a.id))
            .for("update")
            .limit(1);
          if (!locked.length) throw new Error("ACCOUNT_NOT_FOUND");
          const pending = await tx
            .select({ id: mt5Commands.id })
            .from(mt5Commands)
            .where(
              and(
                eq(mt5Commands.accountId, a.id),
                inArray(mt5Commands.status, PENDING_STATUSES),
                gt(mt5Commands.expiresAt, new Date())
              )
            )
            .limit(1);
          if (pending.length) throw new Error("PENDING");
          await tx.insert(mt5Commands).values(c);
          await writeEvent(tx, c, "queued");
        });
        return json(res, 201, { command: cmdJson(c) });
      }
      if (isDashboard) return fail(res, 404, "Dashboard route not found.");

      const auth = (req.headers.authorization || "").startsWith("Bearer ")
        ? (req.headers.authorization || "").slice(7).trim()
        : "";
      if (auth.length < 40 || auth.length > 128)
        return fail(res, 401, "Invalid EA token.");
      const acct = (
        await db
          .select()
          .from(mt5Accounts)
          .where(eq(mt5Accounts.tokenHash, hash(auth)))
          .limit(1)
      )[0];
      if (!acct) return fail(res, 401, "Invalid EA token.");
      if (path === "/telemetry" && req.method === "POST") {
        const b = body(req);
        const nums = [
          "balance",
          "equity",
          "maxDdBuy",
          "maxDdSell",
          "profit",
          "floatingProfit",
          "basketSlSet",
          "dailyTargetSet",
          "maxFloatBuy",
          "maxFloatSell",
          "runningFloat",
        ];
        if (
          !b ||
          nums.some(k => !finite(b[k], -1e12, 1e15)) ||
          (b.eaConfig !== undefined && !validEaConfig(b.eaConfig)) ||
          (b.openPositions !== undefined &&
            (!Number.isInteger(b.openPositions) ||
              b.openPositions < 0 ||
              b.openPositions > 1e6)) ||
          (b.pendingOrders !== undefined &&
            (!Number.isInteger(b.pendingOrders) ||
              b.pendingOrders < 0 ||
              b.pendingOrders > 1e6)) ||
          (b.minimumBalanceSet !== undefined &&
            !finite(b.minimumBalanceSet, 0, 1e15)) ||
          (b.basketTpSet !== undefined &&
            !finite(b.basketTpSet, -1e12, 1e15)) ||
          (b.eaPanel !== undefined &&
            (typeof b.eaPanel !== "string" || b.eaPanel.length > 32)) ||
          (b.eaStatus !== undefined &&
            (typeof b.eaStatus !== "string" || b.eaStatus.length > 80)) ||
          !["money", "percent"].includes(b.basketSlType) ||
          typeof b.running !== "boolean" ||
          typeof b.isCentAccount !== "boolean" ||
          !["USD", "CENT", "IDR"].includes(b.displayCurrency) ||
          !finite(b.displayRate, 0.0001, 1e9) ||
          !["auto", "manual"].includes(b.eaMode) ||
          typeof b.currency !== "string" ||
          !/^[A-Z]{3,8}$/.test(b.currency) ||
          typeof b.accountName !== "string" ||
          b.accountName.length > 120 ||
          (b.login !== undefined &&
            (!Number.isSafeInteger(b.login) || b.login < 0)) ||
          (b.serverName !== undefined &&
            (typeof b.serverName !== "string" || b.serverName.length > 120)) ||
          (b.latencyMs !== undefined && !finite(b.latencyMs, 0, 60000))
        )
          return fail(res, 400, "Invalid telemetry payload.");
        let telemetryMode: "auto" | "manual" = "manual";
        let telemetryAutoError: string | null = null;
        await db.transaction(async (tx: any) => {
          const lockedAccounts = await tx
            .select()
            .from(mt5Accounts)
            .where(eq(mt5Accounts.id, acct.id))
            .for("update")
            .limit(1);
          const currentAccount = lockedAccounts[0] ?? acct;
          let sync = false;
          if (b.eaConfig !== undefined) {
            const pending = await tx
              .select()
              .from(mt5Commands)
              .where(
                and(
                  eq(mt5Commands.accountId, acct.id),
                  eq(mt5Commands.action, "config"),
                  inArray(mt5Commands.status, [
                    "queued",
                    "delivered",
                    "accepted",
                  ])
                )
              )
              .limit(1);
            const c = pending[0];
            if (!c) sync = true;
            else if (
              ["delivered", "accepted"].includes(c.status) &&
              JSON.stringify(c.payload, Object.keys(c.payload || {}).sort()) ===
                JSON.stringify(b.eaConfig, Object.keys(b.eaConfig).sort())
            ) {
              const now = new Date(),
                msg = "Configuration verified by EA telemetry.";
              await tx
                .update(mt5Commands)
                .set({
                  status: "succeeded",
                  completedAt: now,
                  resultMessage: msg,
                })
                .where(eq(mt5Commands.id, c.id));
              await writeEvent(tx, c, "succeeded", msg);
              sync = true;
            }
          }
          const effectiveConfig =
            sync && b.eaConfig !== undefined
              ? {
                  ...(currentAccount.eaConfig ?? {}),
                  ...b.eaConfig,
                  MinimumAutoBalanceUSD:
                    b.eaConfig.MinimumAutoBalanceUSD ??
                    currentAccount.eaConfig?.MinimumAutoBalanceUSD ??
                    DEFAULT_MINIMUM_AUTO_BALANCE,
                }
              : currentAccount.eaConfig;
          const effectiveMinimumBalance = minimumAutoBalance(effectiveConfig);
          const balanceCheck = checkMinimumAutoBalance(
            b.balance,
            b.currency,
            b.isCentAccount,
            effectiveMinimumBalance
          );
          telemetryMode =
            b.eaMode === "auto" && balanceCheck.allowed ? "auto" : "manual";
          if (b.eaMode === "auto" && telemetryMode === "manual")
            telemetryAutoError = autoBalanceRejectionMessage(
              balanceCheck,
              b.balance,
              b.currency,
              b.isCentAccount
            );
          const update: any = {
            brokerAccountName: b.accountName,
            mt5Login: b.login ?? null,
            serverName: b.serverName ?? null,
            isCentAccount: b.isCentAccount,
            displayCurrency: b.displayCurrency,
            displayRate: b.displayRate,
            telemetryReceived: true,
            balance: b.balance,
            equity: b.equity,
            maxDdBuy: b.maxDdBuy,
            maxDdSell: b.maxDdSell,
            eaPanel: b.eaPanel ?? currentAccount.eaPanel ?? "grid-by-capik",
            minimumBalanceSet:
              b.minimumBalanceSet ?? currentAccount.minimumBalanceSet ?? 0,
            basketSlSet: b.basketSlSet,
            basketSlType: b.basketSlType,
            basketTpSet: b.basketTpSet ?? currentAccount.basketTpSet ?? 0,
            dailyTargetSet: b.dailyTargetSet,
            maxFloatBuy: b.maxFloatBuy,
            maxFloatSell: b.maxFloatSell,
            runningFloat: b.runningFloat,
            openPositions: b.openPositions ?? 0,
            pendingOrders: b.pendingOrders ?? currentAccount.pendingOrders ?? 0,
            eaStatus: telemetryAutoError
              ? "AUTO BLOCKED"
              : b.eaStatus ?? (b.running ? "ACTIVE" : "MANUAL"),
            running: telemetryAutoError ? false : b.running,
            eaMode: telemetryMode,
            profit: b.profit,
            floatingProfit: b.floatingProfit,
            currency: b.currency,
            latencyMs: b.latencyMs ?? null,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          };
          if (sync && b.eaConfig !== undefined)
            update.eaConfig = {
              ...b.eaConfig,
              MinimumAutoBalanceUSD:
                b.eaConfig.MinimumAutoBalanceUSD ??
                currentAccount.eaConfig?.MinimumAutoBalanceUSD ??
                DEFAULT_MINIMUM_AUTO_BALANCE,
            };
          await tx
            .update(mt5Accounts)
            .set(update)
            .where(eq(mt5Accounts.id, acct.id));
        });
        return json(res, 200, {
          ok: true,
          serverTime: new Date(),
          eaMode: telemetryMode,
          autoBlocked: telemetryAutoError !== null,
          ...(telemetryAutoError ? { error: telemetryAutoError } : {}),
        });
      }
      if (
        path === "/commands/next" &&
        ["GET", "POST"].includes(req.method)
      ) {
        let telemetryIntervalMs = acct.telemetryIntervalMs ?? 500;
        let pollIntervalMs = acct.pollIntervalMs ?? 1000;
        if (req.method === "POST") {
          const timing = body(req);
          const applyInputIntervals = timing?.applyInputIntervals === true;
          if (!acct.intervalsConfigured || applyInputIntervals) {
            const requestedTelemetry =
              timing?.telemetryIntervalMs ?? telemetryIntervalMs;
            const requestedPolling = timing?.pollIntervalMs ?? pollIntervalMs;
            if (
              !isSupportedInterval(requestedTelemetry) ||
              !isSupportedInterval(requestedPolling)
            )
              return fail(
                res,
                400,
                "Telemetry and polling intervals must be 500, 1000, or 2000 ms."
              );
            telemetryIntervalMs = requestedTelemetry;
            pollIntervalMs = requestedPolling;
            await db
              .update(mt5Accounts)
              .set({
                telemetryIntervalMs,
                pollIntervalMs,
                intervalsConfigured: true,
                updatedAt: new Date(),
              })
              .where(eq(mt5Accounts.id, acct.id));
            acct.telemetryIntervalMs = telemetryIntervalMs;
            acct.pollIntervalMs = pollIntervalMs;
            acct.intervalsConfigured = true;
          }
        }
        let balanceError = autoBalanceError(acct);
        if (acct.eaMode === "auto" && balanceError) {
          await db
            .update(mt5Accounts)
            .set({ eaMode: "manual", running: false, updatedAt: new Date() })
            .where(eq(mt5Accounts.id, acct.id));
          acct.eaMode = "manual";
          acct.running = false;
        }
        const now = new Date(),
          list = await db
            .select()
            .from(mt5Commands)
            .where(
              and(
                eq(mt5Commands.accountId, acct.id),
                inArray(mt5Commands.status, ["queued", "delivered"])
              )
            )
            .orderBy(mt5Commands.createdAt)
            .limit(25);
        for (const stale of list.filter(
          x => (date(x.expiresAt)?.getTime() || 0) <= now.getTime()
        )) {
          await db.transaction(async (tx: any) => {
            const current = await tx
              .select()
              .from(mt5Commands)
              .where(
                and(
                  eq(mt5Commands.id, stale.id),
                  inArray(mt5Commands.status, ["queued", "delivered"]),
                  lte(mt5Commands.expiresAt, now)
                )
              )
              .for("update")
              .limit(1);
            if (!current.length) return;
            const msg = "Command expired before acknowledgement.";
            await tx
              .update(mt5Commands)
              .set({ status: "expired", completedAt: now, resultMessage: msg })
              .where(eq(mt5Commands.id, stale.id));
            await writeEvent(tx, current[0], "expired", msg);
          });
        }
        if (balanceError) {
          for (const pendingAuto of list.filter(
            x =>
              x.action === "auto" &&
              ["queued", "delivered"].includes(x.status) &&
              (date(x.expiresAt)?.getTime() || 0) > now.getTime()
          )) {
            await db.transaction(async (tx: any) => {
              const current = await tx
                .select()
                .from(mt5Commands)
                .where(
                  and(
                    eq(mt5Commands.id, pendingAuto.id),
                    inArray(mt5Commands.status, ["queued", "delivered"])
                  )
                )
                .for("update")
                .limit(1);
              if (!current.length) return;
              await tx
                .update(mt5Commands)
                .set({
                  status: "failed",
                  completedAt: now,
                  resultMessage: balanceError,
                })
                .where(eq(mt5Commands.id, pendingAuto.id));
              await writeEvent(tx, current[0], "failed", balanceError);
            });
          }
        }
        const c = list.find(
          x =>
            ["queued", "delivered"].includes(x.status) &&
            (date(x.expiresAt)?.getTime() || 0) > now.getTime() &&
            !(balanceError && x.action === "auto")
        );
        if (!c)
          return json(res, 200, {
            commandId: "",
            action: "",
            payload: null,
            telemetryIntervalMs,
            pollIntervalMs,
            eaMode: acct.eaMode ?? "manual",
          });
        let command: any = c;
        let exp = c.expiresAt;
        if (c.status === "queued") {
          exp = new Date(now.getTime() + COMMAND_TTL_MS);
          const delivered = await db.transaction(async (tx: any) => {
            const current = await tx
              .select()
              .from(mt5Commands)
              .where(eq(mt5Commands.id, c.id))
              .for("update")
              .limit(1);
            if (
              !current.length ||
              current[0].status !== "queued" ||
              (date(current[0].expiresAt)?.getTime() || 0) <= now.getTime()
            )
              return null;
            await tx
              .update(mt5Commands)
              .set({ status: "delivered", deliveredAt: now, expiresAt: exp })
              .where(
                and(eq(mt5Commands.id, c.id), eq(mt5Commands.status, "queued"))
              );
            await writeEvent(tx, current[0], "delivered");
            return { ...current[0], status: "delivered", expiresAt: exp };
          });
          if (!delivered)
            return json(res, 200, {
              commandId: "",
              action: "",
              payload: null,
              telemetryIntervalMs,
              pollIntervalMs,
              eaMode: acct.eaMode ?? "manual",
            });
          command = delivered;
        }
        return json(res, 200, {
          commandId: command.id,
          action: command.action,
          payload: command.payload ?? null,
          expiresAt: exp,
          telemetryIntervalMs,
          pollIntervalMs,
          eaMode: acct.eaMode ?? "manual",
        });
      }
      const ack = path.match(/^\/commands\/([^/]+)\/ack$/);
      if (ack && req.method === "POST") {
        if (!asId(ack[1])) return fail(res, 400, "Invalid command id.");
        const b = body(req),
          status = b?.status,
          message =
            typeof b?.message === "string" ? b.message.slice(0, 500) : null;
        if (!["accepted", "succeeded", "failed"].includes(status))
          return fail(res, 400, "Invalid acknowledgement status.");
        const c = (
          await db
            .select()
            .from(mt5Commands)
            .where(
              and(
                eq(mt5Commands.id, ack[1]),
                eq(mt5Commands.accountId, acct.id)
              )
            )
            .limit(1)
        )[0];
        if (!c) return fail(res, 404, "Command not found.");
        if (["succeeded", "failed", "expired"].includes(c.status))
          return json(res, 200, { ok: true, status: c.status });
        if (
          c.status !== "accepted" &&
          date(c.expiresAt) &&
          date(c.expiresAt)!.getTime() <= Date.now()
        ) {
          const now = new Date(),
            msg = "Late acknowledgement.";
          await db.transaction(async (tx: any) => {
            await tx
              .update(mt5Commands)
              .set({ status: "expired", completedAt: now, resultMessage: msg })
              .where(eq(mt5Commands.id, c.id));
            await writeEvent(tx, c, "expired", msg);
          });
          return fail(res, 410, "Command expired.");
        }
        const allowed =
          status === "accepted"
            ? ["queued", "delivered"].includes(c.status)
            : ["delivered", "accepted"].includes(c.status);
        if (!allowed && status !== c.status)
          return fail(res, 409, "Invalid command status transition.");
        if (c.action === "config" && status === "succeeded")
          return json(res, 200, {
            ok: true,
            status: c.status,
            message: "Waiting for EA telemetry to verify configuration.",
          });
        const now = new Date();
        let finalStatus = status as "accepted" | "succeeded" | "failed";
        let finalMessage = message;
        let mode: "auto" | "manual" | null = null;
        await db.transaction(async (tx: any) => {
          if (c.action === "auto" && finalStatus === "succeeded") {
            const currentAccounts = await tx
              .select()
              .from(mt5Accounts)
              .where(eq(mt5Accounts.id, acct.id))
              .for("update")
              .limit(1);
            const balanceError = currentAccounts.length
              ? autoBalanceError(currentAccounts[0])
              : "Account not found.";
            if (balanceError) {
              finalStatus = "failed";
              finalMessage = balanceError;
            }
          }
          mode =
            c.action === "auto" && finalStatus === "succeeded"
              ? "auto"
              : (c.action === "auto" && finalStatus === "failed") ||
                  (["manual", "close_buy", "close_sell", "close_all"].includes(
                    c.action
                  ) && ["succeeded", "failed"].includes(finalStatus))
                ? "manual"
                : null;
          if (mode)
            await tx
              .update(mt5Accounts)
              .set({ eaMode: mode, updatedAt: now })
              .where(eq(mt5Accounts.id, acct.id));
          await tx
            .update(mt5Commands)
            .set({
              status: finalStatus,
              resultMessage: finalMessage,
              ...(["succeeded", "failed"].includes(finalStatus)
                ? { completedAt: now }
                : {}),
            })
            .where(eq(mt5Commands.id, c.id));
          await writeEvent(tx, c, finalStatus, finalMessage);
        });
        return json(res, 200, {
          ok: true,
          status: finalStatus,
          ...(finalMessage ? { message: finalMessage } : {}),
        });
      }
      return fail(res, 404, "EA route not found.");
    } catch (e) {
      if (e instanceof Error && e.message === "PENDING")
        return fail(res, 409, "A command is already pending.");
      console.error(
        "[mt5-api] request failed",
        e instanceof Error ? e.message : "unknown error"
      );
      return fail(res, 500, "Request could not be processed.");
    }
  });
}
