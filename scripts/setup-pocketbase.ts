import "dotenv/config";
import PocketBase, { type RecordModel } from "pocketbase";

const url = process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL;
const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD;
const ownerUsername = process.env.POCKETBASE_OWNER_USERNAME?.trim().toLowerCase();
const ownerPassword = process.env.POCKETBASE_OWNER_PASSWORD;

if (!superuserEmail || !superuserPassword || !ownerUsername || !ownerPassword) {
  throw new Error("Set POCKETBASE_SUPERUSER_EMAIL, POCKETBASE_SUPERUSER_PASSWORD, POCKETBASE_OWNER_USERNAME, and POCKETBASE_OWNER_PASSWORD.");
}
if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(ownerUsername) || ownerPassword.length < 8 || ownerPassword.length > 128) {
  throw new Error("Owner username must be 3-40 valid characters and password must be 8-128 characters.");
}

const pb = new PocketBase(url);
pb.autoCancellation(false);
await pb.collection("_superusers").authWithPassword(superuserEmail, superuserPassword);

type Field = Record<string, unknown>;
const text = (name: string, required = false, max = 255): Field => ({ name, type: "text", required, options: { min: 0, max, pattern: "" } });
const number = (name: string, _required = false): Field => ({ name, type: "number", required: false, options: { min: null, max: null } });
const date = (name: string, required = false): Field => ({ name, type: "date", required, options: { min: "", max: "" } });
const autoDate = (name: string, onUpdate: boolean): Field => ({ name, type: "autodate", onCreate: true, onUpdate, hidden: false, presentable: false, system: false });
const boolean = (name: string): Field => ({ name, type: "bool", required: false, options: {} });
const json = (name: string, required = false): Field => ({ name, type: "json", required, options: { maxSize: 200_000 } });
const select = (name: string, _values: string[], required = true): Field => text(name, required, 32);

const collections = [
  {
    name: "users",
    type: "auth",
    fields: [text("username", true, 40), select("role", ["owner", "read_only", "staff"]), text("owner_id", true, 30), json("account_ids")],
    indexes: ["CREATE UNIQUE INDEX idx_users_username ON users (username)"],
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, manageRule: null, authRule: "",
    passwordAuth: { enabled: true, identityFields: ["email"] },
  },
  {
    name: "mt5_accounts",
    type: "base",
    fields: [
      text("owner_id", true, 30), text("label", true, 80), text("broker_account_name", false, 120),
      number("mt5_login"), text("server_name", false, 120), text("currency", true, 8),
      text("token_hash", true, 64), text("token_hint", true, 8), boolean("telemetry_received"),
      number("balance", true), number("equity", true), number("max_dd_buy", true), number("max_dd_sell", true),
      number("basket_sl_set", true), select("basket_sl_type", ["money", "percent"]), number("daily_target_set", true),
      number("max_float_buy", true), number("max_float_sell", true), number("running_float", true), number("open_positions", true),
      text("ea_status", true, 80), boolean("is_cent_account"), select("display_currency", ["USD", "CENT", "IDR"]),
      number("display_rate", true), boolean("running"), select("ea_mode", ["auto", "manual"]),
      number("profit", true), number("floating_profit", true), number("latency_ms"), date("last_seen_at"),
      number("poll_interval_ms", true), json("ea_config"), autoDate("created", false), autoDate("updated", true),
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_mt5_accounts_token_hash ON mt5_accounts (token_hash)",
      "CREATE INDEX idx_mt5_accounts_owner ON mt5_accounts (owner_id)",
    ],
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  },
  {
    name: "mt5_commands",
    type: "base",
    fields: [
      text("account_id", true, 30), text("owner_id", true, 30), text("requested_by_user_id", false, 30),
      select("action", ["auto", "manual", "buy", "sell", "close_buy", "close_sell", "close_all", "reset", "config"]),
      select("status", ["queued", "delivered", "accepted", "succeeded", "failed", "expired"]),
      text("result_message", false, 500), json("payload"), date("delivered_at"), date("completed_at"), date("expires_at", true),
      autoDate("created", false), autoDate("updated", true),
    ],
    indexes: [
      "CREATE INDEX idx_mt5_commands_account_created ON mt5_commands (account_id, created)",
      "CREATE INDEX idx_mt5_commands_account_status ON mt5_commands (account_id, status)",
      "CREATE INDEX idx_mt5_commands_owner ON mt5_commands (owner_id)",
    ],
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  },
  {
    name: "mt5_command_events",
    type: "base",
    fields: [
      text("command_id", true, 30), text("account_id", true, 30), text("owner_id", true, 30),
      text("requested_by_user_id", false, 30), select("status", ["queued", "delivered", "accepted", "succeeded", "failed", "expired"]),
      text("message", false, 500), autoDate("created", false), autoDate("updated", true),
    ],
    indexes: [
      "CREATE INDEX idx_mt5_events_command_created ON mt5_command_events (command_id, created)",
      "CREATE INDEX idx_mt5_events_owner ON mt5_command_events (owner_id)",
    ],
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  },
];

for (const collection of collections) {
  let existing: Awaited<ReturnType<typeof pb.collections.getOne>> | null = null;
  try {
    existing = await pb.collections.getOne(collection.name);
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
  }
  if (!existing) {
    await pb.collections.create(collection as never);
    console.log(`Created collection ${collection.name}.`);
    continue;
  }
  if (existing.type !== collection.type) {
    throw new Error(`Collection ${collection.name} must have type ${collection.type}, found ${existing.type}.`);
  }
  const existingFields = existing.fields as Field[];
  const fieldsByName = new Map(existingFields.map((field) => [field.name, field]));
  const missingFields = collection.fields.filter((field) => !fieldsByName.has(String(field.name)));
  let requiredChanged = false;
  const updatedFields = existingFields.map((current) => {
    const expected = collection.fields.find((field) => field.name === current.name);
    if (!expected || current.required === expected.required) return current;
    requiredChanged = true;
    return { ...current, required: expected.required };
  });
  for (const field of collection.fields) {
    const current = fieldsByName.get(String(field.name));
    if (current && current.type !== field.type) {
      throw new Error(`Collection ${collection.name} field ${String(field.name)} must have type ${String(field.type)}.`);
    }
  }
  const indexes = [...new Set([...(existing.indexes ?? []), ...collection.indexes])];
  const rules = {
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    ...(collection.type === "auth" ? {
      manageRule: null,
      authRule: "",
      passwordAuth: { ...existing.passwordAuth, enabled: true, identityFields: ["email"] },
    } : {}),
  };
  const rulesNeedUpdate = existing.listRule !== null || existing.viewRule !== null || existing.createRule !== null ||
    existing.updateRule !== null || existing.deleteRule !== null ||
    (collection.type === "auth" && (existing.authRule !== "" || existing.manageRule !== null || !existing.passwordAuth?.enabled));
  if (missingFields.length || requiredChanged || indexes.length !== (existing.indexes ?? []).length || rulesNeedUpdate) {
    await pb.collections.update(existing.id, {
      fields: [...updatedFields, ...missingFields],
      indexes,
      ...rules,
    } as never);
    console.log(`Updated collection ${collection.name} with required fields, indexes, and access rules.`);
  } else {
    console.log(`Collection ${collection.name} schema is ready.`);
  }
}

const ownerEmail = `${ownerUsername}@pilot-mt5.local`;
let owner: RecordModel | null = null;
try {
  owner = await pb.collection("users").getFirstListItem(`username = "${ownerUsername}"`);
} catch { }

if (owner) {
  if (owner.role !== "owner") throw new Error(`The existing ${ownerUsername} account is not an owner.`);
  if (owner.owner_id !== owner.id) await pb.collection("users").update(owner.id, { owner_id: owner.id });
  console.log(`Owner ${owner.username} already exists.`);
} else {
  const created = await pb.collection("users").create({
    email: ownerEmail,
    emailVisibility: false,
    verified: true,
    password: ownerPassword,
    passwordConfirm: ownerPassword,
    username: ownerUsername,
    role: "owner",
    owner_id: "bootstrap",
    account_ids: [],
  });
  await pb.collection("users").update(created.id, { owner_id: created.id });
  console.log(`Created owner ${ownerUsername}.`);
}
