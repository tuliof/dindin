CREATE TABLE `plaid_sync_run` (
	`action` text NOT NULL,
	`added_count` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`error_code` text,
	`error_message` text,
	`id` text PRIMARY KEY NOT NULL,
	`modified_count` integer DEFAULT 0 NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`plaid_item_id` text NOT NULL,
	`removed_count` integer DEFAULT 0 NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`status` text NOT NULL,
	`trigger` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plaid_item_id`) REFERENCES `plaid_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plaid_sync_run_item_id_idx` ON `plaid_sync_run` (`plaid_item_id`);--> statement-breakpoint
CREATE INDEX `plaid_sync_run_started_at_idx` ON `plaid_sync_run` (`started_at`);