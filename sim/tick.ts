import { db, schema as s } from "../db/client.ts";
import { eq, and, gt, sql, asc, desc } from "drizzle-orm";
import {
  PED_FLOW_PER_SEGMENT,
  COFFEE_INTENT_BY_SEGMENT,
  expectedWaitSeconds,
  serviceCapacityPerSegment,
  SEGMENT_ORDER,
  shopCaptureScore,
  type Segment,
} from "./pedestrian.ts";
import { generateReview } from "./review.ts";
import { proposeReorders, approveProposal } from "./agent.ts";
import { proposePriceChanges } from "./pricing-agent.ts";

// Knuth's Poisson sampler — fine for our λ ranges.
function poisson(lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

// $54/segment × 4 segments = $216/day per staffer (~$11/hr — NYC barista)
const WAGE_CENTS_PER_STAFF_PER_SEGMENT = 5400;

export interface ShopTickResult {
  shopId: number;
  shopName: string;
  arrivals: number;
  fulfilled: number;
  stockouts: number;
  balkedWait: number;
  balkedPrice: number;
  productOff: number;
  revenueCents: number;
  cogsCents: number;
  wagesCents: number;
  cashAfterCents: number;
  expiredBatches: number;
}

export interface TickResult {
  day: number;
  segment: Segment;
  totalArrivals: number;
  perShop: ShopTickResult[];
}

// ----------------------------------------------------------------------------
// Per-shop helpers (read-only setup before customer loop).
// ----------------------------------------------------------------------------

interface ShopContext {
  shop: { id: number; name: string; staffCount: number; cashCents: number };
  products: { id: number; name: string; priceCents: number; isAvailable: boolean }[];
  availableProducts: { id: number; name: string; priceCents: number; isAvailable: boolean }[];
  productByName: Map<string, { id: number; name: string; priceCents: number; isAvailable: boolean }>;
  productById: Map<number, { id: number; name: string; priceCents: number; isAvailable: boolean }>;
  recipeByProduct: Map<number, { ingredientId: number; qtyPerUnit: number }[]>;
  tapSuppliedIngredientIds: Set<number>;
  menuPriceIndexCents: number;
  avgStars: number | null;
  capacity: number;
  arrivalsSoFar: number;
  fulfilled: number;
  stockouts: number;
  balkedWait: number;
  balkedPrice: number;
  productOff: number;
  revenueCents: number;
  cogsCents: number;
  expiredBatches: number;
}

function prepShop(
  shop: { id: number; name: string; staffCount: number; cashCents: number },
  currentDay: number,
): ShopContext {
  // Deliveries arriving this tick → batches.
  const arrivals_po = db.select().from(s.purchaseOrder).where(
    and(
      eq(s.purchaseOrder.shopId, shop.id),
      eq(s.purchaseOrder.status, "in_transit"),
      sql`${s.purchaseOrder.expectedDay} <= ${currentDay}`,
    ),
  ).all();
  for (const po of arrivals_po) {
    const ingr = db.select().from(s.ingredient).where(eq(s.ingredient.id, po.ingredientId)).get();
    if (!ingr) continue;
    db.update(s.purchaseOrder).set({ status: "delivered" }).where(eq(s.purchaseOrder.id, po.id)).run();
    db.insert(s.inventoryBatch).values({
      shopId: shop.id,
      ingredientId: po.ingredientId,
      purchaseOrderId: po.id,
      initialQty: po.qty,
      remainingQty: po.qty,
      deliveredDay: currentDay,
      expiresDay: currentDay + ingr.shelfLifeDays,
    }).run();
  }

  // Expire batches.
  const expired = db.update(s.inventoryBatch).set({ remainingQty: 0 }).where(
    and(
      eq(s.inventoryBatch.shopId, shop.id),
      gt(s.inventoryBatch.remainingQty, 0),
      sql`${s.inventoryBatch.expiresDay} <= ${currentDay}`,
    ),
  ).returning({ id: s.inventoryBatch.id }).all();

  // Products / recipes.
  const products = db.select().from(s.product).where(eq(s.product.shopId, shop.id)).all().map((p) => ({
    id: p.id, name: p.name, priceCents: p.priceCents, isAvailable: !!p.isAvailable,
  }));
  const availableProducts = products.filter((p) => p.isAvailable);
  const menuPriceIndexCents = availableProducts.length === 0
    ? 9999
    : Math.round(availableProducts.reduce((a, p) => a + p.priceCents, 0) / availableProducts.length);

  const recipeRows = db.select().from(s.productIngredient).all();
  const recipeByProduct = new Map<number, { ingredientId: number; qtyPerUnit: number }[]>();
  for (const r of recipeRows) {
    const list = recipeByProduct.get(r.productId) ?? [];
    list.push({ ingredientId: r.ingredientId, qtyPerUnit: r.qtyPerUnit });
    recipeByProduct.set(r.productId, list);
  }

  // Sentiment.
  const recentReviews = db.select({ stars: s.review.stars }).from(s.review)
    .where(eq(s.review.shopId, shop.id)).orderBy(desc(s.review.id)).limit(50).all();
  const avgStars = recentReviews.length === 0 ? null
    : recentReviews.reduce((a, r) => a + r.stars, 0) / recentReviews.length;

  // Tap-supplied ingredients (water, ice) bypass the inventory gate.
  const tapSuppliedIngredientIds = new Set<number>(
    db.select({ id: s.ingredient.id }).from(s.ingredient).where(eq(s.ingredient.isTapSupplied, true)).all().map((r) => r.id),
  );

  return {
    shop,
    products,
    availableProducts,
    productByName: new Map(products.map((p) => [p.name, p])),
    productById: new Map(products.map((p) => [p.id, p])),
    recipeByProduct,
    tapSuppliedIngredientIds,
    menuPriceIndexCents,
    avgStars,
    capacity: serviceCapacityPerSegment(shop.staffCount),
    arrivalsSoFar: 0,
    fulfilled: 0, stockouts: 0, balkedWait: 0, balkedPrice: 0, productOff: 0,
    revenueCents: 0, cogsCents: 0,
    expiredBatches: expired.length,
  };
}

// ----------------------------------------------------------------------------
// Service one customer at a chosen shop.
// ----------------------------------------------------------------------------

interface CustomerRow {
  id: number;
  name: string;
  preferredProductName: string | null;
  priceSensitivity: number;
  patience: number;
}

function serviceCustomer(
  ctx: ShopContext,
  customer: CustomerRow,
  state: { day: number; segment: string },
): void {
  const arrivalIdx = ctx.arrivalsSoFar++;

  const preferred = customer.preferredProductName ? ctx.productByName.get(customer.preferredProductName) : undefined;
  const wantedProduct = preferred ?? ctx.availableProducts[Math.floor(Math.random() * ctx.availableProducts.length)];

  if (!wantedProduct || !wantedProduct.isAvailable) {
    db.insert(s.customerOrder).values({
      shopId: ctx.shop.id,
      customerId: customer.id,
      productId: wantedProduct?.id ?? null,
      day: state.day,
      segment: state.segment,
      status: "product_off",
    }).run();
    ctx.productOff++;
    return;
  }

  // Price gate. Each customer has a willingness-to-pay (~$5–$11 around the
  // ~$3.50 reference). Acceptance is a steep logistic centered at WTP, so
  // prices well above WTP crash demand to ~zero — an $80 latte sells nothing.
  const reference = 400 * (1 - 0.4 * customer.priceSensitivity);
  const wtpCents = reference * (3.5 - 2 * customer.priceSensitivity);
  const x = wantedProduct.priceCents / wtpCents;
  const acceptProb = 1 / (1 + Math.exp(8 * (x - 1)));
  if (Math.random() > acceptProb) {
    db.insert(s.customerOrder).values({
      shopId: ctx.shop.id,
      customerId: customer.id,
      productId: wantedProduct.id,
      day: state.day,
      segment: state.segment,
      status: "balked_price",
    }).run();
    ctx.balkedPrice++;
    return;
  }

  // Wait gate.
  // We don't know "totalArrivals" upfront for this shop in the multi-team flow,
  // so estimate based on capacity utilisation: if arrivalIdx > capacity, wait blows up.
  const expWait = expectedWaitSeconds(arrivalIdx, Math.max(arrivalIdx + 1, ctx.capacity), ctx.capacity);
  const tolerance = 60 + customer.patience * 540;
  if (expWait > tolerance) {
    db.insert(s.customerOrder).values({
      shopId: ctx.shop.id,
      customerId: customer.id,
      productId: wantedProduct.id,
      day: state.day,
      segment: state.segment,
      status: "balked_wait",
      waitSeconds: Math.round(expWait),
    }).run();
    ctx.balkedWait++;
    return;
  }

  // Inventory gate (FEFO).
  const recipe = ctx.recipeByProduct.get(wantedProduct.id) ?? [];
  const depletions: { batchId: number; take: number; unitPriceCents: number | null }[] = [];
  let stockedOut = false;
  let stockoutIngredientId: number | null = null;
  let orderCogsCents = 0;

  for (const r of recipe) {
    // Tap water and ice maker — never depletes, no COGS.
    if (ctx.tapSuppliedIngredientIds.has(r.ingredientId)) continue;

    const batches = db.select({
      id: s.inventoryBatch.id,
      remaining: s.inventoryBatch.remainingQty,
      expires: s.inventoryBatch.expiresDay,
      poId: s.inventoryBatch.purchaseOrderId,
    }).from(s.inventoryBatch).where(
      and(
        eq(s.inventoryBatch.shopId, ctx.shop.id),
        eq(s.inventoryBatch.ingredientId, r.ingredientId),
        gt(s.inventoryBatch.remainingQty, 0),
        gt(s.inventoryBatch.expiresDay, state.day - 1),
      ),
    ).orderBy(asc(s.inventoryBatch.expiresDay)).all();

    let needed = r.qtyPerUnit;
    for (const b of batches) {
      if (needed <= 0) break;
      const take = Math.min(needed, b.remaining);
      let unitPrice: number | null = null;
      if (b.poId) {
        const po = db.select({ unitPriceCents: s.purchaseOrder.unitPriceCents })
          .from(s.purchaseOrder).where(eq(s.purchaseOrder.id, b.poId)).get();
        unitPrice = po?.unitPriceCents ?? null;
      }
      depletions.push({ batchId: b.id, take, unitPriceCents: unitPrice });
      if (unitPrice != null) orderCogsCents += take * unitPrice;
      needed -= take;
    }
    if (needed > 0) { stockedOut = true; stockoutIngredientId = r.ingredientId; break; }
  }

  if (stockedOut) {
    const [orderRow] = db.insert(s.customerOrder).values({
      shopId: ctx.shop.id,
      customerId: customer.id,
      productId: wantedProduct.id,
      day: state.day,
      segment: state.segment,
      status: "stockout",
      waitSeconds: Math.round(expWait),
      stockoutIngredientId,
    }).returning().all();
    ctx.stockouts++;
    // Stockout customers post angry reviews; rate dialed down so they don't
    // dominate the aggregate rating.
    if (Math.random() < 0.3) {
      const ingName = stockoutIngredientId
        ? db.select({ n: s.ingredient.name }).from(s.ingredient).where(eq(s.ingredient.id, stockoutIngredientId)).get()?.n ?? undefined
        : undefined;
      const review = generateReview({
        productName: wantedProduct.name,
        customerName: customer.name,
        waitSeconds: Math.round(expWait),
        priceCents: wantedProduct.priceCents,
        status: "stockout",
        loadRatio: arrivalIdx / Math.max(ctx.capacity, 1),
        staffCount: ctx.shop.staffCount,
        stockoutIngredientName: ingName ?? undefined,
      }, state.segment as Segment);
      db.insert(s.review).values({
        shopId: ctx.shop.id,
        customerOrderId: orderRow.id,
        customerId: customer.id,
        stars: review.stars,
        body: review.body,
        day: state.day,
        segment: state.segment,
      }).run();
    }
    return;
  }

  for (const d of depletions) {
    db.update(s.inventoryBatch)
      .set({ remainingQty: sql`${s.inventoryBatch.remainingQty} - ${d.take}` })
      .where(eq(s.inventoryBatch.id, d.batchId))
      .run();
  }

  const [orderRow] = db.insert(s.customerOrder).values({
    shopId: ctx.shop.id,
    customerId: customer.id,
    productId: wantedProduct.id,
    day: state.day,
    segment: state.segment,
    status: "fulfilled",
    waitSeconds: Math.round(expWait),
    priceCentsPaid: wantedProduct.priceCents,
    cogsCents: Math.round(orderCogsCents),
  }).returning().all();

  // ~50% of fulfilled customers post a review. Higher than real-world Yelp
  // (where mostly the unhappy ones bother), but the demo wants ratings to
  // settle in the 4.5–4.7 range rather than skewing toward the unhappy tail.
  if (Math.random() < 0.5) {
    const review = generateReview({
      productName: wantedProduct.name,
      customerName: customer.name,
      waitSeconds: Math.round(expWait),
      priceCents: wantedProduct.priceCents,
      status: "fulfilled",
      loadRatio: arrivalIdx / Math.max(ctx.capacity, 1),
      staffCount: ctx.shop.staffCount,
    }, state.segment as Segment);
    db.insert(s.review).values({
      shopId: ctx.shop.id,
      customerOrderId: orderRow.id,
      customerId: customer.id,
      stars: review.stars,
      body: review.body,
      day: state.day,
      segment: state.segment,
    }).run();
  }

  ctx.fulfilled++;
  ctx.revenueCents += wantedProduct.priceCents;
  ctx.cogsCents += orderCogsCents;
}

// ----------------------------------------------------------------------------
// Tick — orchestrates one (day, segment) for all shops.
// ----------------------------------------------------------------------------

export function tick(): TickResult {
  return db.transaction(() => {
    const state = db.select().from(s.simState).where(eq(s.simState.id, 1)).get();
    if (!state) throw new Error("simState row missing — run db:seed");
    const segment = state.segment as Segment;

    const shops = db.select().from(s.shop).all();
    if (shops.length === 0) throw new Error("no shops — run db:seed");

    const ctxs = shops.map((shop) => prepShop(shop, state.day));

    // Compute total customers entering the Times Square coffee market this segment.
    // Independent of shop reputation — total intent is a property of the location.
    // The 12% base capture rate represents pedestrians who'd consider stopping at
    // *any* of the shops on this corner; they then pick one based on price + sentiment.
    const flow = PED_FLOW_PER_SEGMENT[segment];
    const intent = COFFEE_INTENT_BY_SEGMENT[segment];
    const baseCapture = 0.16;
    const lambda = flow * intent * baseCapture;
    const totalArrivals = poisson(lambda);

    // Per-customer loop: pick a shop via softmax over capture scores, then service.
    const customers = db.select().from(s.customer).all();
    if (customers.length === 0) throw new Error("no customers — run db:seed");

    for (let i = 0; i < totalArrivals; i++) {
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const scores = ctxs.map((ctx) => shopCaptureScore({
        avgStars: ctx.avgStars,
        menuPriceIndexCents: ctx.menuPriceIndexCents,
        priceSensitivity: customer.priceSensitivity,
      }));
      const total = scores.reduce((a, b) => a + b, 0);
      let pick = Math.random() * total;
      let chosenIdx = 0;
      for (let j = 0; j < scores.length; j++) {
        pick -= scores[j];
        if (pick <= 0) { chosenIdx = j; break; }
      }
      serviceCustomer(ctxs[chosenIdx], customer, state);
    }

    // Wages + cash per shop.
    const perShop: ShopTickResult[] = [];
    for (const ctx of ctxs) {
      const wagesCents = WAGE_CENTS_PER_STAFF_PER_SEGMENT * ctx.shop.staffCount;
      const netCents = ctx.revenueCents - ctx.cogsCents - wagesCents;
      db.update(s.shop).set({ cashCents: sql`${s.shop.cashCents} + ${netCents}` })
        .where(eq(s.shop.id, ctx.shop.id)).run();
      const cashAfter = db.select({ c: s.shop.cashCents }).from(s.shop)
        .where(eq(s.shop.id, ctx.shop.id)).get()!.c;
      perShop.push({
        shopId: ctx.shop.id,
        shopName: ctx.shop.name,
        arrivals: ctx.arrivalsSoFar,
        fulfilled: ctx.fulfilled,
        stockouts: ctx.stockouts,
        balkedWait: ctx.balkedWait,
        balkedPrice: ctx.balkedPrice,
        productOff: ctx.productOff,
        revenueCents: ctx.revenueCents,
        cogsCents: ctx.cogsCents,
        wagesCents,
        cashAfterCents: cashAfter,
        expiredBatches: ctx.expiredBatches,
      });
    }

    // Advance time.
    const nextSegmentIdx = (SEGMENT_ORDER.indexOf(segment) + 1) % SEGMENT_ORDER.length;
    const nextSegment = SEGMENT_ORDER[nextSegmentIdx];
    const nextDay = nextSegmentIdx === 0 ? state.day + 1 : state.day;
    db.update(s.simState).set({ day: nextDay, segment: nextSegment }).where(eq(s.simState.id, 1)).run();

    // ---- End-of-day snapshot for ticker / metrics tab ----
    if (segment === "night") {
      for (const ctx of ctxs) {
        const sh = ctx.shop;
        // Aggregate today's orders for fulfillment rate calculation.
        const dayCounts = db.select({
          status: s.customerOrder.status,
          c: sql<number>`COUNT(*)`,
          rev: sql<number>`COALESCE(SUM(${s.customerOrder.priceCentsPaid}), 0)`,
          cogs: sql<number>`COALESCE(SUM(${s.customerOrder.cogsCents}), 0)`,
        })
          .from(s.customerOrder)
          .where(and(eq(s.customerOrder.shopId, sh.id), eq(s.customerOrder.day, state.day)))
          .groupBy(s.customerOrder.status)
          .all();
        const ful = Number(dayCounts.find((c) => c.status === "fulfilled")?.c ?? 0);
        const fail = dayCounts.filter((c) => c.status !== "fulfilled").reduce((a, c) => a + Number(c.c), 0);
        const total = ful + fail;
        const dayRev = Number(dayCounts.find((c) => c.status === "fulfilled")?.rev ?? 0);
        const dayCogs = Number(dayCounts.find((c) => c.status === "fulfilled")?.cogs ?? 0);
        const dayWages = WAGE_CENTS_PER_STAFF_PER_SEGMENT * sh.staffCount * SEGMENT_ORDER.length;
        const recentReviews = db.select({ stars: s.review.stars }).from(s.review)
          .where(and(eq(s.review.shopId, sh.id), eq(s.review.day, state.day))).all();
        const avgRating = recentReviews.length === 0 ? null
          : recentReviews.reduce((a, r) => a + r.stars, 0) / recentReviews.length;
        const cashAfter = db.select({ c: s.shop.cashCents }).from(s.shop).where(eq(s.shop.id, sh.id)).get()!.c;
        db.insert(s.dailySnapshot).values({
          shopId: sh.id,
          day: state.day,
          cashCents: cashAfter,
          revenueCents: dayRev,
          cogsCents: dayCogs,
          wagesCents: dayWages,
          netCents: dayRev - dayCogs - dayWages,
          fulfilledOrders: ful,
          failedOrders: fail,
          fulfillmentRate: total === 0 ? 1 : ful / total,
          avgRating,
        }).run();
      }
    }

    // ---- Auto-fire heuristic agents for every shop ----
    // Reorder agent runs every tick. Pricing agent runs once per day (at night)
    // so we don't churn prices every 6 sim hours. Heuristics are idempotent
    // (skip ingredients/products with pending proposals), so they build a
    // rolling recommendation set the operator can review at any moment.
    // For autoApprove teams, also approve everything pending immediately.
    // Bankrupt shops (cash < 0) skip the whole loop — strategy paused.
    const isEndOfDay = segment === "night";
    for (const shop of shops) {
      const fresh = db.select({ c: s.shop.cashCents }).from(s.shop).where(eq(s.shop.id, shop.id)).get();
      if (fresh && fresh.c < 0) continue;
      try { proposeReorders(shop.id); } catch {}
      if (isEndOfDay) {
        try { proposePriceChanges(shop.id); } catch {}
      }
      if (shop.autoApprove) {
        const pending = db.select().from(s.agentProposal)
          .where(and(eq(s.agentProposal.shopId, shop.id), eq(s.agentProposal.status, "pending"))).all();
        for (const p of pending) {
          try { approveProposal(p.id); } catch {}
        }
      }
    }

    return { day: state.day, segment, totalArrivals, perShop };
  });
}
