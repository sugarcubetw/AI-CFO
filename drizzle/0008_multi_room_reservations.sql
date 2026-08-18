CREATE TABLE IF NOT EXISTS `reservation_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`room_number` text NOT NULL,
	`room_type_id` text,
	`allocated_amount` integer DEFAULT 0 NOT NULL,
	`allocation_method` text DEFAULT 'equal' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_number`) REFERENCES `rooms`(`number`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_reservation_rooms_reservation_room` ON `reservation_rooms` (`reservation_id`,`room_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reservation_rooms_room` ON `reservation_rooms` (`room_number`);
