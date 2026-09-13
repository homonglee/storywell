CREATE TABLE `story_ai_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_story_ai_progress_owner_updated` ON `story_ai_progress` (`owner_id`,`updated_at`);