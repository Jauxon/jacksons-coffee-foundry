// seedDatabase takes db + schema as params so it can be imported synchronously
// from db/client.ts without a circular dependency. The CLI entry point at the
// bottom dynamic-imports client.ts when run directly (`npm run db:seed`).
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schemaModule from "./schema.ts";

type Schema = typeof schemaModule;
type DB = BetterSQLite3Database<Schema>;

export function seedDatabase(
  db: DB,
  s: Schema,
): { shops: number; ingredients: number; vendors: number; offerings: number; customers: number } {
// Idempotent: wipe and re-seed.
db.delete(s.review).run();
db.delete(s.customerOrder).run();
db.delete(s.customer).run();
db.delete(s.email).run();
db.delete(s.emailThread).run();
db.delete(s.inventoryBatch).run();
db.delete(s.purchaseOrder).run();
db.delete(s.agentProposal).run();
db.delete(s.vendorIngredient).run();
db.delete(s.vendor).run();
db.delete(s.productIngredient).run();
db.delete(s.product).run();
db.delete(s.ingredient).run();
db.delete(s.shop).run();
db.delete(s.simState).run();

// ---------- Sim clock ----------
db.insert(s.simState).values({ id: 1, day: 1, segment: "morning", isRunning: false }).run();

// ---------- Teams ----------
// 5 storefronts within ~2 blocks of Times Square (40.7580, -73.9855).
// Each team has a distinct strategy that drives the agent's reorder/pricing behavior.
const teamSeed = [
  // Aggressive stocker — overstocks to never miss a sale, accepts perishable waste
  // (Bigger storefront = more storage to enable the strategy.)
  {
    name: "Stockpile Cafe",
    agentStrategy: "aggressive_stocker" as const,
    cashCents: 800_000,
    lat: 40.7589, lng: -73.9851,
    staffCount: 3,
    colorHex: "#DC2626", // red
    autoApprove: true,
    priceMultiplier: 1.0,
    storageCapacityUnits: 100_000,
  },
  // Lean operator — minimum inventory, tolerates stockouts, runs lean staff
  {
    name: "Frugal Brews",
    agentStrategy: "lean_operator" as const,
    cashCents: 800_000,
    lat: 40.7572, lng: -73.9858,
    staffCount: 1,
    colorHex: "#2563EB", // blue
    autoApprove: true,
    priceMultiplier: 0.96,
    storageCapacityUnits: 40_000, // hole-in-the-wall
  },
  // Premium — higher prices, premium vendors only, smaller volume
  {
    name: "Bowery & Co.",
    agentStrategy: "premium_pricer" as const,
    cashCents: 800_000,
    lat: 40.7585, lng: -73.9842,
    staffCount: 2,
    colorHex: "#D97706", // amber
    autoApprove: true,
    priceMultiplier: 1.25,
    storageCapacityUnits: 60_000,
  },
  // Volume — lower prices, max staff, push throughput
  {
    name: "Penny Cup",
    agentStrategy: "volume_king" as const,
    cashCents: 800_000,
    lat: 40.7568, lng: -73.9870,
    staffCount: 4,
    colorHex: "#059669", // emerald
    autoApprove: true,
    priceMultiplier: 0.85,
    storageCapacityUnits: 90_000,
  },
  // Human team — operator drives every decision, no AI auto-execution
  {
    name: "Operator's Cafe",
    agentStrategy: "human" as const,
    cashCents: 800_000,
    lat: 40.7580, lng: -73.9855,
    staffCount: 2,
    colorHex: "#8B6F47", // coffee
    autoApprove: false,
    priceMultiplier: 1.0,
    storageCapacityUnits: 70_000,
  },
];

const shops: { id: number; name: string; priceMultiplier: number }[] = [];
for (const t of teamSeed) {
  const [row] = db.insert(s.shop).values({
    name: t.name,
    cashCents: t.cashCents,
    lat: t.lat,
    lng: t.lng,
    staffCount: t.staffCount,
    agentStrategy: t.agentStrategy,
    colorHex: t.colorHex,
    autoApprove: t.autoApprove,
    storageCapacityUnits: t.storageCapacityUnits,
  }).returning().all();
  shops.push({ id: row.id, name: row.name, priceMultiplier: t.priceMultiplier });
}

// ---------- Ingredients (global) ----------
// storageWeight: abstract storage units consumed per 1 unit of inventory.
// isTapSupplied: water (tap) and ice (in-shop ice maker) — never ordered, never depletes.
const ingredientSeed = [
  { name: "espresso_beans", unit: "g", shelfLifeDays: 30, storageWeight: 0.05, isTapSupplied: false },
  { name: "whole_milk", unit: "ml", shelfLifeDays: 7, storageWeight: 0.05, isTapSupplied: false },
  { name: "oat_milk", unit: "ml", shelfLifeDays: 10, storageWeight: 0.05, isTapSupplied: false },
  { name: "ice", unit: "g", shelfLifeDays: 365, storageWeight: 0, isTapSupplied: true },           // tap/ice-maker
  { name: "water", unit: "ml", shelfLifeDays: 365, storageWeight: 0, isTapSupplied: true },         // tap
  { name: "chocolate_syrup", unit: "ml", shelfLifeDays: 180, storageWeight: 0.05, isTapSupplied: false },
  { name: "vanilla_syrup", unit: "ml", shelfLifeDays: 180, storageWeight: 0.05, isTapSupplied: false },
  { name: "small_cup", unit: "unit", shelfLifeDays: 365, storageWeight: 2, isTapSupplied: false },
  { name: "large_cup", unit: "unit", shelfLifeDays: 365, storageWeight: 3, isTapSupplied: false },
  { name: "lid", unit: "unit", shelfLifeDays: 365, storageWeight: 0.5, isTapSupplied: false },
];
const ingredients = db.insert(s.ingredient).values(ingredientSeed).returning().all();
const ing = Object.fromEntries(ingredients.map(i => [i.name, i.id])) as Record<string, number>;

// ---------- Products per shop (same menu, prices vary by strategy) ----------
// Realistic Manhattan coffee prices.
const baseProductSeed = [
  { name: "Espresso", priceCents: 350 },
  { name: "Americano", priceCents: 425 },
  { name: "Cappuccino", priceCents: 525 },
  { name: "Latte", priceCents: 575 },
  { name: "Mocha", priceCents: 625 },
  { name: "Iced Latte", priceCents: 625 },
];

// productIdsByShop: shopId → { productName → productId }
const productIdsByShop: Record<number, Record<string, number>> = {};
for (const shop of shops) {
  const products = db.insert(s.product).values(
    baseProductSeed.map(p => ({
      name: p.name,
      priceCents: Math.round(p.priceCents * shop.priceMultiplier),
      shopId: shop.id,
      isAvailable: true,
    })),
  ).returning().all();
  productIdsByShop[shop.id] = Object.fromEntries(products.map(p => [p.name, p.id]));
}

// ---------- Recipes (one set per shop, same composition) ----------
const recipeTemplate = (prods: Record<string, number>) => [
  { productId: prods.Espresso, ingredientId: ing.espresso_beans, qtyPerUnit: 18 },
  { productId: prods.Espresso, ingredientId: ing.small_cup, qtyPerUnit: 1 },
  { productId: prods.Espresso, ingredientId: ing.lid, qtyPerUnit: 1 },
  { productId: prods.Americano, ingredientId: ing.espresso_beans, qtyPerUnit: 18 },
  { productId: prods.Americano, ingredientId: ing.water, qtyPerUnit: 200 },
  { productId: prods.Americano, ingredientId: ing.large_cup, qtyPerUnit: 1 },
  { productId: prods.Americano, ingredientId: ing.lid, qtyPerUnit: 1 },
  { productId: prods.Cappuccino, ingredientId: ing.espresso_beans, qtyPerUnit: 18 },
  { productId: prods.Cappuccino, ingredientId: ing.whole_milk, qtyPerUnit: 150 },
  { productId: prods.Cappuccino, ingredientId: ing.large_cup, qtyPerUnit: 1 },
  { productId: prods.Cappuccino, ingredientId: ing.lid, qtyPerUnit: 1 },
  { productId: prods.Latte, ingredientId: ing.espresso_beans, qtyPerUnit: 18 },
  { productId: prods.Latte, ingredientId: ing.whole_milk, qtyPerUnit: 250 },
  { productId: prods.Latte, ingredientId: ing.large_cup, qtyPerUnit: 1 },
  { productId: prods.Latte, ingredientId: ing.lid, qtyPerUnit: 1 },
  { productId: prods.Mocha, ingredientId: ing.espresso_beans, qtyPerUnit: 18 },
  { productId: prods.Mocha, ingredientId: ing.whole_milk, qtyPerUnit: 200 },
  { productId: prods.Mocha, ingredientId: ing.chocolate_syrup, qtyPerUnit: 30 },
  { productId: prods.Mocha, ingredientId: ing.large_cup, qtyPerUnit: 1 },
  { productId: prods.Mocha, ingredientId: ing.lid, qtyPerUnit: 1 },
  { productId: prods["Iced Latte"], ingredientId: ing.espresso_beans, qtyPerUnit: 18 },
  { productId: prods["Iced Latte"], ingredientId: ing.oat_milk, qtyPerUnit: 200 },
  { productId: prods["Iced Latte"], ingredientId: ing.ice, qtyPerUnit: 100 },
  { productId: prods["Iced Latte"], ingredientId: ing.large_cup, qtyPerUnit: 1 },
  { productId: prods["Iced Latte"], ingredientId: ing.lid, qtyPerUnit: 1 },
];
for (const shop of shops) {
  db.insert(s.productIngredient).values(recipeTemplate(productIdsByShop[shop.id])).run();
}

// ---------- Vendors (global, NYC-area) ----------
const vendorSeed = [
  // Beans
  { name: "Brooklyn Roasters", email: "orders@brooklynroasters.com", leadTimeDays: 1, reliability: 0.97 },
  { name: "Counter Culture NYC", email: "trade@counterculture-nyc.com", leadTimeDays: 1, reliability: 0.99 },
  // General-purpose bulk
  { name: "General Supplies Corp.", email: "bulk@generalsupplies.com", leadTimeDays: 2, reliability: 0.85 },
  // Dairy
  { name: "Hudson Valley Dairy", email: "trade@hudsonvalleydairy.com", leadTimeDays: 1, reliability: 0.95 },
  { name: "Ronnybrook Farm", email: "wholesale@ronnybrook.com", leadTimeDays: 1, reliability: 0.96 },
  // Syrups
  { name: "Monin Wholesale", email: "ny.accounts@monin-wholesale.com", leadTimeDays: 1, reliability: 0.94 },
  // Packaging
  { name: "Atlas Packaging", email: "sales@atlaspack.com", leadTimeDays: 3, reliability: 0.90 },
  { name: "Greenline Cup Co.", email: "orders@greenlinecups.com", leadTimeDays: 2, reliability: 0.93 },
];
const vendors = db.insert(s.vendor).values(vendorSeed).returning().all();
const ven = Object.fromEntries(vendors.map(v => [v.name, v.id])) as Record<string, number>;

// ---------- Vendor offerings (cents per smallest unit; can be fractional) ----------
// Tap-supplied ingredients (water, ice) are not vended.
// Each ingredient has 2-3 vendors so the agent has real comparison shopping to do.
const offerings = [
  // Espresso beans
  { vendorId: ven["Brooklyn Roasters"],     ingredientId: ing.espresso_beans, unitPriceCents: 4,    moq: 1000 }, // $40/kg
  { vendorId: ven["Counter Culture NYC"],   ingredientId: ing.espresso_beans, unitPriceCents: 5,    moq: 500  }, // $50/kg, smaller MOQ
  { vendorId: ven["General Supplies Corp."],ingredientId: ing.espresso_beans, unitPriceCents: 3,    moq: 5000 }, // $30/kg, bulk MOQ

  // Whole milk
  { vendorId: ven["General Supplies Corp."],ingredientId: ing.whole_milk,   unitPriceCents: 0.1,  moq: 10000 }, // $1/L, bulk
  { vendorId: ven["Hudson Valley Dairy"],   ingredientId: ing.whole_milk,   unitPriceCents: 0.15, moq: 2000  }, // $1.50/L
  { vendorId: ven["Ronnybrook Farm"],       ingredientId: ing.whole_milk,   unitPriceCents: 0.18, moq: 1000  }, // $1.80/L, small MOQ

  // Oat milk
  { vendorId: ven["General Supplies Corp."],ingredientId: ing.oat_milk,     unitPriceCents: 0.25, moq: 5000  }, // $2.50/L
  { vendorId: ven["Hudson Valley Dairy"],   ingredientId: ing.oat_milk,     unitPriceCents: 0.35, moq: 2000  }, // $3.50/L premium
  { vendorId: ven["Ronnybrook Farm"],       ingredientId: ing.oat_milk,     unitPriceCents: 0.30, moq: 2000  }, // $3/L

  // Syrups
  { vendorId: ven["General Supplies Corp."],ingredientId: ing.chocolate_syrup, unitPriceCents: 0.5, moq: 2000 }, // $5/L
  { vendorId: ven["Monin Wholesale"],       ingredientId: ing.chocolate_syrup, unitPriceCents: 0.8, moq: 500  }, // $8/L, branded
  { vendorId: ven["General Supplies Corp."],ingredientId: ing.vanilla_syrup,   unitPriceCents: 0.5, moq: 2000 },
  { vendorId: ven["Monin Wholesale"],       ingredientId: ing.vanilla_syrup,   unitPriceCents: 0.7, moq: 500  },

  // Packaging
  { vendorId: ven["Atlas Packaging"],       ingredientId: ing.small_cup, unitPriceCents: 8,  moq: 500 },
  { vendorId: ven["Greenline Cup Co."],     ingredientId: ing.small_cup, unitPriceCents: 12, moq: 200 }, // eco, premium
  { vendorId: ven["Atlas Packaging"],       ingredientId: ing.large_cup, unitPriceCents: 12, moq: 500 },
  { vendorId: ven["Greenline Cup Co."],     ingredientId: ing.large_cup, unitPriceCents: 18, moq: 200 },
  { vendorId: ven["Atlas Packaging"],       ingredientId: ing.lid,       unitPriceCents: 5,  moq: 500 },
  { vendorId: ven["Greenline Cup Co."],     ingredientId: ing.lid,       unitPriceCents: 8,  moq: 200 },
];
db.insert(s.vendorIngredient).values(offerings).run();

// Strategy-aware vendor picker (same logic as sim/agent.ts) so starter inventory
// reflects each team's vendor preferences right from Day 1.
const vendorById = new Map(vendors.map((v) => [v.id, v]));
function pickVendorForStrategy(strategy: string, ingredientId: number) {
  const candidates = offerings
    .filter((o) => o.ingredientId === ingredientId)
    .map((o) => ({ o, vendor: vendorById.get(o.vendorId)! }))
    .filter((x) => x.vendor != null);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    switch (strategy) {
      case "premium_pricer":
        if (a.vendor.reliability !== b.vendor.reliability) return b.vendor.reliability - a.vendor.reliability;
        return a.vendor.leadTimeDays - b.vendor.leadTimeDays;
      case "aggressive_stocker":
        if (a.vendor.leadTimeDays !== b.vendor.leadTimeDays) return a.vendor.leadTimeDays - b.vendor.leadTimeDays;
        return a.o.moq - b.o.moq;
      case "volume_king":
        if (a.o.moq !== b.o.moq) return b.o.moq - a.o.moq;
        return a.o.unitPriceCents - b.o.unitPriceCents;
      default:
        if (a.o.unitPriceCents !== b.o.unitPriceCents) return a.o.unitPriceCents - b.o.unitPriceCents;
        return a.vendor.leadTimeDays - b.vendor.leadTimeDays;
    }
  });
  return candidates[0];
}

// ---------- Initial inventory per shop (with synthetic POs for COGS lookup) ----------
// Sized for ~5-7 days of demand at the projected per-shop arrival rate so Day 1
// feels fully stocked. The reorder agent only fires when stock dips below
// (lead_time + 1) days. Strategy bias scales further (aggressive 1.5x, lean 0.7x).
// Tap-supplied ingredients (water, ice) are NOT seeded — they're always available.
const baseBatches = [
  { ingredientId: ing.espresso_beans,  qty: 50000,  deliveredOffset: -2, shelfLife: 30  }, // 50kg
  { ingredientId: ing.whole_milk,      qty: 300000, deliveredOffset: -1, shelfLife: 7   }, // 300L
  { ingredientId: ing.oat_milk,        qty: 80000,  deliveredOffset: 0,  shelfLife: 10  }, // 80L
  { ingredientId: ing.chocolate_syrup, qty: 6000,   deliveredOffset: -5, shelfLife: 180 }, // 6L
  { ingredientId: ing.vanilla_syrup,   qty: 6000,   deliveredOffset: -5, shelfLife: 180 }, // 6L
  { ingredientId: ing.small_cup,       qty: 3000,   deliveredOffset: -3, shelfLife: 365 },
  { ingredientId: ing.large_cup,       qty: 3750,   deliveredOffset: -3, shelfLife: 365 },
  { ingredientId: ing.lid,             qty: 6750,   deliveredOffset: -3, shelfLife: 365 },
];

const stockBiasByStrategy: Record<string, number> = {
  aggressive_stocker: 1.5,
  lean_operator: 0.7, // bumped from 0.5 so even the lean team starts comfortably stocked
  premium_pricer: 1.0,
  volume_king: 1.3,
  human: 1.0,
};

for (const shop of shops) {
  const teamRow = teamSeed.find((t) => t.name === shop.name)!;
  const bias = stockBiasByStrategy[teamRow.agentStrategy] ?? 1.0;
  for (const b of baseBatches) {
    const qty = Math.round(b.qty * bias);
    const pick = pickVendorForStrategy(teamRow.agentStrategy, b.ingredientId);
    if (!pick) throw new Error(`no vendor offering for ingredientId=${b.ingredientId}`);
    const placedDay = 1 + b.deliveredOffset - 1;
    const [po] = db.insert(s.purchaseOrder).values({
      shopId: shop.id,
      vendorId: pick.o.vendorId,
      ingredientId: b.ingredientId,
      qty,
      unitPriceCents: pick.o.unitPriceCents,
      totalCents: qty * pick.o.unitPriceCents,
      status: "delivered",
      placedDay,
      expectedDay: 1 + b.deliveredOffset,
      proposedByAgentId: null,
    }).returning().all();

    db.insert(s.inventoryBatch).values({
      shopId: shop.id,
      ingredientId: b.ingredientId,
      purchaseOrderId: po.id,
      initialQty: qty,
      remainingQty: qty,
      deliveredDay: 1 + b.deliveredOffset,
      expiresDay: 1 + b.deliveredOffset + b.shelfLife,
    }).run();
  }
}

// ---------- Customer personas (global pool — pick a shop per arrival in tick) ----------
const customerNames = [
  "Faramir Cooper", "Binx Cruz", "Iris Moonbeam", "Nori Reed", "Pearl Ironfoot",
  "Atlas Vega", "Juniper Wells", "Cassian Frost", "Maeve Ashby", "Rowan Pike",
  "Thalia Quinn", "Elias Marsh", "Soraya Lin", "Dante Brook", "Vivienne Cole",
  "Hugo Ravensdale", "Ines Park", "Magnus Holt", "Saoirse Day", "Theo Aspen",
  "Wren Calloway", "Felix Dunbar", "Asher Knight", "Coral Vance", "Lyra Sayre",
  "Ophelia West", "Quincy Lake", "Reza Bishop", "Talia Brooks", "Ulysses Crane",
];
const productNames = baseProductSeed.map(p => p.name);
db.insert(s.customer).values(
  customerNames.map((name, i) => ({
    name,
    preferredProductName: productNames[i % productNames.length],
    priceSensitivity: 0.2 + (i % 5) * 0.15,
    patience: 0.3 + ((i * 7) % 5) * 0.15,
  })),
).run();

  return {
    shops: shops.length,
    ingredients: ingredients.length,
    vendors: vendors.length,
    offerings: offerings.length,
    customers: customerNames.length,
  };
}

// CLI entry point lives in db/seed-cli.ts to avoid a circular import with client.ts.
