CREATE TABLE `financial_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_date` text NOT NULL,
	`direction` text DEFAULT 'expense' NOT NULL,
	`category` text NOT NULL,
	`item` text NOT NULL,
	`amount` integer NOT NULL,
	`payment_method` text,
	`vendor` text,
	`note` text,
	`receipt_file_name` text,
	`source` text DEFAULT 'mobile' NOT NULL,
	`sync_client_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_transactions_sync_client_id_unique` ON `financial_transactions` (`sync_client_id`);--> statement-breakpoint
CREATE INDEX `idx_financial_transactions_date` ON `financial_transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `idx_financial_transactions_category` ON `financial_transactions` (`category`);