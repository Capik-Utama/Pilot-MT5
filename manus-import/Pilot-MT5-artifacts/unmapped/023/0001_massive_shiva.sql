CREATE TABLE `mt5_accounts` (
	`id` varchar(36) NOT NULL,
	`owner_open_id` varchar(64) NOT NULL,
	`label` varchar(80) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`token_hint` varchar(8) NOT NULL,
	`broker_account_name` varchar(120),
	`mt5_login` double,
	`server_name` varchar(120),
	`currency` varchar(8) NOT NULL DEFAULT 'USD',
	`is_cent_account` boolean NOT NULL DEFAULT false,
	`display_currency` enum('USD','CENT','IDR') NOT NULL DEFAULT 'USD',
	`display_rate` double NOT NULL DEFAULT 18000,
	`telemetry_received` boolean NOT NULL DEFAULT false,
	`balance` double NOT NULL DEFAULT 0,
	`equity` double NOT NULL DEFAULT 0,
	`max_dd_buy` double NOT NULL DEFAULT 0,
	`max_dd_sell` double NOT NULL DEFAULT 0,
	`basket_sl_set` double NOT NULL DEFAULT 0,
	`basket_sl_type` enum('money','percent') NOT NULL DEFAULT 'money',
	`daily_target_set` double NOT NULL DEFAULT 0,
	`max_float_buy` double NOT NULL DEFAULT 0,
	`max_float_sell` double NOT NULL DEFAULT 0,
	`running_float` double NOT NULL DEFAULT 0,
	`open_positions` int NOT NULL DEFAULT 0,
	`ea_status` varchar(80) NOT NULL DEFAULT 'MENUNGGU EA',
	`running` boolean NOT NULL DEFAULT false,
	`ea_mode` enum('auto','manual') NOT NULL DEFAULT 'manual',
	`profit` double NOT NULL DEFAULT 0,
	`floating_profit` double NOT NULL DEFAULT 0,
	`latency_ms` int,
	`last_seen_at` timestamp,
	`poll_interval_ms` int NOT NULL DEFAULT 1000,
	`ea_config` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mt5_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `mt5_accounts_token_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `mt5_command_events` (
	`id` varchar(36) NOT NULL,
	`command_id` varchar(36) NOT NULL,
	`owner_open_id` varchar(64) NOT NULL,
	`account_id` varchar(36) NOT NULL,
	`requested_by_open_id` varchar(64),
	`status` varchar(24) NOT NULL,
	`message` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mt5_command_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mt5_commands` (
	`id` varchar(36) NOT NULL,
	`owner_open_id` varchar(64) NOT NULL,
	`account_id` varchar(36) NOT NULL,
	`requested_by_open_id` varchar(64),
	`action` varchar(24) NOT NULL,
	`payload` json,
	`status` enum('queued','delivered','accepted','succeeded','failed','expired') NOT NULL DEFAULT 'queued',
	`result_message` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`delivered_at` timestamp,
	`completed_at` timestamp,
	`expires_at` timestamp NOT NULL,
	CONSTRAINT `mt5_commands_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pilot_user_access` (
	`id` varchar(36) NOT NULL,
	`owner_open_id` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`open_id` varchar(64),
	`access_role` enum('owner','read_only','staff') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pilot_user_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `pilot_user_access_owner_email_uq` UNIQUE(`owner_open_id`,`email`),
	CONSTRAINT `pilot_user_access_owner_open_id_uq` UNIQUE(`owner_open_id`,`open_id`)
);
--> statement-breakpoint
CREATE TABLE `pilot_user_account_access` (
	`id` varchar(36) NOT NULL,
	`owner_open_id` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`account_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pilot_user_account_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `pilot_user_account_access_uq` UNIQUE(`owner_open_id`,`email`,`account_id`)
);
--> statement-breakpoint
CREATE INDEX `mt5_accounts_owner_created_idx` ON `mt5_accounts` (`owner_open_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mt5_command_events_owner_created_idx` ON `mt5_command_events` (`owner_open_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mt5_command_events_command_created_idx` ON `mt5_command_events` (`command_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mt5_commands_owner_created_idx` ON `mt5_commands` (`owner_open_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mt5_commands_account_status_idx` ON `mt5_commands` (`account_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `pilot_user_access_email_idx` ON `pilot_user_access` (`email`);--> statement-breakpoint
CREATE INDEX `pilot_user_account_access_account_idx` ON `pilot_user_account_access` (`account_id`);