CREATE TABLE `mt5_command_events` (
	`id` varchar(32) NOT NULL,
	`commandId` varchar(32) NOT NULL,
	`accountId` varchar(32) NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`status` enum('queued','delivered','accepted','succeeded','failed','expired') NOT NULL,
	`message` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mt5_command_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `mt5_accounts` ADD `telemetryReceived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `mt5_command_events_command_created_idx` ON `mt5_command_events` (`commandId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `mt5_command_events_owner_idx` ON `mt5_command_events` (`ownerOpenId`);