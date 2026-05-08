// Reorder agent — the AIP-style "Logic Function" that proposes purchase orders.
//
// v1: pure heuristic. Reads ontology, projects demand, picks vendor + qty,
// emits an `agent_proposal` row. Identical interface and side-effects as the
// future LLM version, so the swap is just replacing `decide()` internals.

import { db, schema as s } from "../db/client.ts";
import { eq, and, gt, sql, desc } from "drizzle-orm";

export interface ReorderDecision {
  ingredientName: string;
  ingredientId: number;
  currentQty: number;
  inTransitQty: number;
  dailyConsumption: number;
  daysOfStock: number;
  vendorId: number;
  vendorName: string;
  vendorEmail: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  expectedDay: number;
  rationale: string;
}

const SAFETY_DAYS = 1;          // buffer above lead time
const TARGET_DAYS = 7;          // aim for 1 week of stock when reordering
const PERISHABLE_SHELF_DAYS = 5; // below this, treat as perishable and cap
const PERISHABLE_CAP_DAYS = 3;   // perishables: don't order more than 3 days' worth
const MAX_DAYS_NONPERISHABLE = 14; // even non-perishables: don't order >2 weeks
                                  // (NYC storage is tight — no year-of-cups orders)

export function proposeReorders(shopId: number): { proposals: number; decisions: ReorderDecision[] } {
  return db.transaction(() => {
    const state = db.select().from(s.simState).where(eq(s.simState.id, 1)).get();
    if (!state) throw new Error("simState missing");
    const shop = db.select().from(s.shop).where(eq(s.shop.id, shopId)).get();
    if (!shop) throw new Error(`no shop with id=${shopId}`);

    const ingredients = db.select().from(s.ingredient).all();
    const offerings = db.select().from(s.vendorIngredient).all();
    const vendors = new Map(db.select().from(s.vendor).all().map((v) => [v.id, v]));

    // Storage usage = sum(remainingQty × storageWeight) across all unexpired batches.
    const usedStorage = computeUsedStorage(shop.id, state.day, ingredients);
    let availableStorage = Math.max(0, shop.storageCapacityUnits - usedStorage);
    // Subtract storage already promised to in-transit POs.
    const inTransitPOs = db.select().from(s.purchaseOrder)
      .where(and(eq(s.purchaseOrder.shopId, shop.id), eq(s.purchaseOrder.status, "in_transit"))).all();
    for (const po of inTransitPOs) {
      const ing = ingredients.find((i) => i.id === po.ingredientId);
      if (ing) availableStorage -= po.qty * ing.storageWeight;
    }
    availableStorage = Math.max(0, availableStorage);

    // Skip ingredients we already have a pending proposal for — dedupe so the
    // auto-fire on every tick doesn't pile up duplicate suggestions.
    const pendingProposals = db.select().from(s.agentProposal).where(
      and(eq(s.agentProposal.shopId, shop.id), eq(s.agentProposal.status, "pending")),
    ).all();
    const pendingIngredientIds = new Set<number>(
      pendingProposals
        .filter((p) => p.kind === "purchase_order")
        .map((p) => (p.payload as { ingredientId: number }).ingredientId),
    );

    // Daily consumption: ingredient → qty consumed per fulfilled order (yesterday).
    // First sim day will have no prior consumption — fall back to small priors below.
    const yesterday = state.day - 1;
    const consumed = db
      .select({
        ingredientId: s.productIngredient.ingredientId,
        used: sql<number>`SUM(${s.productIngredient.qtyPerUnit})`.as("used"),
      })
      .from(s.customerOrder)
      .innerJoin(s.productIngredient, eq(s.productIngredient.productId, s.customerOrder.productId))
      .where(
        and(
          eq(s.customerOrder.shopId, shop.id),
          eq(s.customerOrder.status, "fulfilled"),
          eq(s.customerOrder.day, yesterday),
        ),
      )
      .groupBy(s.productIngredient.ingredientId)
      .all();
    const consumedById = new Map<number, number>(
      consumed.map((r) => [r.ingredientId, Number(r.used) || 0]),
    );

    const decisions: ReorderDecision[] = [];

    // Cumulative committed spend across this proposeReorders call. Each iteration
    // checks against (cash - committed) so we don't over-allocate within one tick.
    let committedSpendCents = 0;

    for (const ingr of ingredients) {
      // Tap-supplied (water, ice) — never reorder.
      if (ingr.isTapSupplied) continue;
      // Skip if a pending proposal already covers this ingredient.
      if (pendingIngredientIds.has(ingr.id)) continue;

      // Current qty = sum of unexpired remaining across batches.
      const cur = db
        .select({ q: sql<number>`COALESCE(SUM(${s.inventoryBatch.remainingQty}), 0)` })
        .from(s.inventoryBatch)
        .where(
          and(
            eq(s.inventoryBatch.shopId, shop.id),
            eq(s.inventoryBatch.ingredientId, ingr.id),
            gt(s.inventoryBatch.expiresDay, state.day - 1),
          ),
        )
        .get();
      const currentQty = Number(cur?.q ?? 0);

      // Already-ordered qty in flight.
      const it = db
        .select({ q: sql<number>`COALESCE(SUM(${s.purchaseOrder.qty}), 0)` })
        .from(s.purchaseOrder)
        .where(
          and(
            eq(s.purchaseOrder.shopId, shop.id),
            eq(s.purchaseOrder.ingredientId, ingr.id),
            eq(s.purchaseOrder.status, "in_transit"),
          ),
        )
        .get();
      const inTransitQty = Number(it?.q ?? 0);

      // Consumption: yesterday's actual, with a tiny prior so day-1 still works.
      const prior = priorDailyConsumption(ingr.name);
      const dailyConsumption = consumedById.get(ingr.id) ?? prior;
      if (dailyConsumption <= 0) continue;

      const effectiveStock = currentQty + inTransitQty;
      const daysOfStock = effectiveStock / dailyConsumption;

      // Eligible vendors.
      const eligible = offerings.filter((o) => o.ingredientId === ingr.id);
      if (eligible.length === 0) continue;

      // Pick vendor: cheapest one whose lead time keeps us above zero.
      // If none viable, pick fastest.
      const ranked = eligible
        .map((o) => ({ o, vendor: vendors.get(o.vendorId)! }))
        .filter((x) => x.vendor != null);
      const viable = ranked.filter((x) => x.vendor.leadTimeDays + SAFETY_DAYS <= daysOfStock + 365);
      const candidates = viable.length > 0 ? viable : ranked;
      // Strategy-aware vendor preference. Each shop's strategy biases the sort
      // so we don't end up with every team buying from the cheapest two vendors.
      candidates.sort((a, b) => {
        // Urgent: speed wins regardless of strategy.
        if (daysOfStock <= 1) return a.vendor.leadTimeDays - b.vendor.leadTimeDays;
        switch (shop.agentStrategy) {
          case "premium_pricer":
            // Reliability first, lead time tiebreak. Drives spend toward
            // Counter Culture / Hudson Valley / Ronnybrook / Greenline.
            if (a.vendor.reliability !== b.vendor.reliability) return b.vendor.reliability - a.vendor.reliability;
            return a.vendor.leadTimeDays - b.vendor.leadTimeDays;
          case "aggressive_stocker":
            // Speed first (smaller MOQ helps land inventory in tight storage).
            if (a.vendor.leadTimeDays !== b.vendor.leadTimeDays) return a.vendor.leadTimeDays - b.vendor.leadTimeDays;
            return a.o.moq - b.o.moq;
          case "volume_king":
            // Bulk MOQ wins (cheaper per unit at scale), price tiebreak.
            if (a.o.moq !== b.o.moq) return b.o.moq - a.o.moq;
            return a.o.unitPriceCents - b.o.unitPriceCents;
          case "lean_operator":
          case "human":
          default:
            // Cheapest, lead time tiebreak.
            if (a.o.unitPriceCents !== b.o.unitPriceCents) return a.o.unitPriceCents - b.o.unitPriceCents;
            return a.vendor.leadTimeDays - b.vendor.leadTimeDays;
        }
      });
      const pick = candidates[0];

      // Reorder threshold: stock will run out before next viable delivery.
      const willStockOut = daysOfStock < pick.vendor.leadTimeDays + SAFETY_DAYS;
      if (!willStockOut) continue;

      // Qty: cover TARGET_DAYS of consumption, rounded up to MOQ, capped for perishables
      // and capped at 14 days even for non-perishables (NYC storage is tight).
      const targetDays = ingr.shelfLifeDays < PERISHABLE_SHELF_DAYS
        ? PERISHABLE_CAP_DAYS
        : Math.min(TARGET_DAYS, MAX_DAYS_NONPERISHABLE);
      const targetQty = Math.ceil(targetDays * dailyConsumption);
      const moqRounded = Math.ceil(targetQty / pick.o.moq) * pick.o.moq;
      // Perishable cap: don't let MOQ force us above the shelf life.
      if (ingr.shelfLifeDays < PERISHABLE_SHELF_DAYS) {
        const moqDays = moqRounded / dailyConsumption;
        if (moqDays > ingr.shelfLifeDays) continue;
      }

      // Storage cap: don't order more than fits in the back room.
      const wouldUseStorage = moqRounded * ingr.storageWeight;
      if (wouldUseStorage > availableStorage) {
        // Try a smaller order: largest MOQ multiple that fits.
        const maxQtyByStorage = Math.floor(availableStorage / ingr.storageWeight);
        const downsized = Math.floor(maxQtyByStorage / pick.o.moq) * pick.o.moq;
        if (downsized < pick.o.moq) continue; // can't even fit one MOQ — skip
        // Use downsized qty
        const qty = downsized;
        const totalCents = qty * pick.o.unitPriceCents;
        const wageRunwayCents = 7 * 4 * 5400 * shop.staffCount;
        if (shop.cashCents - committedSpendCents - totalCents < wageRunwayCents) continue;
        committedSpendCents += totalCents;
        availableStorage -= qty * ingr.storageWeight;
        const expectedDay = state.day + pick.vendor.leadTimeDays;
        decisions.push({
          ingredientName: ingr.name, ingredientId: ingr.id,
          currentQty, inTransitQty, dailyConsumption, daysOfStock,
          vendorId: pick.vendor.id, vendorName: pick.vendor.name, vendorEmail: pick.vendor.email,
          qty, unitPriceCents: pick.o.unitPriceCents, totalCents, expectedDay,
          rationale: renderRationale({
            ingredient: ingr.name, currentQty, inTransitQty, dailyConsumption, daysOfStock,
            vendorName: pick.vendor.name, leadTimeDays: pick.vendor.leadTimeDays,
            unitPriceCents: pick.o.unitPriceCents, moq: pick.o.moq, qty, targetDays,
            perishable: ingr.shelfLifeDays < PERISHABLE_SHELF_DAYS, storageDownsized: true,
          }),
        });
        continue;
      }
      const qty = moqRounded;
      const totalCents = qty * pick.o.unitPriceCents;

      // Don't blow the bank: leave at least 1 week of wages in cash. Track cumulative
      // spend so multiple decisions in one call don't collectively over-allocate.
      const wageRunwayCents = 7 * 4 * 5400 * shop.staffCount;
      if (shop.cashCents - committedSpendCents - totalCents < wageRunwayCents) continue;
      committedSpendCents += totalCents;
      availableStorage -= wouldUseStorage;

      const expectedDay = state.day + pick.vendor.leadTimeDays;
      const rationale = renderRationale({
        ingredient: ingr.name,
        currentQty,
        inTransitQty,
        dailyConsumption,
        daysOfStock,
        vendorName: pick.vendor.name,
        leadTimeDays: pick.vendor.leadTimeDays,
        unitPriceCents: pick.o.unitPriceCents,
        moq: pick.o.moq,
        qty,
        targetDays,
        perishable: ingr.shelfLifeDays < PERISHABLE_SHELF_DAYS,
      });

      decisions.push({
        ingredientName: ingr.name,
        ingredientId: ingr.id,
        currentQty,
        inTransitQty,
        dailyConsumption,
        daysOfStock,
        vendorId: pick.vendor.id,
        vendorName: pick.vendor.name,
        vendorEmail: pick.vendor.email,
        qty,
        unitPriceCents: pick.o.unitPriceCents,
        totalCents,
        expectedDay,
        rationale,
      });
    }

    // Persist as agent proposals (status: pending).
    for (const d of decisions) {
      db.insert(s.agentProposal).values({
        shopId: shop.id,
        agentName: "reorder",
        kind: "purchase_order",
        payload: {
          ingredientId: d.ingredientId,
          vendorId: d.vendorId,
          qty: d.qty,
          unitPriceCents: d.unitPriceCents,
          totalCents: d.totalCents,
          expectedDay: d.expectedDay,
        },
        rationale: d.rationale,
        status: "pending",
        createdDay: state.day,
        createdSegment: state.segment,
      }).run();
    }

    return { proposals: decisions.length, decisions };
  });
}

// Approve a pending proposal: stage the PurchaseOrder, deduct cash, send email
// (for purchase_order proposals), or apply the price change (for price_update).
// This is the "Action" in AIP terms — the staged ontology edits go live.
export function approveProposal(proposalId: number): { ok: true; purchaseOrderId?: number; emailId?: number } {
  return db.transaction(() => {
    const p = db.select().from(s.agentProposal).where(eq(s.agentProposal.id, proposalId)).get();
    if (!p) throw new Error(`proposal ${proposalId} not found`);
    if (p.status !== "pending") throw new Error(`proposal ${proposalId} status=${p.status}`);

    if (p.kind === "price_update") {
      const payload = p.payload as { productId?: number; newPriceCents?: number };
      if (!payload || typeof payload.productId !== "number" || typeof payload.newPriceCents !== "number") {
        throw new Error(`malformed price_update payload (proposal ${p.id}): ${JSON.stringify(payload)}`);
      }
      const product = db.select().from(s.product).where(eq(s.product.id, payload.productId)).get();
      if (!product) throw new Error(`product ${payload.productId} not found (proposal ${p.id})`);
      db.update(s.product).set({ priceCents: Math.round(payload.newPriceCents) }).where(eq(s.product.id, payload.productId)).run();
      db.update(s.agentProposal).set({ status: "approved", decidedAt: new Date() }).where(eq(s.agentProposal.id, p.id)).run();
      return { ok: true as const };
    }

    if (p.kind !== "purchase_order") throw new Error(`unsupported proposal kind=${p.kind}`);

    const payload = p.payload as {
      ingredientId: number;
      vendorId: number;
      qty: number;
      unitPriceCents: number;
      totalCents: number;
      expectedDay: number;
      // LLM-agent proposals carry a pre-composed email; heuristic proposals don't.
      emailSubject?: string;
      emailBody?: string;
    };

    const state = db.select().from(s.simState).where(eq(s.simState.id, 1)).get()!;
    const shop = db.select().from(s.shop).where(eq(s.shop.id, p.shopId)).get()!;
    if (shop.cashCents < payload.totalCents) {
      throw new Error(`insufficient cash: have ${shop.cashCents}, need ${payload.totalCents}`);
    }

    const vendor = db.select().from(s.vendor).where(eq(s.vendor.id, payload.vendorId)).get()!;
    const ingr = db.select().from(s.ingredient).where(eq(s.ingredient.id, payload.ingredientId)).get()!;

    const [po] = db.insert(s.purchaseOrder).values({
      shopId: shop.id,
      vendorId: payload.vendorId,
      ingredientId: payload.ingredientId,
      qty: payload.qty,
      unitPriceCents: payload.unitPriceCents,
      totalCents: payload.totalCents,
      status: "in_transit",
      placedDay: state.day,
      expectedDay: payload.expectedDay,
      proposedByAgentId: p.id,
    }).returning().all();

    db.update(s.shop)
      .set({ cashCents: sql`${s.shop.cashCents} - ${payload.totalCents}` })
      .where(eq(s.shop.id, shop.id))
      .run();

    // Email to vendor (mirrors the demo's "Added: PurchaseOrder + Email" output).
    // Prefer the LLM-composed subject/body if the proposal carries one.
    const subject = payload.emailSubject ?? `Order #${po.id}: ${payload.qty} ${ingr.unit} ${ingr.name}`;
    const body = payload.emailBody ?? renderEmailBody({
      vendorName: vendor.name,
      shopName: shop.name,
      ingredientName: ingr.name,
      unit: ingr.unit,
      qty: payload.qty,
      unitPriceCents: payload.unitPriceCents,
      totalCents: payload.totalCents,
      expectedDay: payload.expectedDay,
    });
    const [thread] = db.insert(s.emailThread).values({
      shopId: shop.id,
      vendorId: vendor.id,
      subject,
      createdDay: state.day,
    }).returning().all();
    const [email] = db.insert(s.email).values({
      threadId: thread.id,
      fromAddr: `orders@${slug(shop.name)}.cafe`,
      toAddr: vendor.email,
      body,
      sentDay: state.day,
      sentSegment: state.segment,
      attachedPurchaseOrderId: po.id,
    }).returning().all();

    db.update(s.agentProposal)
      .set({ status: "approved", decidedAt: new Date() })
      .where(eq(s.agentProposal.id, p.id))
      .run();

    return { ok: true as const, purchaseOrderId: po.id, emailId: email.id };
  });
}

// ---------- helpers ----------

function priorDailyConsumption(ingredientName: string): number {
  // Tiny priors so the day-1 agent has *something* to act on. These are intentionally
  // conservative — the LLM version would derive these from menu + expected traffic.
  switch (ingredientName) {
    case "espresso_beans": return 5000; // 5kg/day implied by morning rush of ~250 drinks
    case "whole_milk":     return 30000;
    case "oat_milk":       return 8000;
    case "ice":            return 5000;
    case "water":          return 20000;
    case "small_cup":      return 50;
    case "large_cup":      return 250;
    case "lid":            return 300;
    case "chocolate_syrup":return 1000;
    case "vanilla_syrup":  return 500;
    default: return 0;
  }
}

function renderRationale(x: {
  ingredient: string; currentQty: number; inTransitQty: number;
  dailyConsumption: number; daysOfStock: number;
  vendorName: string; leadTimeDays: number; unitPriceCents: number; moq: number;
  qty: number; targetDays: number; perishable: boolean; storageDownsized?: boolean;
}): string {
  const lines = [
    `Ingredient: ${x.ingredient} (current ${Math.round(x.currentQty)}, in-transit ${x.inTransitQty}).`,
    `Yesterday's consumption ≈ ${Math.round(x.dailyConsumption)}/day → ${x.daysOfStock.toFixed(1)} days of stock.`,
    `Reorder threshold: stock < lead time (${x.leadTimeDays}d) + safety (${SAFETY_DAYS}d).`,
    `Chose ${x.vendorName} @ ${x.unitPriceCents}¢/unit, MOQ ${x.moq}.`,
    `Qty ${x.qty} = ${x.targetDays} days target × consumption, rounded up to MOQ${x.perishable ? " (perishable cap applied)" : ""}${x.storageDownsized ? " — downsized to fit remaining storage." : "."}`,
  ];
  return lines.join(" ");
}

// Storage usage = sum(remainingQty × storageWeight) across unexpired batches.
function computeUsedStorage(shopId: number, currentDay: number, ingredients: typeof s.ingredient.$inferSelect[]): number {
  const ingMap = new Map(ingredients.map((i) => [i.id, i]));
  const batches = db.select().from(s.inventoryBatch).where(
    and(eq(s.inventoryBatch.shopId, shopId), gt(s.inventoryBatch.remainingQty, 0), gt(s.inventoryBatch.expiresDay, currentDay - 1)),
  ).all();
  let total = 0;
  for (const b of batches) {
    const ing = ingMap.get(b.ingredientId);
    if (ing) total += b.remainingQty * ing.storageWeight;
  }
  return total;
}

function renderEmailBody(x: {
  vendorName: string; shopName: string;
  ingredientName: string; unit: string; qty: number;
  unitPriceCents: number; totalCents: number; expectedDay: number;
}): string {
  return [
    `Hello ${x.vendorName},`,
    ``,
    `Please confirm an order of ${x.qty} ${x.unit} of ${x.ingredientName.replace(/_/g, " ")}.`,
    ``,
    `Unit price: $${(x.unitPriceCents / 100).toFixed(2)}`,
    `Total: $${(x.totalCents / 100).toFixed(2)}`,
    `Requested delivery: day ${x.expectedDay}.`,
    ``,
    `Thanks,`,
    `${x.shopName}`,
  ].join("\n");
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
