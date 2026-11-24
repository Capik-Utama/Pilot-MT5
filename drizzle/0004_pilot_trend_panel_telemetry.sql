ALTER TABLE `mt5_accounts` ADD `ea_panel` varchar(32) DEFAULT 'grid-by-capik' NOT NULL;--> statement-breakpoint
ALTER TABLE `mt5_accounts` ADD `minimum_balance_set` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mt5_accounts` ADD `basket_tp_set` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mt5_accounts` ADD `pending_orders` int DEFAULT 0 NOT NULL;--> statement-breakpoint
