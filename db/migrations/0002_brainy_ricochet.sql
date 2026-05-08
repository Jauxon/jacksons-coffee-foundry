ALTER TABLE `ingredient` ADD `storage_weight` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `shop` ADD `storage_capacity_units` integer DEFAULT 80000 NOT NULL;