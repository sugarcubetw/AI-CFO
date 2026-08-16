CREATE TABLE `order_reconciliation_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`order_id` text NOT NULL,
	`action` text NOT NULL,
	`difference_json` text,
	`source_row_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `order_reconciliation_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_reconciliation_items_run` ON `order_reconciliation_items` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_reconciliation_items_order` ON `order_reconciliation_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_reconciliation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_system` text DEFAULT 'owlnest_export' NOT NULL,
	`period_from` text NOT NULL,
	`period_to` text NOT NULL,
	`source_exported_at` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`received_count` integer DEFAULT 0 NOT NULL,
	`matched_count` integer DEFAULT 0 NOT NULL,
	`inserted_count` integer DEFAULT 0 NOT NULL,
	`changed_count` integer DEFAULT 0 NOT NULL,
	`missing_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`payload_hash` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`created_by` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `idx_reconciliation_runs_period` ON `order_reconciliation_runs` (`period_from`,`period_to`);--> statement-breakpoint
CREATE INDEX `idx_reconciliation_runs_started` ON `order_reconciliation_runs` (`started_at`);