CREATE TABLE `problem_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`problemSolutionId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `problem_messages_id` PRIMARY KEY(`id`)
);
