CREATE TABLE `font_faces` (
	`id` text PRIMARY KEY NOT NULL,
	`family` text NOT NULL,
	`weight_min` integer NOT NULL,
	`weight_max` integer NOT NULL,
	`style` text NOT NULL,
	`media_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `font_faces_face_idx` ON `font_faces` (`family`,`weight_min`,`weight_max`,`style`);