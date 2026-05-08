CREATE TABLE `daily_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`day` integer NOT NULL,
	`cash_cents` integer NOT NULL,
	`revenue_cents` real NOT NULL,
	`cogs_cents` real NOT NULL,
	`wages_cents` real NOT NULL,
	`net_cents` real NOT NULL,
	`fulfilled_orders` integer NOT NULL,
	`failed_orders` integer NOT NULL,
	`fulfillment_rate` real NOT NULL,
	`avg_rating` real,
	FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snapshot_by_shop_day` ON `daily_snapshot` (`shop_id`,`day`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`vendor_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`unit_price_cents` real NOT NULL,
	`total_cents` real NOT NULL,
	`status` text NOT NULL,
	`placed_day` integer NOT NULL,
	`expected_day` integer NOT NULL,
	`proposed_by_agent_id` integer,
	FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendor`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposed_by_agent_id`) REFERENCES `agent_proposal`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_purchase_order`("id", "shop_id", "vendor_id", "ingredient_id", "qty", "unit_price_cents", "total_cents", "status", "placed_day", "expected_day", "proposed_by_agent_id") SELECT "id", "shop_id", "vendor_id", "ingredient_id", "qty", "unit_price_cents", "total_cents", "status", "placed_day", "expected_day", "proposed_by_agent_id" FROM `purchase_order`;--> statement-breakpoint
DROP TABLE `purchase_order`;--> statement-breakpoint
ALTER TABLE `__new_purchase_order` RENAME TO `purchase_order`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_vendor_ingredient` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendor_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`unit_price_cents` real NOT NULL,
	`moq` integer NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendor`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_vendor_ingredient`("id", "vendor_id", "ingredient_id", "unit_price_cents", "moq") SELECT "id", "vendor_id", "ingredient_id", "unit_price_cents", "moq" FROM `vendor_ingredient`;--> statement-breakpoint
DROP TABLE `vendor_ingredient`;--> statement-breakpoint
ALTER TABLE `__new_vendor_ingredient` RENAME TO `vendor_ingredient`;--> statement-breakpoint
CREATE INDEX `vendor_ingredient_by_vendor` ON `vendor_ingredient` (`vendor_id`,`ingredient_id`);--> statement-breakpoint
ALTER TABLE `ingredient` ADD `is_tap_supplied` integer DEFAULT false NOT NULL;