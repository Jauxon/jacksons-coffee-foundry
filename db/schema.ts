import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

// ============================================================
// Simulation clock
// ============================================================
// Single-row table tracking the current tick. Sim time advances
// in discrete (day, segment) pairs — matches the Palantir demo's
// "Day 2, Time Night" framing.
export const simState = sqliteTable("sim_state", {
  id: integer("id").primaryKey(),
  day: integer("day").notNull(),
  segment: text("segment", {
    enum: ["morning", "midday", "evening", "night"],
  }).notNull(),
  isRunning: integer("is_running", { mode: "boolean" }).notNull().default(false),
});

// ============================================================
// Shop
// ============================================================
export const shop = sqliteTable("shop", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  cashCents: integer("cash_cents").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  staffCount: integer("staff_count").notNull(),
  // Multi-team competition fields:
  agentStrategy: text("agent_strategy", {
    enum: ["aggressive_stocker", "lean_operator", "premium_pricer", "volume_king", "human"],
  }).notNull(),
  colorHex: text("color_hex").notNull(),
  // When true, agent proposals auto-execute on creation (no human approval).
  autoApprove: integer("auto_approve", { mode: "boolean" }).notNull().default(false),
  // Total storage volume the shop can hold (in abstract "storage units"). NYC
  // storefronts are tiny — this constrains the agent from year-of-cups orders.
  storageCapacityUnits: integer("storage_capacity_units").notNull().default(80000),
});

// ============================================================
// Menu: products + recipes
// ============================================================
export const ingredient = sqliteTable("ingredient", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  unit: text("unit").notNull(), // "g", "ml", "shot"
  shelfLifeDays: integer("shelf_life_days").notNull(),
  // How much abstract "storage volume" 1 unit consumes. Cups and lids are
  // bulky per-unit; liquids and grain are tracked at a smaller granularity.
  storageWeight: real("storage_weight").notNull().default(1.0),
  // Tap-supplied ingredients (water, ice) are always available, free, and
  // never need reordering — modelling tap water + an in-shop ice maker.
  isTapSupplied: integer("is_tap_supplied", { mode: "boolean" }).notNull().default(false),
});

export const product = sqliteTable("product", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shop.id),
  name: text("name").notNull(), // "Espresso", "Cappuccino", ...
  priceCents: integer("price_cents").notNull(),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
});

// recipe edge: how much of each ingredient one product consumes
export const productIngredient = sqliteTable(
  "product_ingredient",
  {
    productId: integer("product_id").notNull().references(() => product.id),
    ingredientId: integer("ingredient_id").notNull().references(() => ingredient.id),
    qtyPerUnit: real("qty_per_unit").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.productId, t.ingredientId] }),
  }),
);

// ============================================================
// Vendors and the things they sell
// ============================================================
export const vendor = sqliteTable("vendor", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(), // delivery delay
  reliability: real("reliability").notNull(), // 0..1, p(on-time)
});

export const vendorIngredient = sqliteTable(
  "vendor_ingredient",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vendorId: integer("vendor_id").notNull().references(() => vendor.id),
    ingredientId: integer("ingredient_id").notNull().references(() => ingredient.id),
    // REAL — realistic wholesale prices need fractional cents
    // (e.g. wholesale milk ≈ 0.15¢/ml = $1.50/L).
    unitPriceCents: real("unit_price_cents").notNull(),
    moq: integer("moq").notNull(), // minimum order quantity
  },
  (t) => ({
    byVendor: index("vendor_ingredient_by_vendor").on(t.vendorId, t.ingredientId),
  }),
);

// ============================================================
// Inventory: batches that expire (the key tradeoff lever)
// ============================================================
// One row per delivered batch. Batches deplete as customers are
// served and disappear (zero remaining) when expired.
export const inventoryBatch = sqliteTable(
  "inventory_batch",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: integer("shop_id").notNull().references(() => shop.id),
    ingredientId: integer("ingredient_id").notNull().references(() => ingredient.id),
    purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrder.id),
    initialQty: real("initial_qty").notNull(),
    remainingQty: real("remaining_qty").notNull(),
    deliveredDay: integer("delivered_day").notNull(),
    expiresDay: integer("expires_day").notNull(),
  },
  (t) => ({
    byIngredient: index("batch_by_ingredient").on(t.shopId, t.ingredientId),
    byExpiry: index("batch_by_expiry").on(t.expiresDay),
  }),
);

// ============================================================
// Purchase orders (the agent's primary outbound action)
// ============================================================
export const purchaseOrder = sqliteTable("purchase_order", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shop.id),
  vendorId: integer("vendor_id").notNull().references(() => vendor.id),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredient.id),
  qty: integer("qty").notNull(),
  unitPriceCents: real("unit_price_cents").notNull(),
  totalCents: real("total_cents").notNull(),
  status: text("status", {
    enum: ["pending", "in_transit", "delivered", "cancelled"],
  }).notNull(),
  placedDay: integer("placed_day").notNull(),
  expectedDay: integer("expected_day").notNull(),
  proposedByAgentId: integer("proposed_by_agent_id").references(() => agentProposal.id),
});

// ============================================================
// Vendor email correspondence (agent's other outbound channel)
// ============================================================
export const emailThread = sqliteTable("email_thread", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shop.id),
  vendorId: integer("vendor_id").references(() => vendor.id),
  subject: text("subject").notNull(),
  createdDay: integer("created_day").notNull(),
});

export const email = sqliteTable("email", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: integer("thread_id").notNull().references(() => emailThread.id),
  fromAddr: text("from_addr").notNull(),
  toAddr: text("to_addr").notNull(),
  body: text("body").notNull(),
  sentDay: integer("sent_day").notNull(),
  sentSegment: text("sent_segment").notNull(),
  attachedPurchaseOrderId: integer("attached_purchase_order_id").references(() => purchaseOrder.id),
});

// ============================================================
// Customers, orders, reviews — the simulation outputs
// ============================================================
export const customer = sqliteTable("customer", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  preferredProductName: text("preferred_product_name"),
  priceSensitivity: real("price_sensitivity").notNull(), // 0..1
  patience: real("patience").notNull(), // 0..1, balks above wait threshold
});

export const customerOrder = sqliteTable(
  "customer_order",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: integer("shop_id").notNull().references(() => shop.id),
    customerId: integer("customer_id").notNull().references(() => customer.id),
    productId: integer("product_id").references(() => product.id),
    day: integer("day").notNull(),
    segment: text("segment").notNull(),
    status: text("status", {
      enum: ["fulfilled", "stockout", "balked_wait", "balked_price", "product_off"],
    }).notNull(),
    waitSeconds: integer("wait_seconds"),
    priceCentsPaid: integer("price_cents_paid"),
    cogsCents: integer("cogs_cents"),
    // For status='stockout': the specific ingredient that ran out and
    // blocked fulfillment. Null for fulfilled / balked statuses.
    stockoutIngredientId: integer("stockout_ingredient_id").references(() => ingredient.id),
  },
  (t) => ({
    byShopDay: index("orders_by_shop_day").on(t.shopId, t.day),
  }),
);

export const review = sqliteTable("review", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shop.id),
  customerOrderId: integer("customer_order_id").references(() => customerOrder.id),
  customerId: integer("customer_id").references(() => customer.id),
  stars: integer("stars").notNull(),
  body: text("body").notNull(),
  day: integer("day").notNull(),
  segment: text("segment").notNull(),
});

// ============================================================
// Daily snapshot — written at end of each sim day for ticker / metrics tab.
// Captures per-shop financials at day close so we can chart over time.
// ============================================================
export const dailySnapshot = sqliteTable(
  "daily_snapshot",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: integer("shop_id").notNull().references(() => shop.id),
    day: integer("day").notNull(),
    cashCents: integer("cash_cents").notNull(),
    revenueCents: real("revenue_cents").notNull(),
    cogsCents: real("cogs_cents").notNull(),
    wagesCents: real("wages_cents").notNull(),
    netCents: real("net_cents").notNull(),
    fulfilledOrders: integer("fulfilled_orders").notNull(),
    failedOrders: integer("failed_orders").notNull(),
    fulfillmentRate: real("fulfillment_rate").notNull(), // 0..1
    avgRating: real("avg_rating"), // null if no reviews
  },
  (t) => ({
    byShopDay: index("snapshot_by_shop_day").on(t.shopId, t.day),
  }),
);

// ============================================================
// Agent layer: proposals from LLM agents awaiting human approval.
// This is the "Logic Function fires → Action stages ontology edits"
// pattern from the Palantir demo, made explicit.
// ============================================================
export const agentProposal = sqliteTable("agent_proposal", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shop.id),
  agentName: text("agent_name").notNull(), // "reorder", "pricing", "menu", "email"
  kind: text("kind", {
    enum: ["purchase_order", "price_update", "product_toggle", "email_reply", "staff_change"],
  }).notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  rationale: text("rationale").notNull(),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "auto_executed"],
  }).notNull().default("pending"),
  createdDay: integer("created_day").notNull(),
  createdSegment: text("created_segment").notNull(),
  decidedAt: integer("decided_at", { mode: "timestamp" }),
});
