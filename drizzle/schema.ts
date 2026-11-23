import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export type AccessRole = "owner" | "read_only" | "staff";
export type DisplayCurrency = "USD" | "CENT" | "IDR";
export type BasketSlType = "money" | "percent";
export type EaMode = "auto" | "manual";
export type CommandStatus =
  | "queued"
  | "delivered"
  | "accepted"
  | "succeeded"
  | "failed"
  | "expired";

// Supabase Auth owns identity UUIDs; this is FK metadata for the external table.
const authUsers = pgSchema("auth").table("users", {
  id: uuid("id").primaryKey(),
});

/** Application profile only. Password credentials remain in Supabase Auth. */
export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name"),
    email: varchar("email", { length: 320 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSignedIn: timestamp("last_signed_in", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex("users_email_lower_uq").on(sql`lower(${table.email})`),
  ]
);
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const mt5Accounts = pgTable(
  "mt5_accounts",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    label: varchar("label", { length: 80 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    tokenHint: varchar("token_hint", { length: 8 }).notNull(),
    brokerAccountName: varchar("broker_account_name", { length: 120 }),
    mt5Login: doublePrecision("mt5_login"),
    serverName: varchar("server_name", { length: 120 }),
    currency: varchar("currency", { length: 8 }).default("USD").notNull(),
    isCentAccount: boolean("is_cent_account").default(false).notNull(),
    displayCurrency: varchar("display_currency", { length: 8 })
      .$type<DisplayCurrency>()
      .default("USD")
      .notNull(),
    displayRate: doublePrecision("display_rate").default(18000).notNull(),
    telemetryReceived: boolean("telemetry_received").default(false).notNull(),
    balance: doublePrecision("balance").default(0).notNull(),
    equity: doublePrecision("equity").default(0).notNull(),
    maxDdBuy: doublePrecision("max_dd_buy").default(0).notNull(),
    maxDdSell: doublePrecision("max_dd_sell").default(0).notNull(),
    basketSlSet: doublePrecision("basket_sl_set").default(0).notNull(),
    basketSlType: varchar("basket_sl_type", { length: 16 })
      .$type<BasketSlType>()
      .default("money")
      .notNull(),
    dailyTargetSet: doublePrecision("daily_target_set").default(0).notNull(),
    maxFloatBuy: doublePrecision("max_float_buy").default(0).notNull(),
    maxFloatSell: doublePrecision("max_float_sell").default(0).notNull(),
    runningFloat: doublePrecision("running_float").default(0).notNull(),
    openPositions: integer("open_positions").default(0).notNull(),
    eaStatus: varchar("ea_status", { length: 80 })
      .default("MENUNGGU EA")
      .notNull(),
    running: boolean("running").default(false).notNull(),
    eaMode: varchar("ea_mode", { length: 16 })
      .$type<EaMode>()
      .default("manual")
      .notNull(),
    profit: doublePrecision("profit").default(0).notNull(),
    floatingProfit: doublePrecision("floating_profit").default(0).notNull(),
    latencyMs: integer("latency_ms"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    pollIntervalMs: integer("poll_interval_ms").default(1000).notNull(),
    telemetryIntervalMs: integer("telemetry_interval_ms").default(500).notNull(),
    intervalsConfigured: boolean("intervals_configured").default(false).notNull(),
    eaConfig: jsonb("ea_config").$type<Record<string, number> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex("mt5_accounts_token_hash_uq").on(table.tokenHash),
    uniqueIndex("mt5_accounts_id_owner_uq").on(table.id, table.ownerId),
    index("mt5_accounts_owner_created_idx").on(table.ownerId, table.createdAt),
    check(
      "mt5_accounts_open_positions_ck",
      sql`${table.openPositions} >= 0`
    ),
    check(
      "mt5_accounts_latency_ms_ck",
      sql`${table.latencyMs} is null or ${table.latencyMs} >= 0`
    ),
    check(
      "mt5_accounts_display_currency_ck",
      sql`${table.displayCurrency} in ('USD', 'CENT', 'IDR')`
    ),
    check(
      "mt5_accounts_basket_sl_type_ck",
      sql`${table.basketSlType} in ('money', 'percent')`
    ),
    check(
      "mt5_accounts_ea_mode_ck",
      sql`${table.eaMode} in ('auto', 'manual')`
    ),
    check(
      "mt5_accounts_intervals_ck",
      sql`${table.telemetryIntervalMs} in (500, 1000, 2000) and ${table.pollIntervalMs} in (500, 1000, 2000)`
    ),
  ]
);

export const mt5Commands = pgTable(
  "mt5_commands",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    accountId: uuid("account_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 24 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    status: varchar("status", { length: 24 })
      .$type<CommandStatus>()
      .default("queued")
      .notNull(),
    resultMessage: varchar("result_message", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  table => [
    foreignKey({
      columns: [table.accountId, table.ownerId],
      foreignColumns: [mt5Accounts.id, mt5Accounts.ownerId],
      name: "mt5_commands_account_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("mt5_commands_id_scope_uq").on(
      table.id,
      table.ownerId,
      table.accountId
    ),
    index("mt5_commands_owner_created_idx").on(table.ownerId, table.createdAt),
    index("mt5_commands_account_status_idx").on(
      table.accountId,
      table.status,
      table.createdAt
    ),
    check(
      "mt5_commands_status_ck",
      sql`${table.status} in ('queued', 'delivered', 'accepted', 'succeeded', 'failed', 'expired')`
    ),
  ]
);

export const mt5CommandEvents = pgTable(
  "mt5_command_events",
  {
    id: uuid("id").primaryKey(),
    commandId: uuid("command_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    accountId: uuid("account_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 24 }).notNull(),
    message: varchar("message", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    foreignKey({
      columns: [table.commandId, table.ownerId, table.accountId],
      foreignColumns: [mt5Commands.id, mt5Commands.ownerId, mt5Commands.accountId],
      name: "mt5_command_events_command_scope_fk",
    }).onDelete("cascade"),
    index("mt5_command_events_owner_created_idx").on(
      table.ownerId,
      table.createdAt
    ),
    index("mt5_command_events_command_created_idx").on(
      table.commandId,
      table.createdAt
    ),
  ]
);

export const pilotUserAccess = pgTable(
  "pilot_user_access",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    accessRole: varchar("access_role", { length: 16 })
      .$type<AccessRole>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex("pilot_user_access_user_uq").on(table.userId),
    uniqueIndex("pilot_user_access_owner_user_uq").on(
      table.ownerId,
      table.userId
    ),
    index("pilot_user_access_email_idx").on(sql`lower(${table.email})`),
    check(
      "pilot_user_access_role_ck",
      sql`${table.accessRole} in ('owner', 'read_only', 'staff')`
    ),
    check(
      "pilot_user_access_owner_identity_ck",
      sql`${table.accessRole} <> 'owner' or ${table.ownerId} = ${table.userId}`
    ),
  ]
);

export const pilotUserAccountAccess = pgTable(
  "pilot_user_account_access",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    foreignKey({
      columns: [table.accountId, table.ownerId],
      foreignColumns: [mt5Accounts.id, mt5Accounts.ownerId],
      name: "pilot_user_account_access_account_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("pilot_user_account_access_uq").on(
      table.ownerId,
      table.userId,
      table.accountId
    ),
    index("pilot_user_account_access_account_idx").on(table.accountId),
  ]
);
