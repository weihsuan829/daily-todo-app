CREATE TABLE `placeholder_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`color` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `placeholder_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tasks` MODIFY COLUMN `priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE `tasks` ADD `assigneeId` int;--> statement-breakpoint
ALTER TABLE `tasks` ADD `assigneePlaceholderId` int;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrenceRule` text;