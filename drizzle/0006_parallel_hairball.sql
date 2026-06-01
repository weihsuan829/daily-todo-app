CREATE TABLE `deleted_recurring_instances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`recurringTaskId` int NOT NULL,
	`deletedDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deleted_recurring_instances_id` PRIMARY KEY(`id`)
);
