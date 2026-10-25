CREATE TABLE `producer_themes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tokens` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `producer_themes_name_unique` ON `producer_themes` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `producer_themes_one_default` ON `producer_themes` (`is_default`) WHERE "producer_themes"."is_default" = 1;