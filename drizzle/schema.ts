import {
  boolean,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
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

/** Account-specific credentials and the latest EA heartbeat/telemetry snapshot. */
export const mt5Accounts = mysqlTable(
  "mt5_accounts",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    mt5Login: varchar("mt5Login", { length: 32 }),
    serverName: varchar("serverName", { length: 96 }),
    currency: varchar("currency", { length: 8 }).default("USD").notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    tokenHint: varchar("tokenHint", { length: 8 }).notNull(),
    telemetryReceived: boolean("telemetryReceived").default(false).notNull(),
    balance: double("balance").default(0).notNull(),
    equity: double("equity").default(0).notNull(),
    maxDdBuyPct: double("maxDdBuyPct").default(0).notNull(),
    maxDdSellPct: double("maxDdSellPct").default(0).notNull(),
    running: boolean("running").default(false).notNull(),
    eaMode: mysqlEnum("eaMode", ["auto", "manual"]).default("manual").notNull(),
    latencyMs: int("latencyMs"),
    lastSeenAt: timestamp("lastSeenAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    unique("mt5_accounts_tokenHash_unique").on(table.tokenHash),
    index("mt5_accounts_owner_idx").on(table.ownerOpenId),
  ],
);

export type Mt5Account = typeof mt5Accounts.$inferSelect;

/** Durable command state for each unique action requested from an EA. */
export const mt5Commands = mysqlTable(
  "mt5_commands",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    accountId: varchar("accountId", { length: 32 }).notNull(),
    ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
    action: mysqlEnum("action", ["auto", "manual", "buy", "sell", "close_buy", "close_sell", "close_all", "reset"]).notNull(),
    status: mysqlEnum("status", ["queued", "delivered", "accepted", "succeeded", "failed", "expired"]).default("queued").notNull(),
    resultMessage: varchar("resultMessage", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    deliveredAt: timestamp("deliveredAt"),
    completedAt: timestamp("completedAt"),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  table => [
    index("mt5_commands_account_created_idx").on(table.accountId, table.createdAt),
    index("mt5_commands_account_status_idx").on(table.accountId, table.status),
    index("mt5_commands_owner_idx").on(table.ownerOpenId),
  ],
);

export type Mt5Command = typeof mt5Commands.$inferSelect;

/** Append-only audit trail of meaningful command lifecycle transitions. */
export const mt5CommandEvents = mysqlTable(
  "mt5_command_events",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    commandId: varchar("commandId", { length: 32 }).notNull(),
    accountId: varchar("accountId", { length: 32 }).notNull(),
    ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["queued", "delivered", "accepted", "succeeded", "failed", "expired"]).notNull(),
    message: varchar("message", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("mt5_command_events_command_created_idx").on(table.commandId, table.createdAt),
    index("mt5_command_events_owner_idx").on(table.ownerOpenId),
  ],
);

export type Mt5CommandEvent = typeof mt5CommandEvents.$inferSelect;
