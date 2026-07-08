CREATE TABLE `app_maps` (
	`build_key` text PRIMARY KEY NOT NULL,
	`app_map` text DEFAULT '' NOT NULL,
	`login_flow` text,
	`expected_slots` text DEFAULT '[]' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
