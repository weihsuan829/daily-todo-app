CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(50) NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#94a3b8',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_tags` (
	`taskId` int NOT NULL,
	`tagId` int NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `parentTaskId` int;