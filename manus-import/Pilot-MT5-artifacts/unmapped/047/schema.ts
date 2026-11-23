import {
  boolean,
  double,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Manus OAuth identities. The OAuth starter keeps its core users table. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const mt5Accounts = mysqlTable(
  "mt5_accounts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerOpenId: varchar("owner_open_id", { length: 64 }).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    tokenHint: varchar("token_hint", { length: 8 }).notNull(),
    brokerAccountName: varchar("broker_account_name", { length: 120 }),
    mt5Login: double("mt5_login"),
    serverName: varchar("server_name", { length: 120 }),
    currency: varchar("currency", { length: 8 }).default("USD").notNull(),
    isCentAccount: boolean("is_cent_account").default(false).notNull(),
    displayCurrency: mysqlEnum("display_currency", ["USD", "CENT", "IDR"])
      .default("USD")
      .notNull(),
    displayRate: double("display_rate").default(18000).notNull(),
    telemetryReceived: boolean("telemetry_received").default(false).notNull(),
    balance: double("balance").default(0).notNull(),
    equity: double("equity").default(0).notNull(),
    maxDdBuy: double("max_dd_buy").default(0).notNull(),
    maxDdSell: double("max_dd_sell").default(0).notNull(),
    basketSlSet: double("basket_sl_set").default(0).notNull(),
    basketSlType: mysqlEnum("basket_sl_type", ["money", "percent"])
      .default("money")
      .notNull(),
    dailyTargetSet: double("daily_target_set").default(0).notNull(),
    maxFloatBuy: double("max_float_buy").default(0).notNull(),
    maxFloatSell: double("max_float_sell").default(0).notNull(),
    runningFloat: double("running_float").default(0).notNull(),
    openPositions: int("open_positions").default(0).notNull(),
    eaStatus: varchar("ea_status", { length: 80 })
      .default("MENUNGGU EA")
      .notNull(),
    running: boolean("running").default(false).notNull(),
    eaMode: mysqlEnum("ea_mode", ["auto", "manual"])
      .default("manual")
      .notNull(),
    profit: double("profit").default(0).notNull(),
    floatingProfit: double("floating_profit").default(0).notNull(),
    latencyMs: int("latency_ms"),
    lastSeenAt: timestamp("last_seen_at"),
    pollIntervalMs: int("poll_interval_ms").default(1000).notNull(),
    telemetryIntervalMs: int("telemetry_interval_ms").default(500).notNull(),
    intervalsConfigured: boolean("intervals_configured").default(true).notNull(),
    eaConfig: json("ea_config").$type<Record<string, number> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    tokenHashUnique: uniqueIndex("mt5_accounts_token_hash_uq").on(
      table.tokenHash
    ),
    ownerCreated: index("mt5_accounts_owner_created_idx").on(
      table.ownerOpenId,
      table.createdAt
    ),
  })
);

export const mt5Commands = mysqlTable(
  "mt5_commands",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerOpenId: varchar("owner_open_id", { length: 64 }).notNull(),
    accountId: varchar("account_id", { length: 36 }).notNull(),
    requestedByOpenId: varchar("requested_by_open_id", { length: 64 }),
    action: varchar("action", { length: 24 }).notNull(),
    payload: json("payload").$type<Record<string, unknown> | null>(),
    status: mysqlEnum("status", [
      "queued",
      "delivered",
      "accepted",
      "succeeded",
      "failed",
      "expired",
    ])
      .default("queued")
      .notNull(),
    resultMessage: varchar("result_message", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at"),
    completedAt: timestamp("completed_at"),
    expiresAt: timestamp("expires_at").notNull(),
  },
  table => ({
    ownerCreated: index("mt5_commands_owner_created_idx").on(
      table.ownerOpenId,
      table.createdAt
    ),
    accountStatus: index("mt5_commands_account_status_idx").on(
      table.accountId,
      table.status,
      table.createdAt
    ),
  })
);

export const mt5CommandEvents = mysqlTable(
  "mt5_command_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    commandId: varchar("command_id", { length: 36 }).notNull(),
    ownerOpenId: varchar("owner_open_id", { length: 64 }).notNull(),
    accountId: varchar("account_id", { length: 36 }).notNull(),
    requestedByOpenId: varchar("requested_by_open_id", { length: 64 }),
    status: varchar("status", { length: 24 }).notNull(),
    message: varchar("message", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => ({
    ownerCreated: index("mt5_command_events_owner_created_idx").on(
      table.ownerOpenId,
      table.createdAt
    ),
    commandCreated: index("mt5_command_events_command_created_idx").on(
      table.commandId,
      table.createdAt
    ),
  })
);

export const pilotUserAccess = mysqlTable(
  "pilot_user_access",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerOpenId: varchar("owner_open_id", { length: 64 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    openId: varchar("open_id", { length: 64 }),
    accessRole: mysqlEnum("access_role", [
      "owner",
      "read_only",
      "staff",
    ]).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    failedPasswordAttempts: int("failed_password_attempts").default(0).notNull(),
    passwordLockedUntil: timestamp("password_locked_until"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => ({
    ownerEmailUnique: uniqueIndex("pilot_user_access_owner_email_uq").on(
      table.ownerOpenId,
      table.email
    ),
    ownerOpenIdUnique: uniqueIndex("pilot_user_access_owner_open_id_uq").on(
      table.ownerOpenId,
      table.openId
    ),
    emailLookup: index("pilot_user_access_email_idx").on(table.email),
  })
);

export const pilotUserAccountAccess = mysqlTable(
  "pilot_user_account_access",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerOpenId: varchar("owner_open_id", { length: 64 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    accountId: varchar("account_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => ({
    ownerEmailAccountUnique: uniqueIndex("pilot_user_account_access_uq").on(
      table.ownerOpenId,
      table.email,
      table.accountId
    ),
    accountLookup: index("pilot_user_account_access_account_idx").on(
      table.accountId
    ),
  })
);
