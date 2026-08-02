CREATE TABLE `plaid_transaction` (
	`account_id` text NOT NULL,
	`amount` real NOT NULL,
	`authorized_date` text,
	`category` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`date` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`iso_currency_code` text,
	`merchant_name` text,
	`name` text NOT NULL,
	`pending` integer NOT NULL,
	`plaid_item_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plaid_item_id`) REFERENCES `plaid_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plaid_transaction_item_id_idx` ON `plaid_transaction` (`plaid_item_id`);--> statement-breakpoint
CREATE INDEX `plaid_transaction_account_id_idx` ON `plaid_transaction` (`account_id`);--> statement-breakpoint
CREATE INDEX `plaid_transaction_date_idx` ON `plaid_transaction` (`date`);--> statement-breakpoint
ALTER TABLE `plaid_item` ADD `last_sync_completed_at` integer;--> statement-breakpoint
ALTER TABLE `plaid_item` ADD `last_sync_error` text;--> statement-breakpoint
ALTER TABLE `plaid_item` ADD `sync_status` text DEFAULT 'pending' NOT NULL;