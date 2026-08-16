CREATE TABLE `meal_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_meal_versions_meal_version` ON `meal_versions` (`meal_id`,`version`);--> statement-breakpoint
CREATE TABLE `prep_report_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` text NOT NULL,
	`meal_date` text NOT NULL,
	`demand_state` text NOT NULL,
	`meal_id` text,
	`meal_name` text,
	`guest_count` integer NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `prep_reports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_prep_report_lines_report` ON `prep_report_lines` (`report_id`);--> statement-breakpoint
CREATE TABLE `prep_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`period_from` text NOT NULL,
	`period_to` text NOT NULL,
	`report_type` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`based_on_report_id` text,
	`generated_by` text NOT NULL,
	`generated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_prep_reports_period_revision` ON `prep_reports` (`period_from`,`period_to`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_prep_reports_period` ON `prep_reports` (`period_from`,`period_to`);--> statement-breakpoint
ALTER TABLE `meals` ADD `description` text;--> statement-breakpoint
ALTER TABLE `meals` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meals` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;