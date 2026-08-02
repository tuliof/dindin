CREATE TABLE `plaid_account` (
	`account_id` text NOT NULL,
	`balances` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`mask` text,
	`name` text NOT NULL,
	`official_name` text,
	`plaid_item_id` text NOT NULL,
	`subtype` text,
	`type` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plaid_item_id`) REFERENCES `plaid_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plaid_account_item_id_idx` ON `plaid_account` (`plaid_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plaid_account_item_account_id_unique` ON `plaid_account` (`plaid_item_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `plaid_item` (
	`access_token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`cursor` text,
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text,
	`item_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plaid_item_user_id_idx` ON `plaid_item` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plaid_item_item_id_unique` ON `plaid_item` (`item_id`);