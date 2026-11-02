CREATE TABLE `mt5_accounts` (
	`id` varchar(32) NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`label` varchar(80) NOT NULL,
	`mt5Login` varchar(32),
	`serverName` varchar(96),
	`currency` varchar(8) NOT NULL DEFAULT 'USD',
	`tokenHash` varchar(64) NOT NULL,
	`tokenHint` varchar(8) NOT NULL,
	`balance` double NOT NULL DEFAULT 0,
	`equity` double NOT NULL DEFAULT 0,
	`maxDdBuyPct` double NOT NULL DEFAULT 0,
	`maxDdSellPct` double NOT NULL DEFAULT 0,
	`running` boolean NOT NULL DEFAULT false,
	`eaMode` enum('auto','manual') NOT NULL DEFAULT 'manual',
	`latencyMs` int,
	`lastSeenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mt5_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `mt5_accounts_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `mt5_commands` (
	`id` varchar(32) NOT NULL,
	`accountId` varchar(32) NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`action` enum('auto','manual','close_buy','close_sell','close_all') NOT NULL,
	`status` enum('queued','delivered','accepted','succeeded','failed','expired') NOT NULL DEFAULT 'queued',
	`resultMessage` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`deliveredAt` timestamp,
	`completedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `mt5_commands_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `mt5_accounts_owner_idx` ON `mt5_accounts` (`ownerOpenId`);--> statement-breakpoint
CREATE INDEX `mt5_commands_account_created_idx` ON `mt5_commands` (`accountId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `mt5_commands_account_status_idx` ON `mt5_commands` (`accountId`,`status`);--> statement-breakpoint
CREATE INDEX `mt5_commands_owner_idx` ON `mt5_commands` (`ownerOpenId`);