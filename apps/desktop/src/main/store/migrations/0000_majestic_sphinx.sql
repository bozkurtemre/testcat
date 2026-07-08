CREATE TABLE `agent_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cli` text NOT NULL,
	`model` text NOT NULL,
	`reasoning` text NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `test_run_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `test_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text,
	`profile_id` text,
	`name` text NOT NULL,
	`build_path` text NOT NULL,
	`scenario` text NOT NULL,
	`cli` text NOT NULL,
	`model` text NOT NULL,
	`reasoning` text NOT NULL,
	`profile_name` text DEFAULT '' NOT NULL,
	`profile_skills` text DEFAULT '[]' NOT NULL,
	`profile_system_prompt` text DEFAULT '' NOT NULL,
	`devices` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text,
	`duration_ms` integer,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `test_scenarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `test_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`build_path` text NOT NULL,
	`profile_id` text,
	`prompt` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `agent_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
