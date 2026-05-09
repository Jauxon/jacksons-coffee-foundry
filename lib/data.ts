// Server-side data access — read-only views over the ontology, scoped by shop.

import { db, schema as s } from "../db/client.ts";
import { eq, and, gt, sql, desc } from "drizzle-orm";

export interface ShopOverview {
  id: number;
  name: string;
  cashCents: number;
  lat: number;
  lng: number;
  staffCount: number;
  agentStrategy: string;
  colorHex: string;
  autoApprove: boolean;
  storageCapacityUnits: number;
  storageUsedUnits: number;
  day: number;
  segment: string;
  avgRating: number | null;
  totalReviews: number;
  fulfilledOrders: number;
  failedOrders: number;
  yesterdayFulfilled: number;
  yesterdayFailed: number;
  pendingProposals: number;
}

export function getSimState(): { day: number; segment: string } {
  const state = db.select().from(s.simState).where(eq(s.simState.id, 1)).get();
  if (!state) throw new Error("simState missing — run db:seed");
  return { day: state.day, segment: state.segment };
}

export function getAllShops(): ShopOverview[] {
  return db.select().from(s.shop).orderBy(s.shop.id).all().map((sh) => buildOverview(sh));
}

export function getShop(shopId: number): ShopOverview | null {
  const sh = db.select().from(s.shop).where(eq(s.shop.id, shopId)).get();
  return sh ? buildOverview(sh) : null;
}

function buildOverview(sh: typeof s.shop.$inferSelect): ShopOverview {
  const state = getSimState();
  const reviews = db.select({ stars: s.review.stars }).from(s.review).where(eq(s.review.shopId, sh.id)).all();
  // Storage usage = sum(remainingQty × storageWeight) across unexpired batches.
  const storageRow = db.select({
    used: sql<number>`COALESCE(SUM(${s.inventoryBatch.remainingQty} * ${s.ingredient.storageWeight}), 0)`,
  })
    .from(s.inventoryBatch)
    .innerJoin(s.ingredient, eq(s.ingredient.id, s.inventoryBatch.ingredientId))
    .where(and(
      eq(s.inventoryBatch.shopId, sh.id),
      gt(s.inventoryBatch.remainingQty, 0),
      gt(s.inventoryBatch.expiresDay, state.day - 1),
    )).get();
  const pending = db.select({ c: sql<number>`COUNT(*)` })
    .from(s.agentProposal)
    .where(and(eq(s.agentProposal.shopId, sh.id), eq(s.agentProposal.status, "pending"))).get()!;
  const fulfilledTotal = db.select({ c: sql<number>`COUNT(*)` }).from(s.customerOrder)
    .where(and(eq(s.customerOrder.shopId, sh.id), eq(s.customerOrder.status, "fulfilled"))).get()!;
  const failedTotal = db.select({ c: sql<number>`COUNT(*)` }).from(s.customerOrder)
    .where(and(eq(s.customerOrder.shopId, sh.id), sql`${s.customerOrder.status} != 'fulfilled'`)).get()!;
  const yest = state.day - 1;
  const yFul = db.select({ c: sql<number>`COUNT(*)` }).from(s.customerOrder)
    .where(and(eq(s.customerOrder.shopId, sh.id), eq(s.customerOrder.status, "fulfilled"), eq(s.customerOrder.day, yest))).get()!;
  const yFail = db.select({ c: sql<number>`COUNT(*)` }).from(s.customerOrder)
    .where(and(eq(s.customerOrder.shopId, sh.id), sql`${s.customerOrder.status} != 'fulfilled'`, eq(s.customerOrder.day, yest))).get()!;

  return {
    id: sh.id,
    name: sh.name,
    cashCents: sh.cashCents,
    lat: sh.lat,
    lng: sh.lng,
    staffCount: sh.staffCount,
    agentStrategy: sh.agentStrategy,
    colorHex: sh.colorHex,
    autoApprove: !!sh.autoApprove,
    storageCapacityUnits: sh.storageCapacityUnits,
    storageUsedUnits: Number(storageRow?.used ?? 0),
    day: state.day,
    segment: state.segment,
    avgRating: reviews.length === 0 ? null : reviews.reduce((a, r) => a + r.stars, 0) / reviews.length,
    totalReviews: reviews.length,
    fulfilledOrders: Number(fulfilledTotal.c),
    failedOrders: Number(failedTotal.c),
    yesterdayFulfilled: Number(yFul.c),
    yesterdayFailed: Number(yFail.c),
    pendingProposals: Number(pending.c),
  };
}

export interface ReviewListItem {
  id: number;
  stars: number;
  body: string;
  customerName: string | null;
  productName: string | null;
  day: number;
  segment: string;
  shopId: number;
  shopName: string;
}

export function getRecentReviews(opts: { shopId?: number; limit?: number } = {}): ReviewListItem[] {
  const { shopId, limit = 25 } = opts;
  const q = db.select({
    id: s.review.id,
    stars: s.review.stars,
    body: s.review.body,
    customerName: s.customer.name,
    productName: s.product.name,
    day: s.review.day,
    segment: s.review.segment,
    shopId: s.review.shopId,
    shopName: s.shop.name,
  })
    .from(s.review)
    .leftJoin(s.customer, eq(s.customer.id, s.review.customerId))
    .leftJoin(s.customerOrder, eq(s.customerOrder.id, s.review.customerOrderId))
    .leftJoin(s.product, eq(s.product.id, s.customerOrder.productId))
    .leftJoin(s.shop, eq(s.shop.id, s.review.shopId));
  const rows = (shopId ? q.where(eq(s.review.shopId, shopId)) : q)
    .orderBy(desc(s.review.id))
    .limit(limit)
    .all();
  return rows.map((r) => ({
    id: r.id,
    stars: r.stars,
    body: r.body,
    customerName: r.customerName,
    productName: r.productName,
    day: r.day,
    segment: r.segment,
    shopId: r.shopId,
    shopName: r.shopName ?? "?",
  }));
}

export interface InventoryRow {
  ingredientId: number;
  name: string;
  unit: string;
  shelfLifeDays: number;
  totalQty: number;
  inTransitQty: number;
  earliestExpiryDay: number | null;
}

export function getInventoryByIngredient(shopId: number): InventoryRow[] {
  const state = getSimState();
  const ingredients = db.select().from(s.ingredient).all();
  const out: InventoryRow[] = [];
  for (const ing of ingredients) {
    const cur = db.select({
      total: sql<number>`COALESCE(SUM(${s.inventoryBatch.remainingQty}), 0)`,
      earliest: sql<number | null>`MIN(CASE WHEN ${s.inventoryBatch.remainingQty} > 0 THEN ${s.inventoryBatch.expiresDay} END)`,
    }).from(s.inventoryBatch).where(and(
      eq(s.inventoryBatch.shopId, shopId),
      eq(s.inventoryBatch.ingredientId, ing.id),
      gt(s.inventoryBatch.expiresDay, state.day - 1),
    )).get();
    const it = db.select({ q: sql<number>`COALESCE(SUM(${s.purchaseOrder.qty}), 0)` })
      .from(s.purchaseOrder).where(and(
        eq(s.purchaseOrder.shopId, shopId),
        eq(s.purchaseOrder.ingredientId, ing.id),
        eq(s.purchaseOrder.status, "in_transit"),
      )).get();
    out.push({
      ingredientId: ing.id,
      name: ing.name,
      unit: ing.unit,
      shelfLifeDays: ing.shelfLifeDays,
      totalQty: Number(cur?.total ?? 0),
      inTransitQty: Number(it?.q ?? 0),
      earliestExpiryDay: cur?.earliest ? Number(cur.earliest) : null,
    });
  }
  return out;
}

export interface StockoutRow {
  ingredientName: string;
  inTransitQty: number;
}

// Ingredients with zero unexpired stock, no in-transit PO covering them, and
// not tap-supplied. The in-transit filter means the alert disappears as soon
// as the operator approves the agent's reorder proposal — the action they'd
// take in response to the alert.
export function getCurrentStockouts(shopId: number): StockoutRow[] {
  const state = getSimState();
  const ingredients = db.select().from(s.ingredient).where(eq(s.ingredient.isTapSupplied, false)).all();
  const out: StockoutRow[] = [];
  for (const ing of ingredients) {
    const cur = db.select({
      total: sql<number>`COALESCE(SUM(${s.inventoryBatch.remainingQty}), 0)`,
    }).from(s.inventoryBatch).where(and(
      eq(s.inventoryBatch.shopId, shopId),
      eq(s.inventoryBatch.ingredientId, ing.id),
      gt(s.inventoryBatch.expiresDay, state.day - 1),
    )).get();
    if (Number(cur?.total ?? 0) > 0) continue;
    const it = db.select({ q: sql<number>`COALESCE(SUM(${s.purchaseOrder.qty}), 0)` })
      .from(s.purchaseOrder).where(and(
        eq(s.purchaseOrder.shopId, shopId),
        eq(s.purchaseOrder.ingredientId, ing.id),
        eq(s.purchaseOrder.status, "in_transit"),
      )).get();
    const inTransitQty = Number(it?.q ?? 0);
    if (inTransitQty > 0) continue;
    out.push({ ingredientName: ing.name, inTransitQty });
  }
  return out;
}

export interface InventoryBatchRow {
  id: number;
  ingredientName: string;
  ingredientUnit: string;
  initialQty: number;
  remainingQty: number;
  deliveredDay: number;
  expiresDay: number;
  daysUntilExpiry: number;
  expired: boolean;
}

export function getInventoryBatches(shopId: number): InventoryBatchRow[] {
  const state = getSimState();
  const rows = db.select({
    id: s.inventoryBatch.id,
    name: s.ingredient.name,
    unit: s.ingredient.unit,
    initialQty: s.inventoryBatch.initialQty,
    remainingQty: s.inventoryBatch.remainingQty,
    deliveredDay: s.inventoryBatch.deliveredDay,
    expiresDay: s.inventoryBatch.expiresDay,
  })
    .from(s.inventoryBatch)
    .innerJoin(s.ingredient, eq(s.ingredient.id, s.inventoryBatch.ingredientId))
    .where(eq(s.inventoryBatch.shopId, shopId))
    .orderBy(desc(s.inventoryBatch.id))
    .all();
  return rows.map((r) => ({
    id: r.id,
    ingredientName: r.name,
    ingredientUnit: r.unit,
    initialQty: r.initialQty,
    remainingQty: r.remainingQty,
    deliveredDay: r.deliveredDay,
    expiresDay: r.expiresDay,
    daysUntilExpiry: r.expiresDay - state.day,
    expired: r.expiresDay <= state.day,
  }));
}

export interface ProductRow {
  id: number;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  ingredients: { name: string; qty: number; unit: string }[];
}

export function getProducts(shopId: number): ProductRow[] {
  const products = db.select().from(s.product).where(eq(s.product.shopId, shopId)).all();
  const productIds = products.map((p) => p.id);
  if (productIds.length === 0) return [];
  const recipes = db.select({
    productId: s.productIngredient.productId,
    qty: s.productIngredient.qtyPerUnit,
    name: s.ingredient.name,
    unit: s.ingredient.unit,
  })
    .from(s.productIngredient)
    .innerJoin(s.ingredient, eq(s.ingredient.id, s.productIngredient.ingredientId))
    .all();
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    priceCents: p.priceCents,
    isAvailable: !!p.isAvailable,
    ingredients: recipes
      .filter((r) => r.productId === p.id)
      .map((r) => ({ name: r.name, qty: r.qty, unit: r.unit })),
  }));
}

export interface EmailThreadRow {
  threadId: number;
  subject: string;
  vendorName: string | null;
  createdDay: number;
  messageCount: number;
  lastMessage: string;
  lastSentDay: number;
  lastSentSegment: string;
}

export function getEmailThreads(shopId: number): EmailThreadRow[] {
  const threads = db.select().from(s.emailThread).where(eq(s.emailThread.shopId, shopId)).orderBy(desc(s.emailThread.id)).all();
  const out: EmailThreadRow[] = [];
  for (const t of threads) {
    const vendor = t.vendorId ? db.select().from(s.vendor).where(eq(s.vendor.id, t.vendorId)).get() : null;
    const messages = db.select().from(s.email).where(eq(s.email.threadId, t.id)).orderBy(desc(s.email.id)).all();
    const last = messages[0];
    out.push({
      threadId: t.id,
      subject: t.subject,
      vendorName: vendor?.name ?? null,
      createdDay: t.createdDay,
      messageCount: messages.length,
      lastMessage: last?.body ?? "",
      lastSentDay: last?.sentDay ?? t.createdDay,
      lastSentSegment: last?.sentSegment ?? "morning",
    });
  }
  return out;
}

export interface EmailMessageRow {
  id: number;
  threadId: number;
  fromAddr: string;
  toAddr: string;
  body: string;
  sentDay: number;
  sentSegment: string;
  attachedPurchaseOrderId: number | null;
  attachedPurchaseOrderTotal: number | null;
  attachedPurchaseOrderQty: number | null;
  attachedPurchaseOrderIngredient: string | null;
  attachedPurchaseOrderUnit: string | null;
}

export function getEmailThread(threadId: number): {
  thread: { id: number; subject: string; vendorName: string | null; shopId: number };
  messages: EmailMessageRow[];
} | null {
  const t = db.select().from(s.emailThread).where(eq(s.emailThread.id, threadId)).get();
  if (!t) return null;
  const vendor = t.vendorId ? db.select().from(s.vendor).where(eq(s.vendor.id, t.vendorId)).get() : null;
  const messages = db.select().from(s.email).where(eq(s.email.threadId, t.id)).all();
  const enriched: EmailMessageRow[] = messages.map((m) => {
    let totalCents: number | null = null;
    let qty: number | null = null;
    let ingredient: string | null = null;
    let unit: string | null = null;
    if (m.attachedPurchaseOrderId) {
      const po = db.select().from(s.purchaseOrder).where(eq(s.purchaseOrder.id, m.attachedPurchaseOrderId)).get();
      if (po) {
        totalCents = po.totalCents;
        qty = po.qty;
        const ing = db.select().from(s.ingredient).where(eq(s.ingredient.id, po.ingredientId)).get();
        ingredient = ing?.name ?? null;
        unit = ing?.unit ?? null;
      }
    }
    return {
      id: m.id, threadId: m.threadId, fromAddr: m.fromAddr, toAddr: m.toAddr,
      body: m.body, sentDay: m.sentDay, sentSegment: m.sentSegment,
      attachedPurchaseOrderId: m.attachedPurchaseOrderId,
      attachedPurchaseOrderTotal: totalCents,
      attachedPurchaseOrderQty: qty,
      attachedPurchaseOrderIngredient: ingredient,
      attachedPurchaseOrderUnit: unit,
    };
  });
  return { thread: { id: t.id, subject: t.subject, vendorName: vendor?.name ?? null, shopId: t.shopId }, messages: enriched };
}

export interface ProposalRow {
  id: number;
  shopId: number;
  agentName: string;
  kind: string; // "purchase_order" | "price_update"
  rationale: string;
  status: string;
  createdDay: number;
  createdSegment: string;
  // purchase_order fields (null for other kinds):
  ingredientName: string | null;
  ingredientUnit: string | null;
  vendorName: string | null;
  qty: number | null;
  unitPriceCents: number | null;
  totalCents: number | null;
  expectedDay: number | null;
  emailSubject: string | null;
  emailBody: string | null;
  // price_update fields (null for other kinds):
  productName: string | null;
  oldPriceCents: number | null;
  newPriceCents: number | null;
}

export function getProposals(shopId?: number): ProposalRow[] {
  const q = db.select().from(s.agentProposal);
  const rows = (shopId ? q.where(eq(s.agentProposal.shopId, shopId)) : q).orderBy(desc(s.agentProposal.id)).all();
  const out: ProposalRow[] = [];
  for (const p of rows) {
    const base = {
      id: p.id, shopId: p.shopId, agentName: p.agentName, kind: p.kind,
      rationale: p.rationale, status: p.status,
      createdDay: p.createdDay, createdSegment: p.createdSegment,
    };
    if (p.kind === "purchase_order") {
      const payload = p.payload as {
        ingredientId: number; vendorId: number; qty: number;
        unitPriceCents: number; totalCents: number; expectedDay: number;
        emailSubject?: string; emailBody?: string;
      };
      const ing = db.select().from(s.ingredient).where(eq(s.ingredient.id, payload.ingredientId)).get();
      const vendor = db.select().from(s.vendor).where(eq(s.vendor.id, payload.vendorId)).get();
      out.push({
        ...base,
        ingredientName: ing?.name ?? "?",
        ingredientUnit: ing?.unit ?? "",
        vendorName: vendor?.name ?? "?",
        qty: payload.qty,
        unitPriceCents: payload.unitPriceCents,
        totalCents: payload.totalCents,
        expectedDay: payload.expectedDay,
        emailSubject: payload.emailSubject ?? null,
        emailBody: payload.emailBody ?? null,
        productName: null, oldPriceCents: null, newPriceCents: null,
      });
    } else if (p.kind === "price_update") {
      const payload = p.payload as { productId: number; productName: string; oldPriceCents: number; newPriceCents: number };
      out.push({
        ...base,
        ingredientName: null, ingredientUnit: null, vendorName: null,
        qty: null, unitPriceCents: null, totalCents: null, expectedDay: null,
        emailSubject: null, emailBody: null,
        productName: payload.productName,
        oldPriceCents: payload.oldPriceCents,
        newPriceCents: payload.newPriceCents,
      });
    }
  }
  return out;
}

export const fmtUSD = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export interface DailySnapshotRow {
  day: number;
  cashCents: number;
  revenueCents: number;
  cogsCents: number;
  wagesCents: number;
  netCents: number;
  fulfilledOrders: number;
  failedOrders: number;
  fulfillmentRate: number;
  avgRating: number | null;
}

export function getDailySnapshots(shopId: number, limit: number = 14): DailySnapshotRow[] {
  return db.select().from(s.dailySnapshot)
    .where(eq(s.dailySnapshot.shopId, shopId))
    .orderBy(s.dailySnapshot.day)
    .all()
    .slice(-limit);
}

// Tiny ticker payload — last N days of net (or cash) for sparkline + day-over-day delta.
export interface TickerPayload {
  shopId: number;
  series: { day: number; net: number; cash: number }[];
  // Most recent two days' net for a "stock-style" change indicator.
  latestNet: number | null;
  prevNet: number | null;
  netChangePct: number | null; // null if no prior day
}

export function getTicker(shopId: number, days: number = 7): TickerPayload {
  const snaps = getDailySnapshots(shopId, days);
  const series = snaps.map((s) => ({ day: s.day, net: s.netCents, cash: s.cashCents }));
  const latestNet = snaps.length > 0 ? snaps[snaps.length - 1].netCents : null;
  const prevNet = snaps.length > 1 ? snaps[snaps.length - 2].netCents : null;
  let netChangePct: number | null = null;
  if (latestNet != null && prevNet != null && prevNet !== 0) {
    netChangePct = ((latestNet - prevNet) / Math.abs(prevNet)) * 100;
  }
  return { shopId, series, latestNet, prevNet, netChangePct };
}

// Vendor catalog — every offering with cheapest/fastest flags per ingredient.
export interface VendorCatalogRow {
  vendorId: number;
  vendorName: string;
  vendorEmail: string;
  leadTimeDays: number;
  reliability: number;
  ingredientId: number;
  ingredientName: string;
  ingredientUnit: string;
  unitPriceCents: number;
  moq: number;
  isCheapestForIngredient: boolean;
  isFastestForIngredient: boolean;
  isMostReliableForIngredient: boolean;
}

export function getVendorCatalog(): VendorCatalogRow[] {
  const offerings = db.select({
    vendorId: s.vendorIngredient.vendorId,
    vendorName: s.vendor.name,
    vendorEmail: s.vendor.email,
    leadTimeDays: s.vendor.leadTimeDays,
    reliability: s.vendor.reliability,
    ingredientId: s.vendorIngredient.ingredientId,
    ingredientName: s.ingredient.name,
    ingredientUnit: s.ingredient.unit,
    unitPriceCents: s.vendorIngredient.unitPriceCents,
    moq: s.vendorIngredient.moq,
  })
    .from(s.vendorIngredient)
    .innerJoin(s.vendor, eq(s.vendor.id, s.vendorIngredient.vendorId))
    .innerJoin(s.ingredient, eq(s.ingredient.id, s.vendorIngredient.ingredientId))
    .all();

  // Per ingredient: which vendor is cheapest / fastest / most reliable?
  const byIngredient = new Map<number, typeof offerings>();
  for (const o of offerings) {
    const arr = byIngredient.get(o.ingredientId) ?? [];
    arr.push(o);
    byIngredient.set(o.ingredientId, arr);
  }
  const cheapest = new Map<number, number>(); // ingredientId → vendorId
  const fastest = new Map<number, number>();
  const reliable = new Map<number, number>();
  for (const [ingId, list] of byIngredient.entries()) {
    cheapest.set(ingId, list.reduce((min, o) => o.unitPriceCents < min.unitPriceCents ? o : min, list[0]).vendorId);
    fastest.set(ingId, list.reduce((min, o) => o.leadTimeDays < min.leadTimeDays ? o : min, list[0]).vendorId);
    reliable.set(ingId, list.reduce((max, o) => o.reliability > max.reliability ? o : max, list[0]).vendorId);
  }

  return offerings.map((o) => ({
    ...o,
    isCheapestForIngredient: cheapest.get(o.ingredientId) === o.vendorId,
    isFastestForIngredient: fastest.get(o.ingredientId) === o.vendorId,
    isMostReliableForIngredient: reliable.get(o.ingredientId) === o.vendorId,
  })).sort((a, b) => a.ingredientName.localeCompare(b.ingredientName) || a.unitPriceCents - b.unitPriceCents);
}

// Plain-English label + one-line description for each strategy.
export const STRATEGY_META: Record<string, { label: string; emoji: string; blurb: string }> = {
  aggressive_stocker: { label: "Stockpile",       emoji: "", blurb: "Orders generously to avoid stockouts; tolerates perishable waste." },
  lean_operator:      { label: "Lean inventory",  emoji: "", blurb: "Minimum stock and staff. Prioritizes cash runway over fill rate." },
  premium_pricer:     { label: "Premium",         emoji: "", blurb: "Prices set 25% above market; uses premium vendors only." },
  volume_king:        { label: "High volume",     emoji: "", blurb: "Prices set 15% below market; runs max staffing for throughput." },
  human:              { label: "Manual",          emoji: "", blurb: "Operator-controlled. Agents draft reorders and vendor emails; you approve, reject, or override." },
};
