CREATE TABLE `frameworks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`name` varchar(150) NOT NULL,
	`type` enum('框架','方法','原則','流程') NOT NULL,
	`sourceBook` varchar(255),
	`oneLiner` text,
	`tags` text,
	`whenUse` text,
	`steps` text,
	`keyQuestions` text,
	`output` text,
	`example` text,
	`diagram` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `frameworks_id` PRIMARY KEY(`id`),
	CONSTRAINT `frameworks_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `problem_solutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`problemText` text NOT NULL,
	`chosenFrameworks` text,
	`reasoning` text,
	`analysis` text,
	`diagram` text,
	`diagramType` varchar(30),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `problem_solutions_id` PRIMARY KEY(`id`)
);
