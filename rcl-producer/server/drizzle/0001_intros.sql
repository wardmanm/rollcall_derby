CREATE TABLE `producer_intros` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`team_a_id` text,
	`team_b_id` text,
	`theme_id` text,
	`placement` text NOT NULL,
	`options` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `producer_themes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `producer_intros_name_unique` ON `producer_intros` (`name`);