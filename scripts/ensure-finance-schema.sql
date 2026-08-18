-- Safe, idempotent repair for an existing D1 database whose legacy
-- migration history is incomplete. This only creates the Finance expenses
-- table and indexes when they are missing; it does not alter existing data.
CREATE TABLE IF NOT EXISTS `expenses` (
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
CREATE INDEX IF NOT EXISTS `idx_expenses_date` ON `expenses` (`expense_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_expenses_category` ON `expenses` (`category`);
