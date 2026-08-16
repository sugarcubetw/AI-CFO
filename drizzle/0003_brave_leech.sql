CREATE TABLE `setting_options` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`scope` text DEFAULT '*' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_setting_options_category_label_scope` ON `setting_options` (`category`,`label`,`scope`);--> statement-breakpoint
CREATE INDEX `idx_setting_options_category_active_sort` ON `setting_options` (`category`,`is_active`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_occurred_at` ON `audit_log` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_object` ON `audit_log` (`object_type`,`object_id`);