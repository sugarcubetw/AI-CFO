CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`object_type` text NOT NULL,
	`object_id` text NOT NULL,
	`detail_redacted` text,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_prep_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` text NOT NULL,
	`item_name` text NOT NULL,
	`quantity_per_serving` integer NOT NULL,
	`unit` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meal_requirements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reservation_id` text NOT NULL,
	`meal_date` text NOT NULL,
	`meal_time` text NOT NULL,
	`guest_count` integer NOT NULL,
	`meal_id` text,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`notes` text,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_meal_requirement_reservation_date` ON `meal_requirements` (`reservation_id`,`meal_date`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meals_name_unique` ON `meals` (`name`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reservation_id` text NOT NULL,
	`stage` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text,
	`status` text NOT NULL,
	`confirmed_by` text,
	`confirmed_at` text,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reception_checklists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reservation_id` text NOT NULL,
	`actual_guests` integer NOT NULL,
	`identity_hash` text,
	`identity_last4` text,
	`identity_verified` integer DEFAULT false NOT NULL,
	`breakfast_time` text NOT NULL,
	`breakfast_count` integer NOT NULL,
	`meal_id` text,
	`notes` text,
	`completed_by` text NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reception_checklists_reservation_id_unique` ON `reception_checklists` (`reservation_id`);--> statement-breakpoint
CREATE TABLE `reservation_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reservation_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_hash` text NOT NULL,
	`source_message_id` text,
	`occurred_at` text NOT NULL,
	`payload_redacted` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_events_event_hash_unique` ON `reservation_events` (`event_hash`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_system` text DEFAULT 'manual' NOT NULL,
	`source_channel` text NOT NULL,
	`ota_external_id` text,
	`event_type` text DEFAULT 'created' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`guest_name` text NOT NULL,
	`guest_contact_masked` text,
	`arrival_date` text NOT NULL,
	`departure_date` text NOT NULL,
	`room_type_id` text,
	`room_number` text,
	`adults` integer DEFAULT 1 NOT NULL,
	`children` integer DEFAULT 0 NOT NULL,
	`infants` integer DEFAULT 0 NOT NULL,
	`total_amount` integer DEFAULT 0 NOT NULL,
	`received_amount` integer DEFAULT 0 NOT NULL,
	`balance_amount` integer DEFAULT 0 NOT NULL,
	`payment_method` text,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`special_requests` text,
	`import_state` text DEFAULT 'confirmed' NOT NULL,
	`source_message_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_number`) REFERENCES `rooms`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_reservations_dates` ON `reservations` (`arrival_date`,`departure_date`);--> statement-breakpoint
CREATE INDEX `idx_reservations_status` ON `reservations` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reservations_source_message` ON `reservations` (`source_system`,`source_message_id`);--> statement-breakpoint
CREATE TABLE `room_types` (
	`id` text PRIMARY KEY NOT NULL,
	`source_name` text NOT NULL,
	`display_name` text NOT NULL,
	`default_room_number` text NOT NULL,
	`is_bookable` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_types_source_name_unique` ON `room_types` (`source_name`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`number` text PRIMARY KEY NOT NULL,
	`room_type_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE no action
);
