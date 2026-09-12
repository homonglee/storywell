CREATE TABLE `story_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`action` text NOT NULL,
	`model` text NOT NULL,
	`input_summary` text NOT NULL,
	`output` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_story_generations_owner_project_created` ON `story_generations` (`owner_id`,`project_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
