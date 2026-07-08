ALTER TABLE `test_runs` ADD `physical_build_path` text;--> statement-breakpoint
ALTER TABLE `test_runs` ADD `device_preference` text DEFAULT 'simulator' NOT NULL;--> statement-breakpoint
ALTER TABLE `test_scenarios` ADD `physical_build_path` text;--> statement-breakpoint
ALTER TABLE `test_scenarios` ADD `device_preference` text DEFAULT 'simulator' NOT NULL;