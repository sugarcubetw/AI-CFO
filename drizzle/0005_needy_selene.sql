ALTER TABLE `reservations` ADD `read_at` text;--> statement-breakpoint
CREATE INDEX `idx_reservations_created_read` ON `reservations` (`created_at`,`read_at`);