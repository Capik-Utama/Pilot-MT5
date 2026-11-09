import { createHash, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import PocketBase, { type RecordModel } from "pocketbase";
import { authenticatePilotUser, getPocketBaseAdmin, newPocketBaseClient, type PilotUser } from "./pocketbase";

const ONLINE_WINDOW_MS = 20_000;
const COMMAND_TTL_MS = 45_000;
const activeStatuses = ["queued", "delivered", "accepted"] as const;
const actions = new Set(["auto", "manual", "buy", "sell", "close_buy", "close_sell", "close_all", "reset"]);
const configKeys = new Set([
  "ModePerdagangan", "MataUangTampilan", "KursUSD_IDR", "MagicBeli", "MagicJual", "LotAwal", "PenggandaLot",
  "LotMaksimal", "LangkahLayer", "JarakGrid", "JarakTrailingPending", "JenisBatasRugi", "BatasKerugian",
  "MinimumBalanceAuto", "JedaSetelahSLMenit", "TargetHarian", "SetelahTargetTercapai", "ModeTrailing", "MulaiTrailingPoin",
  "KunciProfitPoin", "LangkahTrailingPoin",
]);
type Data = Record<string, any>;
type Access = { user: PilotUser; role: PilotUser["role"]; ownerId: string };

function send(res: Response, status: number, body?: unknown) {
  if (body === undefined) return res.status(status).end();
  return res.status(status).json(body);
}

function bearer(req: Request) {
  const header = req.header("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function filter(field: string, value: string) {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `${field} = "${escaped}"`;
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function authEmail(username: string) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@pilot-mt5.local`;
}

function userFrom(record: RecordModel): PilotUser {
  return record as PilotUser;
}

async function dashboardAccess(req: Request): Promise<Access | null> {
  const user = await authenticatePilotUser(bearer(req));
  if (!user || !["owner", "read_only", "staff"].includes(user.role) || !user.owner_id) return null;
  return { user, role: user.role, ownerId: user.owner_id };
}

async function dashboard(req: Request, res: Response, path: string) {
  const access = await dashboardAccess(req);
  if (!access) return send(res, 401, { error: "Sesi login PocketBase tidak valid. Silakan masuk kembali." });
  const { user, role, ownerId } = access;
  const pb = await getPocketBaseAdmin();

  if (path === "/dashboard/session" && req.method === "GET") {
    return send(res, 200, { user: { id: user.id, email: user.username }, role, ownerId });
  }

  if (path === "/dashboard/logs" && req.method === "GET") {
    const commands = await pb.collection("mt5_commands").getList(1, 200, { filter: filter("owner_id", ownerId), sort: "-created" });
    const accountIds = [...new Set(commands.items.map((item) => String(item.account_id)))];
    const actorIds = [...new Set(commands.items.map((item) => String(item.requested_by_user_id || "")).filter(Boolean))];
    const [accounts, users] = await Promise.all([
      accountIds.length ? pb.collection("mt5_accounts").getFullList({ filter: accountIds.map((id) => filter("id", id)).join(" || "), fields: "id,label" }) : [],
      actorIds.length ? pb.collection("users").getFullList({ filter: actorIds.map((id) => filter("id", id)).join(" || "), fields: "id,username,role" }) : [],
    ]);
    const labels = new Map(accounts.map((item) => [item.id, item.label]));
    const actors = new Map(users.map((item) => [item.id, { name: item.username, role: item.role }]));
    return send(res, 200, { logs: commands.items.map((command) => ({
      id: command.id, account_id: command.account_id, action: command.action, status: command.status,
      result_message: command.result_message || null, created_at: command.created, completed_at: command.completed_at || null,
      account_label: labels.get(command.account_id) ?? "Akun EA",
      actor_name: actors.get(command.requested_by_user_id)?.name ?? "Sistem",
      actor_role: actors.get(command.requested_by_user_id)?.role ?? "system",
    })) });
  }

  if (path === "/dashboard/users" && req.method === "GET") {
    if (role !== "owner" || ownerId !== user.id) return send(res, 403, { error: "Hanya owner yang dapat mengelola pengguna." });
    const records = await pb.collection("users").getFullList({ filter: filter("owner_id", user.id), sort: "created" });
    const accounts = await pb.collection("mt5_accounts").getFullList({ filter: filter("owner_id", user.id), fields: "id,label", sort: "created" });
    const labels = new Map(accounts.map((account) => [account.id, account.label]));
    return send(res, 200, { users: records.filter((item) => ["read_only", "staff"].includes(item.role)).map((item) => {
      const accountIds = Array.isArray(item.account_ids) ? item.account_ids.map(String) : [];
      return {
        user_id: item.id, email: item.username, access_role: item.role, created_at: item.created,
        account_ids: accountIds, account_labels: accountIds.map((id) => labels.get(id)).filter(Boolean),
      };
    }) });
  }

  if (path === "/dashboard/users" && req.method === "POST") {
    if (role !== "owner" || ownerId !== user.id) return send(res, 403, { error: "Hanya owner utama yang dapat mendaftarkan pengguna." });
    const body = req.body as Data;
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const requestedRole = body?.accessRole === "staff" || body?.accessRole === "read_only" ? body.accessRole : "";
    const accountIds = Array.isArray(body?.accountIds) && body.accountIds.every((id: unknown) => typeof id === "string")
      ? [...new Set(body.accountIds as string[])] : [];
    if (!requestedRole) return send(res, 400, { error: "Pilih role read-only atau staff." });
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) return send(res, 400, { error: "Nama pengguna harus 3–40 karakter: huruf, angka, titik, garis bawah, atau tanda hubung." });
    if (password.length < 8 || password.length > 128) return send(res, 400, { error: "Password harus berisi 8–128 karakter." });
    if (requestedRole === "staff" && (accountIds.length < 1 || accountIds.length > 25)) return send(res, 400, { error: "Pilih minimal satu akun untuk staff (maksimal 25)." });
    if (requestedRole === "read_only" && accountIds.length) return send(res, 400, { error: "Akun khusus hanya dapat dipilih untuk role staff." });
    if (requestedRole === "staff") {
      const owned = await pb.collection("mt5_accounts").getFullList({ filter: filter("owner_id", user.id), fields: "id" });
      if (accountIds.some((id) => !owned.some((account) => account.id === id))) return send(res, 400, { error: "Pilihan mencakup akun yang bukan milik owner." });
    }
    try {
      const created = await pb.collection("users").create({
        email: authEmail(username), emailVisibility: false, verified: true, password, passwordConfirm: password,
        username, role: requestedRole, owner_id: user.id, account_ids: requestedRole === "staff" ? accountIds : [],
      });
      return send(res, 201, { user: { id: created.id, username, access_role: requestedRole, account_ids: accountIds } });
    } catch (error) {
      console.error("[PocketBase] User creation failed", error instanceof Error ? error.message : "unknown");
      return send(res, 409, { error: "Akun tidak dapat dibuat. Pastikan nama pengguna belum dipakai." });
    }
  }

  const managedUserMatch = path.match(/^\/dashboard\/users\/([A-Za-z0-9]{15})$/);
  if (managedUserMatch && req.method === "PATCH") {
    if (role !== "owner" || ownerId !== user.id) return send(res, 403, { error: "Hanya owner utama yang dapat mengubah akses pengguna." });
    const targetId = managedUserMatch[1];
    const body = req.body as Data;
    const requestedRole = body?.accessRole === "staff" || body?.accessRole === "read_only" ? body.accessRole : "";
    const accountIds = Array.isArray(body?.accountIds) && body.accountIds.every((id: unknown) => typeof id === "string")
      ? [...new Set(body.accountIds as string[])] : [];
    if (targetId === user.id) return send(res, 400, { error: "Akses owner tidak dapat diubah melalui pengelolaan staff." });
    if (!requestedRole) return send(res, 400, { error: "Pilih role read-only atau staff." });
    if (requestedRole === "staff" && (accountIds.length < 1 || accountIds.length > 25)) return send(res, 400, { error: "Pilih minimal satu akun untuk staff." });
    const target = await pb.collection("users").getOne(targetId).catch(() => null);
    if (!target || target.owner_id !== user.id || !["read_only", "staff"].includes(target.role)) return send(res, 404, { error: "Pengguna tidak ditemukan." });
    if (requestedRole === "staff") {
      const owned = await pb.collection("mt5_accounts").getFullList({ filter: filter("owner_id", user.id), fields: "id" });
      if (accountIds.some((id) => !owned.some((account) => account.id === id))) return send(res, 400, { error: "Pilihan mencakup akun yang bukan milik owner." });
    }
    await pb.collection("users").update(targetId, { role: requestedRole, account_ids: requestedRole === "staff" ? accountIds : [] });
    return send(res, 200, { ok: true });
  }

  const accountMatch = path.match(/^\/dashboard\/accounts\/([A-Za-z0-9]{15})(?:\/(polling|config|commands))?$/);
  if (accountMatch && req.method === "PATCH" && !accountMatch[2]) {
    if (role !== "owner" || ownerId !== user.id) return send(res, 403, { error: "Hanya owner yang dapat mengganti nama kartu." });
    const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
    if (!label || label.length > 80) return send(res, 400, { error: "Nama kartu harus berisi 1–80 karakter." });
    const record = await pb.collection("mt5_accounts").getOne(accountMatch[1]).catch(() => null);
    if (!record || record.owner_id !== user.id) return send(res, 404, { error: "Akun tidak ditemukan." });
    const updated = await pb.collection("mt5_accounts").update(record.id, { label });
    return send(res, 200, { account: { id: updated.id, label: updated.label } });
  }

  if (accountMatch && req.method === "DELETE" && !accountMatch[2]) {
    if (role !== "owner" || ownerId !== user.id) return send(res, 403, { error: "Hanya owner yang dapat menghapus EA dari Pilot." });
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password || password.length > 1_024) return send(res, 400, { error: "Masukkan sandi login yang valid." });
    const record = await pb.collection("mt5_accounts").getOne(accountMatch[1]).catch(() => null);
    if (!record || record.owner_id !== user.id) return send(res, 404, { error: "Akun tidak ditemukan." });
    const verifier = newPocketBaseClient();
    try {
      const verified = await verifier.collection("users").authWithPassword(authEmail(user.username), password);
      if (verified.record.id !== user.id) return send(res, 403, { error: "Sandi login tidak cocok." });
    } catch {
      return send(res, 403, { error: "Sandi login tidak cocok." });
    }
    const commands = await pb.collection("mt5_commands").getFullList({ filter: filter("account_id", record.id), fields: "id" });
    for (const command of commands) {
      const events = await pb.collection("mt5_command_events").getFullList({ filter: filter("command_id", command.id), fields: "id" });
      for (const event of events) await pb.collection("mt5_command_events").delete(event.id);
      await pb.collection("mt5_commands").delete(command.id);
    }
    await pb.collection("mt5_accounts").delete(record.id);
    return send(res, 200, { ok: true, label: record.label, message: "EA dihapus dari Pilot. EA di terminal MT5 tidak dihentikan." });
  }

  if (path === "/dashboard/accounts" && req.method === "GET") {
    let accountFilter = filter("owner_id", ownerId);
    if (role === "staff") {
      const ids = Array.isArray(user.account_ids) ? user.account_ids.map(String) : [];
      if (!ids.length) return send(res, 200, { accounts: [] });
      accountFilter = `(${ids.map((id) => filter("id", id)).join(" || ")}) && ${accountFilter}`;
    }
    const accounts = await pb.collection("mt5_accounts").getList(1, 25, { filter: accountFilter, sort: "created" });
    const ids = accounts.items.map((account) => account.id);
    const commands = ids.length ? await pb.collection("mt5_commands").getList(1, 50, {
      filter: `(${ids.map((id) => filter("account_id", id)).join(" || ")}) && ${filter("owner_id", ownerId)}`,
      sort: "-created",
    }) : { items: [] };
    const now = Date.now();
    return send(res, 200, { accounts: accounts.items.map((account) => ({
      id: account.id, label: account.label, broker_account_name: account.broker_account_name || null,
      mt5_login: account.mt5_login || null, server_name: account.server_name || null, currency: account.currency,
      token_hint: account.token_hint, is_cent_account: account.is_cent_account, display_currency: account.display_currency,
      display_rate: account.display_rate, telemetry_received: account.telemetry_received, balance: account.balance,
      equity: account.equity, max_dd_buy: account.max_dd_buy, max_dd_sell: account.max_dd_sell,
      basket_sl_set: account.basket_sl_set, basket_sl_type: account.basket_sl_type, daily_target_set: account.daily_target_set,
      max_float_buy: account.max_float_buy, max_float_sell: account.max_float_sell, running_float: account.running_float,
      open_positions: account.open_positions, ea_status: account.ea_status, running: account.running,
      ea_mode: account.ea_mode, profit: account.profit, floating_profit: account.floating_profit,
      latency_ms: account.latency_ms || null, last_seen_at: account.last_seen_at || null, poll_interval_ms: account.poll_interval_ms,
      ...(role === "owner" ? { ea_config: account.ea_config || null } : {}),
      connection_status: account.last_seen_at && now - Date.parse(account.last_seen_at) <= ONLINE_WINDOW_MS ? "online" : "offline",
      commands: commands.items.filter((command) => command.account_id === account.id).slice(0, 5).map((command) => ({
        id: command.id, account_id: command.account_id, action: command.action, status:
          ["queued", "delivered", "accepted"].includes(command.status) && Date.parse(command.expires_at) <= now ? "expired" : command.status,
        result_message: command.result_message || null, created_at: command.created, expires_at: command.expires_at,
      })),
    })) });
  }

  if (path === "/dashboard/accounts" && req.method === "POST") {
    if (role !== "owner") return send(res, 403, { error: "Aksi ini hanya tersedia untuk owner." });
    const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
    if (!label || label.length > 80) return send(res, 400, { error: "Nama akun harus berisi 1–80 karakter." });
    const existing = await pb.collection("mt5_accounts").getList(1, 1, { filter: filter("owner_id", user.id) });
    if (existing.totalItems >= 10) return send(res, 429, { error: "Batas 10 akun koneksi tercapai." });
    const token = randomToken();
    const account = await pb.collection("mt5_accounts").create({
      owner_id: user.id, label, token_hash: hash(token), token_hint: token.slice(-8), currency: "USD",
      telemetry_received: false, balance: 0, equity: 0, max_dd_buy: 0, max_dd_sell: 0, basket_sl_set: 0,
      basket_sl_type: "money", daily_target_set: 0, max_float_buy: 0, max_float_sell: 0, running_float: 0,
      open_positions: 0, ea_status: "MENUNGGU EA", is_cent_account: false, display_currency: "USD", display_rate: 18_000,
      running: false, ea_mode: "auto", profit: 0, floating_profit: 0, poll_interval_ms: 1_000,
    });
    await createCommand(pb, account, user.id, "auto", null, 30 * 24 * 60 * 60 * 1_000, "AUTO awal untuk kartu EA baru; menunggu EA tersambung.");
    return send(res, 201, { account: { id: account.id, label: account.label, token_hint: account.token_hint, created_at: account.created }, token });
  }

  if (accountMatch && accountMatch[2] === "polling" && req.method === "PATCH") {
    if (role !== "owner") return send(res, 403, { error: "Pengaturan polling hanya tersedia untuk owner." });
    const intervalMs = req.body?.intervalMs;
    if (![500, 1_000, 2_000].includes(intervalMs)) return send(res, 400, { error: "Interval polling harus 500, 1000, atau 2000 ms." });
    const account = await pb.collection("mt5_accounts").getOne(accountMatch[1]).catch(() => null);
    if (!account || account.owner_id !== user.id) return send(res, 404, { error: "Akun tidak ditemukan." });
    await pb.collection("mt5_accounts").update(account.id, { poll_interval_ms: intervalMs });
    return send(res, 200, { pollIntervalMs: intervalMs });
  }

  if (accountMatch && accountMatch[2] === "config" && req.method === "POST") {
    if (role !== "owner") return send(res, 403, { error: "Aksi ini hanya tersedia untuk owner." });
    const config = req.body?.config;
    if (!validConfig(config)) return send(res, 400, { error: "Konfigurasi EA tidak valid atau berisi parameter yang tidak dikenal." });
    const account = await pb.collection("mt5_accounts").getOne(accountMatch[1]).catch(() => null);
    if (!account || account.owner_id !== user.id) return send(res, 404, { error: "Akun tidak ditemukan." });
    if (!account.last_seen_at || Date.now() - Date.parse(account.last_seen_at) > ONLINE_WINDOW_MS) return send(res, 409, { error: "EA offline atau heartbeat sudah kedaluwarsa." });
    const pending = await pb.collection("mt5_commands").getList(1, 1, {
      filter: `${filter("account_id", account.id)} && ${filter("action", "config")} && (${activeStatuses.map((status) => filter("status", status)).join(" || ")}) && expires_at > "${new Date().toISOString()}"`,
    });
    if (pending.totalItems) return send(res, 409, { error: "Masih ada perintah yang belum selesai." });
    const command = await createCommand(pb, account, user.id, "config", config);
    const minimumAutoBalance = Number(config.MinimumBalanceAuto ?? 1000);
    const belowMinimum = Number(account.balance ?? 0) < minimumAutoBalance;
    await pb.collection("mt5_accounts").update(account.id, {
      ea_config: config,
      ...(belowMinimum && account.ea_mode === "auto" ? { ea_mode: "manual" } : {}),
    });
    let restoreModeCommand = null;
    if (account.ea_mode === "auto" && !belowMinimum) restoreModeCommand = await createCommand(pb, account, user.id, "auto");
    return send(res, 201, { command: commandResult(command), restoreModeCommand: restoreModeCommand ? commandResult(restoreModeCommand) : null });
  }

  if (accountMatch && accountMatch[2] === "commands" && req.method === "POST") {
    if (!["owner", "staff"].includes(role)) return send(res, 403, { error: "Role ini tidak dapat mengirim perintah EA." });
    const action = typeof req.body?.action === "string" ? req.body.action : "";
    if (!actions.has(action)) return send(res, 400, { error: "Jenis perintah tidak dikenal." });
    const account = await pb.collection("mt5_accounts").getOne(accountMatch[1]).catch(() => null);
    if (!account || account.owner_id !== ownerId) return send(res, 404, { error: "Akun tidak ditemukan." });
    if (role === "staff" && !(Array.isArray(user.account_ids) && user.account_ids.includes(account.id))) return send(res, 403, { error: "Staff tidak memiliki akses ke akun ini." });
    if (action === "auto") {
      const minimumAutoBalance = Number(account.ea_config?.MinimumBalanceAuto ?? 1000);
      if (Number(account.balance ?? 0) < minimumAutoBalance) {
        return send(res, 409, { error: `AUTO ditolak: saldo harus minimal ${minimumAutoBalance} ${account.currency || "akun"}.` });
      }
    }
    if (!account.last_seen_at || Date.now() - Date.parse(account.last_seen_at) > ONLINE_WINDOW_MS) return send(res, 409, { error: "EA offline atau heartbeat sudah kedaluwarsa." });
    const command = await createCommand(pb, account, user.id, action);
    return send(res, 201, { command: commandResult(command) });
  }

  return send(res, 404, { error: "Rute dashboard tidak ditemukan." });
}

function validConfig(value: unknown): value is Data {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Data);
  return entries.length > 0 && entries.length <= configKeys.size && entries.every(([key, item]) =>
    configKeys.has(key) && (typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) &&
    (key !== "MinimumBalanceAuto" || (Number(item) >= 0 && Number(item) <= 1e15)));
}

function validEaConfig(value: unknown): value is Data {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Data);
  const isCurrentOrLegacyConfig = entries.length === configKeys.size || entries.length === configKeys.size - 1;
  return isCurrentOrLegacyConfig && entries.every(([key, item]) => configKeys.has(key) && typeof item === "number" && Number.isFinite(item) &&
    (key !== "MinimumBalanceAuto" || (item >= 0 && item <= 1e15)));
}

function sameConfig(expected: unknown, actual: unknown) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected) || !actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const expectedEntries = Object.entries(expected as Data);
  const actualRecord = actual as Data;
  return expectedEntries.length === Object.keys(actualRecord).length && expectedEntries.every(([key, value]) => {
    const current = actualRecord[key];
    return typeof value === "number" && typeof current === "number" && Number.isFinite(current) && value === current;
  });
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

async function writeEvent(pb: PocketBase, command: Data, status: string, message: string | null = null) {
  await pb.collection("mt5_command_events").create({
    command_id: command.id, account_id: command.account_id, owner_id: command.owner_id,
    requested_by_user_id: command.requested_by_user_id || "", status, message: message || "",
  });
}

async function createCommand(
  pb: PocketBase,
  account: Data,
  requestedBy: string,
  action: string,
  payload: Data | null = null,
  ttlMs = COMMAND_TTL_MS,
  eventMessage: string | null = null,
) {
  const command = await pb.collection("mt5_commands").create({
    account_id: account.id, owner_id: account.owner_id, requested_by_user_id: requestedBy,
    action, status: "queued", expires_at: new Date(Date.now() + ttlMs).toISOString(), payload,
  });
  await writeEvent(pb, command, "queued", eventMessage);
  return command;
}

function commandResult(command: Data) {
  return {
    id: command.id, action: command.action, status: command.status, created_at: command.created,
    expires_at: command.expires_at, payload: command.payload || null,
  };
}

async function authenticateEa(req: Request, pb: PocketBase) {
  const token = bearer(req);
  if (token.length < 40 || token.length > 128) return null;
  return pb.collection("mt5_accounts").getFirstListItem(filter("token_hash", hash(token)), {
    fields: "id,owner_id,label,poll_interval_ms,ea_mode",
  }).catch(() => null);
}

async function ea(req: Request, res: Response, path: string) {
  const pb = await getPocketBaseAdmin();
  const account = await authenticateEa(req, pb);
  if (!account) return send(res, 401, { error: "Token EA tidak valid." });

  if (path === "/telemetry" && req.method === "POST") {
    const body = req.body as Data;
    const requiredNumbers = ["balance", "equity", "maxDdBuy", "maxDdSell", "profit", "floatingProfit"] as const;
    const panelNumbers = ["basketSlSet", "dailyTargetSet", "maxFloatBuy", "maxFloatSell", "runningFloat"] as const;
    if (!body || requiredNumbers.some((key) => !finite(body[key], -1e12, 1e15)) ||
      panelNumbers.some((key) => !finite(body[key], -1e12, 1e15)) ||
      (body.eaConfig !== undefined && !validEaConfig(body.eaConfig)) ||
      (body.openPositions !== undefined && (!Number.isInteger(body.openPositions) || body.openPositions < 0 || body.openPositions > 1e6)) ||
      (body.eaStatus !== undefined && (typeof body.eaStatus !== "string" || body.eaStatus.length > 80)) ||
      !["money", "percent"].includes(body.basketSlType) || typeof body.running !== "boolean" ||
      typeof body.isCentAccount !== "boolean" || !["USD", "CENT", "IDR"].includes(body.displayCurrency) ||
      !finite(body.displayRate, 0.0001, 1e9) || !["auto", "manual"].includes(body.eaMode) ||
      typeof body.currency !== "string" || !/^[A-Z]{3,8}$/.test(body.currency) ||
      typeof body.accountName !== "string" || body.accountName.length > 120 ||
      (body.login !== undefined && (!Number.isSafeInteger(body.login) || body.login < 0)) ||
      (body.serverName !== undefined && (typeof body.serverName !== "string" || body.serverName.length > 120)) ||
      (body.latencyMs !== undefined && !finite(body.latencyMs, 0, 60_000))) {
      return send(res, 400, { error: "Payload telemetri tidak valid." });
    }
    let syncEaConfig = false;
    if (body.eaConfig !== undefined) {
      const pending = await pb.collection("mt5_commands").getList(1, 1, {
        filter: `${filter("account_id", account.id)} && ${filter("action", "config")} && (${activeStatuses.map((status) => filter("status", status)).join(" || ")})`,
      });
      const command = pending.items[0];
      if (!command) syncEaConfig = true;
      else if (sameConfig(command.payload, body.eaConfig)) {
        if (["delivered", "accepted"].includes(command.status)) {
          await pb.collection("mt5_commands").update(command.id, {
            status: "succeeded", completed_at: new Date().toISOString(), result_message: "Konfigurasi terverifikasi melalui telemetry EA.",
          });
          await writeEvent(pb, command, "succeeded", "Konfigurasi terverifikasi melalui telemetry EA.");
        }
        syncEaConfig = true;
      }
    }
    const update: Data = {
      broker_account_name: body.accountName, mt5_login: body.login ?? null, server_name: body.serverName ?? "",
      is_cent_account: body.isCentAccount, display_currency: body.displayCurrency, display_rate: body.displayRate,
      telemetry_received: true, balance: body.balance, equity: body.equity, max_dd_buy: body.maxDdBuy,
      max_dd_sell: body.maxDdSell, basket_sl_set: body.basketSlSet, basket_sl_type: body.basketSlType,
      daily_target_set: body.dailyTargetSet, max_float_buy: body.maxFloatBuy, max_float_sell: body.maxFloatSell,
      running_float: body.runningFloat, open_positions: body.openPositions ?? 0,
      ea_status: body.eaStatus ?? (body.running ? "ACTIVE" : "MANUAL"), running: body.running,
      ea_mode: body.eaMode, profit: body.profit, floating_profit: body.floatingProfit, currency: body.currency,
      latency_ms: body.latencyMs ?? null, last_seen_at: new Date().toISOString(),
    };
    if (syncEaConfig) update.ea_config = body.eaConfig;
    await pb.collection("mt5_accounts").update(account.id, update);
    return send(res, 200, { ok: true, serverTime: update.last_seen_at });
  }

  if (path === "/commands/next" && req.method === "GET") {
    const commands = await pb.collection("mt5_commands").getList(1, 10, {
      filter: `${filter("account_id", account.id)} && (${filter("status", "queued")} || ${filter("status", "delivered")})`, sort: "created",
    });
    const now = Date.now();
    const command = commands.items.find((item) => item.status === "queued" || Date.parse(item.expires_at) > now);
    if (!command) return send(res, 200, { commandId: "", action: "", payload: null, pollIntervalMs: account.poll_interval_ms ?? 1_000, eaMode: account.ea_mode ?? "manual" });
    let expiresAt = command.expires_at;
    if (command.status === "queued") {
      expiresAt = new Date(now + COMMAND_TTL_MS).toISOString();
      await pb.collection("mt5_commands").update(command.id, { status: "delivered", delivered_at: new Date().toISOString(), expires_at: expiresAt });
      await writeEvent(pb, command, "delivered");
    }
    return send(res, 200, { commandId: command.id, action: command.action, payload: command.payload || null, expiresAt,
      pollIntervalMs: account.poll_interval_ms ?? 1_000, eaMode: account.ea_mode ?? "manual" });
  }

  const ackMatch = path.match(/^\/commands\/([A-Za-z0-9]{15})\/ack$/);
  if (ackMatch && req.method === "POST") {
    const body = req.body as Data;
    const status = typeof body?.status === "string" ? body.status : "";
    const message = typeof body?.message === "string" ? body.message.slice(0, 500) : null;
    if (!["accepted", "succeeded", "failed"].includes(status)) return send(res, 400, { error: "Status acknowledgement tidak valid." });
    const command = await pb.collection("mt5_commands").getOne(ackMatch[1]).catch(() => null);
    if (!command || command.account_id !== account.id) return send(res, 404, { error: "Perintah tidak ditemukan." });
    if (["succeeded", "failed", "expired"].includes(command.status)) return send(res, 200, { ok: true, status: command.status });
    if (command.status !== "accepted" && Date.parse(command.expires_at) <= Date.now()) {
      const expiredMessage = "Acknowledgement terlambat.";
      await pb.collection("mt5_commands").update(command.id, { status: "expired", completed_at: new Date().toISOString(), result_message: expiredMessage });
      await writeEvent(pb, command, "expired", expiredMessage);
      return send(res, 410, { error: "Perintah kedaluwarsa." });
    }
    const allowed = status === "accepted" ? ["queued", "delivered"].includes(command.status) : ["delivered", "accepted"].includes(command.status);
    if (!allowed && status !== command.status) return send(res, 409, { error: "Transisi status perintah tidak valid." });
    if (command.action === "config" && status === "succeeded") return send(res, 200, { ok: true, status: command.status, message: "Menunggu telemetry EA untuk verifikasi konfigurasi." });
    const now = new Date().toISOString();
    const persistedMode = status === "succeeded" && command.action === "auto" ? "auto"
      : ["manual", "close_buy", "close_sell", "close_all"].includes(command.action) && ["succeeded", "failed"].includes(status) ? "manual" : null;
    if (persistedMode) await pb.collection("mt5_accounts").update(account.id, { ea_mode: persistedMode });
    await pb.collection("mt5_commands").update(command.id, {
      status, result_message: message || "", ...(["succeeded", "failed"].includes(status) ? { completed_at: now } : {}),
    });
    await writeEvent(pb, command, status, message);
    return send(res, 200, { ok: true, status });
  }

  return send(res, 404, { error: "Rute EA tidak ditemukan." });
}

export function registerPocketBaseApi(app: Express) {
  app.post("/api/auth/verify", async (req, res) => {
    const user = await authenticatePilotUser(bearer(req));
    if (!user) return send(res, 401, { error: "Sesi login PocketBase tidak valid." });
    return send(res, 200, { user: { id: user.id, email: user.username } });
  });

  app.all("/api/pilot", async (req, res) => {
    const path = typeof req.query.route === "string" ? req.query.route : "";
    try {
      if (path.startsWith("/dashboard/")) return await dashboard(req, res, path);
      return await ea(req, res, path);
    } catch (error) {
      console.error("[PocketBase API] Request failed", error instanceof Error ? error.message : "unknown error");
      return send(res, 500, { error: "Permintaan tidak dapat diproses." });
    }
  });
}
