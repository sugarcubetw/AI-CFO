CREATE TABLE `automation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`schedule_type` text DEFAULT 'interval' NOT NULL,
	`interval_minutes` integer,
	`time_of_day` text,
	`timezone` text DEFAULT 'Asia/Taipei' NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`last_status` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_automation_jobs_enabled_type` ON `automation_jobs` (`is_enabled`,`schedule_type`);