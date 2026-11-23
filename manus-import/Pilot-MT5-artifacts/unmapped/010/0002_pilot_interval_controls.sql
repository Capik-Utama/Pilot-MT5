ALTER TABLE `mt5_accounts` ADD `telemetry_interval_ms` int DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE `mt5_accounts` ADD `intervals_configured` boolean DEFAULT true NOT NULL;