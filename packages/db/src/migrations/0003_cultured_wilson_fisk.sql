ALTER TABLE `plaid_item` ADD `transaction_last_failed_at` text;--> statement-breakpoint
ALTER TABLE `plaid_item` ADD `transaction_last_successful_at` text;--> statement-breakpoint
ALTER TABLE `plaid_item` ADD `webhook_code` text;--> statement-breakpoint
ALTER TABLE `plaid_item` ADD `webhook_sent_at` text;--> statement-breakpoint
ALTER TABLE `plaid_item` ADD `webhook_url` text;