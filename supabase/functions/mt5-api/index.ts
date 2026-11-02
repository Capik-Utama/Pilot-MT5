import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceKey) throw new Error("Supabase function secrets are not configured");

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-mt5-client",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Cache-Control": "no-store",
};
const ONLINE_WINDOW_MS = 20_000;
const COMMAND_TTL_MS = 45_000;
const actions = new Set(["auto", "manual", "buy", "sell", "close_buy", "close_sell", "close_all", "reset"]);
const configKeys = new Set(["ModePerdagangan", "MataUangTampilan", "KursUSD_IDR", "MagicBeli", "MagicJual", "LotAwal", "PenggandaLot", "LotMaksimal", "LangkahLayer", "JarakGrid", "JarakTrailingPending", "JenisBatasRugi", "BatasKerugian", "TargetHarian", "SetelahTargetTercapai", "ModeTrailing", "MulaiTrailingPoin", "KunciProfitPoin", "LangkahTrailingPoin"]);

function validConfig(value: unknown): value is Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Json);
  if (!entries.length || entries.length > configKeys.size || entries.some(([key]) => !configKeys.has(key))) return false;
  return entries.every(([, item]) => (typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))));
}
function validEaConfig(value: unknown): value is Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Json);
  return entries.length === configKeys.size && entries.every(([key, item]) =>
    configKeys.has(key) && typeof item === "number" && Number.isFinite(item));
}
const activeStatuses = ["queued", "delivered", "accepted"];

type Json = Record<string, unknown>;

function respond(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
  });
}

function bearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function jsonBody(req: Request): Promise<Json | null> {
  try {
    const value: unknown = await req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
  } catch {
    return null;
  }
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

async function dashboardUser(req: Request) {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function authenticateEa(req: Request) {
  const token = bearer(req);
  if (token.length < 40 || token.length > 128) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await admin.from("mt5_accounts").select("id,owner_id,label,is_demo")
    .eq("token_hash", tokenHash).maybeSingle();
  if (error || !data) return null;
  return data;
}

async function writeEvent(command: { id: string; account_id: string; owner_id: string; requested_by_user_id?: string }, status: string, message: string | null = null) {
  const { error } = await admin.from("mt5_command_events").insert({
    command_id: command.id,
    account_id: command.account_id,
    owner_id: command.owner_id,
    requested_by_user_id: command.requested_by_user_id ?? null,
    status,
    message,
  });
  if (error) throw error;
}

async function handleDashboard(req: Request, path: string) {
  const user = await dashboardUser(req);
  if (!user) return respond(401, { error: "Sesi Supabase tidak valid. Silakan masuk lagi." });
  const { data: access, error: accessError } = await admin.from("pilot_user_access")
    .select("user_id,owner_id,email,access_role").eq("user_id", user.id).maybeSingle();
  if (accessError) return respond(500, { error: "Hak akses pengguna tidak dapat diperiksa." });
  if (!access) return respond(403, { error: "Akses MT5 Pilot belum didaftarkan oleh owner." });

  if (path === "/dashboard/session" && req.method === "GET") {
    return respond(200, {
      user: { id: access.user_id, email: access.email },
      role: access.access_role,
      ownerId: access.owner_id,
    });
  }

  if (path === "/dashboard/users" && req.method === "GET") {
    if (access.access_role !== "owner") return respond(403, { error: "Hanya owner yang dapat mengelola pengguna." });
    const { data, error } = await admin.from("pilot_user_access")
      .select("user_id,email,access_role,created_at")
      .eq("owner_id", user.id).in("access_role", ["read_only", "staff"])
      .order("created_at", { ascending: true }).limit(100);
    if (error) return respond(500, { error: "Daftar pengguna tidak dapat dimuat." });
    const userIds = (data ?? []).map((item) => item.user_id);
    let assignments: Json[] = [];
    if (userIds.length) {
      const { data: rows, error: assignmentError } = await admin.from("pilot_user_account_access")
        .select("user_id,account_id").eq("owner_id", user.id).in("user_id", userIds).limit(2_500);
      if (assignmentError) return respond(500, { error: "Hak akses akun staff tidak dapat dimuat." });
      assignments = rows ?? [];
    }
    const { data: accounts, error: accountsError } = await admin.from("mt5_accounts")
      .select("id,label").eq("owner_id", user.id).order("created_at", { ascending: true }).limit(25);
    if (accountsError) return respond(500, { error: "Daftar akun tidak dapat dimuat." });
    const labels = new Map((accounts ?? []).map((account) => [account.id, account.label]));
    return respond(200, { users: (data ?? []).map((item) => {
      const accountIds = assignments.filter((row) => row.user_id === item.user_id).map((row) => String(row.account_id));
      return { ...item, account_ids: accountIds, account_labels: accountIds.map((id) => labels.get(id)).filter(Boolean) };
    }) });
  }

  if (path === "/dashboard/users" && req.method === "POST") {
    if (access.access_role !== "owner" || access.owner_id !== user.id) {
      return respond(403, { error: "Hanya owner utama yang dapat mendaftarkan pengguna." });
    }
    const body = await jsonBody(req);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const requestedRole = body?.accessRole === "staff" ? "staff" : body?.accessRole === "read_only" ? "read_only" : "";
    const accountIds = Array.isArray(body?.accountIds) && body.accountIds.every((id) => typeof id === "string")
      ? [...new Set(body.accountIds as string[])] : [];
    if (!requestedRole) return respond(400, { error: "Pilih role read-only atau staff." });
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(400, { error: "Alamat email tidak valid." });
    }
    if (requestedRole === "staff" && (accountIds.length < 1 || accountIds.length > 25)) {
      return respond(400, { error: "Pilih minimal satu akun untuk staff (maksimal 25)." });
    }
    if (requestedRole === "read_only" && accountIds.length) return respond(400, { error: "Akun khusus hanya dapat dipilih untuk role staff." });
    if (requestedRole === "staff") {
      const { data: validAccounts, error: accountError } = await admin.from("mt5_accounts")
        .select("id").eq("owner_id", user.id).in("id", accountIds).limit(25);
      if (accountError) return respond(500, { error: "Akun staff tidak dapat divalidasi." });
      if ((validAccounts ?? []).length !== accountIds.length) return respond(400, { error: "Pilihan mencakup akun yang bukan milik owner." });
    }
    const password = temporaryPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { pilot_role: requestedRole, pilot_provisioned_by: "owner" },
    });
    if (createError || !created.user) {
      console.error("[mt5-api] owner user creation failed", createError?.message ?? "unknown");
      return respond(409, { error: "Akun tidak dapat dibuat. Periksa apakah email sudah terdaftar." });
    }
    const { error: roleError } = await admin.from("pilot_user_access").insert({
      user_id: created.user.id,
      owner_id: user.id,
      email,
      access_role: requestedRole,
    });
    if (roleError) {
      await admin.auth.admin.deleteUser(created.user.id);
      console.error("[mt5-api] owner user role assignment failed", roleError.message);
      return respond(500, { error: "Role pengguna gagal disimpan; akun baru dibatalkan." });
    }
    if (requestedRole === "staff") {
      const { error: assignmentError } = await admin.from("pilot_user_account_access").insert(
        accountIds.map((accountId) => ({ user_id: created.user.id, owner_id: user.id, account_id: accountId })),
      );
      if (assignmentError) {
        await admin.auth.admin.deleteUser(created.user.id);
        console.error("[mt5-api] staff account assignment failed", assignmentError.message);
        return respond(500, { error: "Pilihan akun staff gagal disimpan; akun baru dibatalkan." });
      }
    }
    return respond(201, { user: { id: created.user.id, email, access_role: requestedRole, account_ids: accountIds }, temporaryPassword: password });
  }

  const accountAccessMatch = path.match(/^\/dashboard\/users\/([0-9a-f-]{36})$/i);
  if (accountAccessMatch && req.method === "PATCH") {
    if (access.access_role !== "owner" || access.owner_id !== user.id) return respond(403, { error: "Hanya owner utama yang dapat mengubah akses pengguna." });
    const targetUserId = accountAccessMatch[1];
    if (targetUserId === user.id) return respond(400, { error: "Akses owner tidak dapat diubah melalui pengelolaan staff." });
    const body = await jsonBody(req);
    const requestedRole = body?.accessRole === "staff" ? "staff" : body?.accessRole === "read_only" ? "read_only" : "";
    const accountIds = Array.isArray(body?.accountIds) && body.accountIds.every((id) => typeof id === "string")
      ? [...new Set(body.accountIds as string[])] : [];
    if (!requestedRole) return respond(400, { error: "Pilih role read-only atau staff." });
    if (requestedRole === "staff" && (accountIds.length < 1 || accountIds.length > 25)) return respond(400, { error: "Pilih minimal satu akun untuk staff." });
    const { data: target, error: targetError } = await admin.from("pilot_user_access").select("user_id")
      .eq("user_id", targetUserId).eq("owner_id", user.id).in("access_role", ["read_only", "staff"]).maybeSingle();
    if (targetError || !target) return respond(404, { error: "Pengguna tidak ditemukan." });
    if (requestedRole === "staff") {
      const { data: validAccounts, error: accountError } = await admin.from("mt5_accounts")
        .select("id").eq("owner_id", user.id).in("id", accountIds).limit(25);
      if (accountError) return respond(500, { error: "Akun staff tidak dapat divalidasi." });
      if ((validAccounts ?? []).length !== accountIds.length) return respond(400, { error: "Pilihan mencakup akun yang bukan milik owner." });
    }
    const { error: updateError } = await admin.from("pilot_user_access").update({ access_role: requestedRole })
      .eq("user_id", targetUserId).eq("owner_id", user.id);
    if (updateError) return respond(500, { error: "Role pengguna tidak dapat diperbarui." });
    const { error: deleteError } = await admin.from("pilot_user_account_access").delete().eq("user_id", targetUserId).eq("owner_id", user.id);
    if (deleteError) return respond(500, { error: "Akses akun lama tidak dapat diperbarui." });
    if (requestedRole === "staff") {
      const { error: insertError } = await admin.from("pilot_user_account_access").insert(
        accountIds.map((accountId) => ({ user_id: targetUserId, owner_id: user.id, account_id: accountId })),
      );
      if (insertError) return respond(500, { error: "Akses akun staff tidak dapat disimpan." });
    }
    return respond(200, { ok: true });
  }

  if (path === "/dashboard/accounts" && req.method === "GET") {
    let allowedAccountIds: string[] | null = null;
    if (access.access_role === "staff") {
      const { data: assignments, error: assignmentError } = await admin.from("pilot_user_account_access")
        .select("account_id").eq("user_id", user.id).eq("owner_id", access.owner_id).limit(25);
      if (assignmentError) return respond(500, { error: "Daftar akun staff gagal dibaca." });
      allowedAccountIds = (assignments ?? []).map((row) => String(row.account_id));
      if (!allowedAccountIds.length) return respond(200, { accounts: [] });
    }
    const accountColumns = "id,label,broker_account_name,mt5_login,server_name,currency,token_hint,is_demo,is_cent_account,display_currency,display_rate,telemetry_received,balance,equity,max_dd_buy,max_dd_sell,basket_sl_set,daily_target_set,max_float_buy,max_float_sell,running_float,basket_sl_type,open_positions,ea_status,running,ea_mode,profit,floating_profit,latency_ms,last_seen_at,created_at";
    let accountQuery = admin.from("mt5_accounts").select(access.access_role === "owner" ? `${accountColumns},ea_config` : accountColumns)
      .eq("owner_id", access.owner_id).order("created_at", { ascending: true }).limit(25);
    if (allowedAccountIds) accountQuery = accountQuery.in("id", allowedAccountIds);
    const { data: accounts, error } = await accountQuery;
    if (error) return respond(500, { error: "Data akun gagal dibaca." });
    const accountIds = (accounts ?? []).map((account) => account.id);
    let commands: Json[] = [];
    if (accountIds.length) {
      const { data, error: commandError } = await admin.from("mt5_commands").select(
        "id,account_id,action,status,result_message,created_at,expires_at",
      ).eq("owner_id", access.owner_id).in("account_id", accountIds).order("created_at", { ascending: false }).limit(50);
      if (commandError) return respond(500, { error: "Status perintah gagal dibaca." });
      commands = data ?? [];
    }
    const now = Date.now();
    return respond(200, {
      accounts: (accounts ?? []).map((account) => ({
        ...account,
        connection_status: account.last_seen_at && now - Date.parse(account.last_seen_at) <= ONLINE_WINDOW_MS ? "online" : "offline",
        commands: commands.filter((command) => command.account_id === account.id).slice(0, 5).map((command) => ({
          ...command,
          status: ["queued", "delivered"].includes(String(command.status)) && Date.parse(String(command.expires_at)) <= now ? "expired" : command.status,
        })),
      })),
    });
  }

  if (path === "/dashboard/accounts" && req.method === "POST") {
    if (access.access_role !== "owner") return respond(403, { error: "Aksi ini hanya tersedia untuk owner." });
    const body = await jsonBody(req);
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    if (label.length < 1 || label.length > 80) return respond(400, { error: "Nama akun harus berisi 1–80 karakter." });
    const { count, error: countError } = await admin.from("mt5_accounts").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
    if (countError) return respond(500, { error: "Akun belum dapat dibuat." });
    if ((count ?? 0) >= 10) return respond(429, { error: "Batas 10 akun koneksi tercapai." });
    const token = randomToken();
    const row = {
      owner_id: user.id,
      label,
      token_hash: await sha256(token),
      token_hint: token.slice(-8),
      ea_mode: "manual",
      running: false,
    };
    const { data, error } = await admin.from("mt5_accounts").insert(row).select("id,label,token_hint,created_at").single();
    if (error || !data) return respond(500, { error: "Akun koneksi gagal dibuat." });
    return respond(201, { account: data, token });
  }

  const configMatch = path.match(/^\/dashboard\/accounts\/([0-9a-f-]{36})\/config$/i);
  if (configMatch && req.method === "POST") {
    if (access.access_role !== "owner") return respond(403, { error: "Aksi ini hanya tersedia untuk owner." });
    const body = await jsonBody(req);
    const config = body?.config;
    if (!validConfig(config)) return respond(400, { error: "Konfigurasi EA tidak valid atau berisi parameter yang tidak dikenal." });
    const accountId = configMatch[1];
    const { data: account, error: accountError } = await admin.from("mt5_accounts")
      .select("id,owner_id,last_seen_at").eq("id", accountId).eq("owner_id", user.id).maybeSingle();
    if (accountError || !account) return respond(404, { error: "Akun tidak ditemukan." });
    if (!account.last_seen_at || Date.now() - Date.parse(account.last_seen_at) > ONLINE_WINDOW_MS) return respond(409, { error: "EA offline atau heartbeat sudah kedaluwarsa." });
    const { data: pending, error: pendingError } = await admin.from("mt5_commands").select("id")
      .eq("account_id", accountId).in("status", activeStatuses).gt("expires_at", new Date().toISOString()).limit(1);
    if (pendingError) return respond(500, { error: "Antrean konfigurasi gagal diperiksa." });
    if (pending?.length) return respond(409, { error: "Masih ada perintah yang belum selesai." });
    const expiresAt = new Date(Date.now() + COMMAND_TTL_MS).toISOString();
    const { data: command, error: commandError } = await admin.from("mt5_commands")
      .insert({ account_id: accountId, owner_id: user.id, action: "config", payload: config, status: "queued", expires_at: expiresAt })
      .select("id,action,status,created_at,expires_at").single();
    if (commandError || !command) return respond(500, { error: "Konfigurasi gagal dimasukkan ke antrean." });
    const { error: updateError } = await admin.from("mt5_accounts").update({ ea_config: config, updated_at: new Date().toISOString() }).eq("id", accountId).eq("owner_id", user.id);
    if (updateError) { await admin.from("mt5_commands").delete().eq("id", command.id); return respond(500, { error: "Konfigurasi gagal disimpan ke Supabase." }); }
    try { await writeEvent({ id: command.id, account_id: accountId, owner_id: user.id }, "queued"); }
    catch { await admin.from("mt5_commands").delete().eq("id", command.id); return respond(500, { error: "Jejak audit gagal ditulis; konfigurasi dibatalkan." }); }
    return respond(201, { command });
  }

  const commandMatch = path.match(/^\/dashboard\/accounts\/([0-9a-f-]{36})\/commands$/i);
  if (commandMatch && req.method === "POST") {
    if (!["owner", "staff"].includes(access.access_role)) return respond(403, { error: "Role ini tidak dapat mengirim perintah EA." });
    const body = await jsonBody(req);
    const action = typeof body?.action === "string" ? body.action : "";
    if (!actions.has(action)) return respond(400, { error: "Jenis perintah tidak dikenal." });
    const accountId = commandMatch[1];
    const { data: account, error: accountError } = await admin.from("mt5_accounts")
      .select("id,owner_id,last_seen_at").eq("id", accountId).eq("owner_id", access.owner_id).maybeSingle();
    if (accountError || !account) return respond(404, { error: "Akun tidak ditemukan." });
    if (access.access_role === "staff") {
      const { data: assignment, error: assignmentError } = await admin.from("pilot_user_account_access").select("account_id")
        .eq("user_id", user.id).eq("owner_id", account.owner_id).eq("account_id", accountId).maybeSingle();
      if (assignmentError) return respond(500, { error: "Izin akun staff tidak dapat diperiksa." });
      if (!assignment) return respond(403, { error: "Staff tidak memiliki akses ke akun ini." });
    }
    if (!account.last_seen_at || Date.now() - Date.parse(account.last_seen_at) > ONLINE_WINDOW_MS) {
      return respond(409, { error: "EA offline atau heartbeat sudah kedaluwarsa." });
    }
    const { data: pending, error: pendingError } = await admin.from("mt5_commands").select("id")
      .eq("account_id", accountId).in("status", activeStatuses).gt("expires_at", new Date().toISOString()).limit(1);
    if (pendingError) return respond(500, { error: "Antrean perintah gagal diperiksa." });
    if (pending?.length) return respond(409, { error: "Masih ada perintah yang belum selesai." });
    const command = { account_id: accountId, owner_id: account.owner_id, requested_by_user_id: user.id, action, status: "queued", expires_at: new Date(Date.now() + COMMAND_TTL_MS).toISOString() };
    const { data, error } = await admin.from("mt5_commands").insert(command).select("id,action,status,created_at,expires_at").single();
    if (error || !data) return respond(500, { error: "Perintah gagal dimasukkan ke antrean." });
    try {
      await writeEvent({ id: data.id, account_id: accountId, owner_id: account.owner_id, requested_by_user_id: user.id }, "queued");
    } catch {
      await admin.from("mt5_commands").delete().eq("id", data.id);
      return respond(500, { error: "Jejak audit gagal ditulis; perintah dibatalkan." });
    }
    return respond(201, { command: data });
  }

  return respond(404, { error: "Rute dashboard tidak ditemukan." });
}

async function handleEa(req: Request, path: string) {
  const account = await authenticateEa(req);
  if (!account) return respond(401, { error: "Token EA tidak valid." });

  if (path === "/telemetry" && req.method === "POST") {
    const body = await jsonBody(req);
    const requiredNumbers = ["balance", "equity", "maxDdBuy", "maxDdSell", "profit", "floatingProfit"] as const;
    const panelNumbers = ["basketSlSet", "dailyTargetSet", "maxFloatBuy", "maxFloatSell", "runningFloat"] as const;
    if (!body || requiredNumbers.some((key) => !finite(body[key], -1e12, 1e15)) ||
      panelNumbers.some((key) => !finite(body[key], -1e12, 1e15)) ||
      (body.eaConfig !== undefined && !validEaConfig(body.eaConfig)) ||
      (body.openPositions !== undefined && (!Number.isInteger(body.openPositions) || Number(body.openPositions) < 0 || Number(body.openPositions) > 1e6)) ||
      (body.eaStatus !== undefined && (typeof body.eaStatus !== "string" || body.eaStatus.length > 80)) ||
      (typeof body.basketSlType !== "string" || !["money", "percent"].includes(body.basketSlType)) ||
      typeof body.running !== "boolean" || typeof body.isDemo !== "boolean" ||
      typeof body.isCentAccount !== "boolean" ||
      typeof body.displayCurrency !== "string" || !["USD", "CENT", "IDR"].includes(body.displayCurrency) ||
      !finite(body.displayRate, 0.0001, 1e9) ||
      !["auto", "manual"].includes(String(body.eaMode)) ||
      typeof body.currency !== "string" || !/^[A-Z]{3,8}$/.test(body.currency) ||
      typeof body.accountName !== "string" || body.accountName.length > 120 ||
      (body.login !== undefined && (!Number.isSafeInteger(body.login) || Number(body.login) < 0)) ||
      (body.serverName !== undefined && (typeof body.serverName !== "string" || body.serverName.length > 120)) ||
      (body.latencyMs !== undefined && !finite(body.latencyMs, 0, 60_000))) {
      return respond(400, { error: "Payload telemetri tidak valid." });
    }
    let syncEaConfig = false;
    if (body.eaConfig !== undefined) {
      const { data: pendingConfig, error: pendingConfigError } = await admin.from("mt5_commands").select("id")
        .eq("account_id", account.id).eq("action", "config").in("status", activeStatuses)
        .gt("expires_at", new Date().toISOString()).limit(1);
      if (pendingConfigError) return respond(500, { error: "Status konfigurasi EA tidak dapat diperiksa." });
      syncEaConfig = !pendingConfig?.length;
    }
    const now = new Date().toISOString();
    const telemetryUpdate: Json = {
      broker_account_name: body.accountName,
      mt5_login: body.login ?? null,
      server_name: body.serverName ?? null,
      is_demo: body.isDemo,
      is_cent_account: body.isCentAccount,
      display_currency: body.displayCurrency,
      display_rate: body.displayRate,
      telemetry_received: true,
      balance: body.balance,
      equity: body.equity,
      max_dd_buy: body.maxDdBuy,
      max_dd_sell: body.maxDdSell,
      basket_sl_set: body.basketSlSet,
      basket_sl_type: body.basketSlType,
      daily_target_set: body.dailyTargetSet,
      max_float_buy: body.maxFloatBuy,
      max_float_sell: body.maxFloatSell,
      running_float: body.runningFloat,
      open_positions: body.openPositions ?? 0,
      ea_status: body.eaStatus ?? (body.running ? "ACTIVE" : "MANUAL"),
      running: body.running,
      ea_mode: body.eaMode,
      profit: body.profit,
      floating_profit: body.floatingProfit,
      currency: body.currency,
      latency_ms: body.latencyMs ?? null,
      last_seen_at: now,
      updated_at: now,
    };
    if (syncEaConfig) telemetryUpdate.ea_config = body.eaConfig;
    const { error } = await admin.from("mt5_accounts").update(telemetryUpdate).eq("id", account.id);
    if (error) return respond(500, { error: "Telemetri tidak dapat disimpan." });
    return respond(200, { ok: true, serverTime: now });
  }

  if (path === "/commands/next" && req.method === "GET") {
    const now = new Date();
    const { data: commands, error } = await admin.from("mt5_commands").select("id,owner_id,account_id,action,status,expires_at,payload")
      .eq("account_id", account.id).in("status", ["queued", "delivered"]).gt("expires_at", now.toISOString())
      .order("created_at", { ascending: true }).limit(1);
    if (error) return respond(500, { error: "Antrean tidak dapat dibaca." });
    const command = commands?.[0];
    if (!command) return respond(204);
    if (command.status === "queued") {
      const { data: updated, error: updateError } = await admin.from("mt5_commands").update({ status: "delivered", delivered_at: now.toISOString() })
        .eq("id", command.id).eq("status", "queued").select("id").maybeSingle();
      if (updateError) return respond(500, { error: "Perintah tidak dapat diambil." });
      if (!updated) return respond(204);
      await writeEvent(command, "delivered");
    }
    return respond(200, { commandId: command.id, action: command.action, payload: command.payload ?? null, expiresAt: command.expires_at });
  }

  const ackMatch = path.match(/^\/commands\/([0-9a-f-]{36})\/ack$/i);
  if (ackMatch && req.method === "POST") {
    const body = await jsonBody(req);
    const status = typeof body?.status === "string" ? body.status : "";
    const message = typeof body?.message === "string" ? body.message.slice(0, 500) : null;
    if (!body || !["accepted", "succeeded", "failed"].includes(status)) return respond(400, { error: "Status acknowledgement tidak valid." });
    const { data: command, error } = await admin.from("mt5_commands").select("id,owner_id,account_id,status,expires_at")
      .eq("id", ackMatch[1]).eq("account_id", account.id).maybeSingle();
    if (error || !command) return respond(404, { error: "Perintah tidak ditemukan." });
    if (["succeeded", "failed", "expired"].includes(command.status)) return respond(200, { ok: true, status: command.status });
    if (command.status !== "accepted" && Date.parse(command.expires_at) <= Date.now()) {
      const expiredAt = new Date().toISOString();
      await admin.from("mt5_commands").update({ status: "expired", completed_at: expiredAt, result_message: "Acknowledgement terlambat." }).eq("id", command.id);
      await writeEvent(command, "expired", "Acknowledgement terlambat.");
      return respond(410, { error: "Perintah kedaluwarsa." });
    }
    const allowed = status === "accepted"
      ? ["queued", "delivered"].includes(command.status)
      : ["delivered", "accepted"].includes(command.status);
    if (!allowed && status !== command.status) return respond(409, { error: "Transisi status perintah tidak valid." });
    const now = new Date().toISOString();
    const update: Json = { status, result_message: message };
    if (status === "succeeded" || status === "failed") update.completed_at = now;
    const { error: updateError } = await admin.from("mt5_commands").update(update).eq("id", command.id);
    if (updateError) return respond(500, { error: "Acknowledgement tidak dapat disimpan." });
    await writeEvent(command, status, message);
    return respond(200, { ok: true, status });
  }

  return respond(404, { error: "Rute EA tidak ditemukan." });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const marker = "/functions/v1/mt5-api";
  const index = url.pathname.indexOf(marker);
  const route = url.searchParams.get("route");
  const rawPath = route ?? (index >= 0 ? url.pathname.slice(index + marker.length) || "/" : url.pathname);
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  try {
    if (path.startsWith("/dashboard/")) return await handleDashboard(req, path);
    return await handleEa(req, path);
  } catch (error) {
    console.error("[mt5-api] request failed", error instanceof Error ? error.message : "unknown error");
    return respond(500, { error: "Permintaan gagal diproses." });
  }
});
