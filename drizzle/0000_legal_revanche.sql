CREATE TABLE `story_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`synopsis` text NOT NULL,
	`genre` text NOT NULL,
	`tone` text NOT NULL,
	`target_episodes` integer DEFAULT 80 NOT NULL,
	`status` text DEFAULT '설계 중' NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_story_projects_owner_updated` ON `story_projects` (`owner_id`,`updated_at`);