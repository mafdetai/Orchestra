CREATE TABLE `workflow_runs` (
	`id` varchar(64) NOT NULL,
	`templateId` varchar(64) NOT NULL,
	`templateName` varchar(255) NOT NULL,
	`task` text NOT NULL,
	`status` enum('pending','running','completed','error') NOT NULL DEFAULT 'pending',
	`initiatorOutput` text,
	`expertOutputs` text,
	`summaryOutput` text,
	`pdfUrl` text,
	`notificationEmail` varchar(320),
	`errorMessage` text,
	`expertCount` int NOT NULL DEFAULT 0,
	`completedExperts` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_templates` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`config` text NOT NULL,
	`isDefault` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_templates_id` PRIMARY KEY(`id`)
);
