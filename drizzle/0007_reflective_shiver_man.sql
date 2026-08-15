CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_date` text NOT NULL,
	`amount` integer NOT NULL,
	`category` text NOT NULL,
	`sub_category` text,
	`vendor` text,
	`payment_method` text DEFAULT 'other' NOT NULL,
	`receipt_url` text,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_expenses_date` ON `expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `idx_expenses_category` ON `expenses` (`category`);