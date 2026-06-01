CREATE TABLE `banner_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`quote` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `banner_quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `banner_quotes_userId_unique` UNIQUE(`userId`)
);
