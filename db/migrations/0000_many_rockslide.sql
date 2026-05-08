CREATE TABLE `agent_proposal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`agent_name` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`rationale` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_day` integer NOT NULL,
	`created_segment` text NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `customer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`preferred_product_name` text,
	`price_sensitivity` real NOT NULL,
	`patience` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`product_id` integer,
	`day` integer NOT NULL,
	`segment` text NOT NULL,
	`status` text NOT NULL,
	`wait_seconds` integer,
	`price_cents_paid` integer,
	`cogs_cents` integer,
	FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orders_by_shop_day` ON `customer_order` (`shop_id`,`day`);--> statement-breakpoint
CREATE TABLE `email` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`from_addr` text NOT NULL,
	`to_addr` text NOT NULL,
	`body` text NOT NULL,
	`sent_day` integer NOT NULL,
	`sent_segment` text NOT NULL,
	`attached_purchase_order_id` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `email_thread`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attached_purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `email_thread` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`vendor_id` integer,
	`subject` text NOT NULL,
	`created_day` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendor`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ingredient` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`shelf_life_days` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_name_unique` ON `ingredient` (`name`);--> statement-breakpoint
CREATE TABLE `inventory_batch` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`purchase_order_id` integer,
	`initial_qty` real NOT NULL,
	`remaining_qty` real NOT NULL,
	`delivered_day` integer NOT NULL,
	`expires_day` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `batch_by_ingredient` ON `inventory_batch` (`shop_id`,`ingredient_id`);--> statement-breakpoint
CREATE INDEX `batch_by_expiry` ON `inventory_batch` (`expires_day`);--> statement-breakpoint
CREATE TABLE `product` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`is_available` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_ingredient` (
	`product_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`qty_per_unit` real NOT NULL,
	PRIMARY KEY(`product_id`, `ingredient_id`),
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`vendor_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
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
CREATE TABLE `review` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`customer_order_id` integer,
	`customer_id` integer,
	`stars` integer NOT NULL,
	`body` text NOT NULL,
	`day` integer NOT NULL,
	`segment` text NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shop`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_order_id`) REFERENCES `customer_order`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shop` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cash_cents` integer NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`staff_count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sim_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`day` integer NOT NULL,
	`segment` text NOT NULL,
	`is_running` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vendor` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`lead_time_days` integer NOT NULL,
	`reliability` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vendor_ingredient` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendor_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`moq` integer NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendor`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vendor_ingredient_by_vendor` ON `vendor_ingredient` (`vendor_id`,`ingredient_id`);