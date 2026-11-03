CREATE TABLE `budgets` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budget_expiry` ON `budgets` (`expires`);--> statement-breakpoint
CREATE TABLE `cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`expires` integer NOT NULL,
	`retain_until` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`owner` text
);
--> statement-breakpoint
CREATE INDEX `cache_retention` ON `cache` (`retain_until`);--> statement-breakpoint
CREATE TABLE `slots` (
	`key` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL,
	`owner` text
);
