CREATE TABLE `agencies` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agencies_owner_unique` ON `agencies` (`owner`);--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`agency` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`record_id` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`agency`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`agency` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`assigned_only` integer DEFAULT 0 NOT NULL,
	`permissions` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`agency`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agency_email` ON `members` (`agency`,`email`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`agency` text NOT NULL,
	`module` text NOT NULL,
	`client_id` text,
	`data` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`agency`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
