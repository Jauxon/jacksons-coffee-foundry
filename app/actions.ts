"use server";

import { revalidatePath } from "next/cache";
import { tick } from "../sim/tick.ts";
import { proposeReorders, approveProposal as approveImpl } from "../sim/agent.ts";
import { proposeReordersWithLLM } from "../sim/llm-agent.ts";
import { db, schema as s } from "../db/client.ts";
import { eq, sql } from "drizzle-orm";

export async function runTick(n: number = 1) {
  for (let i = 0; i < n; i++) tick();
  revalidatePath("/", "layout");
}

// Standard return shape: actions return errors as data (Next.js production
// anonymizes thrown errors into digests, so the user never sees the real message).
export type ActionResult = { ok: true } | { ok: false; error: string };

// Run agent for a single shop. The human team is supported — the agent drafts
// proposals (including LLM-composed vendor emails) for the operator to review.
// Only autoApprove governs whether they get executed automatically.
export async function runAgent(shopId: number, opts?: { useHeuristic?: boolean }): Promise<ActionResult> {
  const shop = db.select().from(s.shop).where(eq(s.shop.id, shopId)).get();
  if (!shop) return { ok: false, error: `shop ${shopId} not found` };

  const useHeuristic = opts?.useHeuristic === true || !process.env.ANTHROPIC_API_KEY;
  try {
    if (useHeuristic) {
      proposeReorders(shopId);
    } else {
      await proposeReordersWithLLM(shopId);
    }
  } catch (e) {
    console.error(`[runAgent] shop ${shopId}:`, e);
    return { ok: false, error: (e as Error).message };
  }

  if (shop.autoApprove) {
    const pending = db.select().from(s.agentProposal)
      .where(eq(s.agentProposal.status, "pending")).all()
      .filter((p) => p.shopId === shopId);
    for (const p of pending) {
      try { approveImpl(p.id); } catch { /* skip insufficient cash etc */ }
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// Run agents for every team — including the human team (it gets drafts for review).
// Returns the first error encountered (e.g. LLM budget exhausted) so the UI can show it.
export async function runAllAIAgents(opts?: { useHeuristic?: boolean }): Promise<ActionResult> {
  const shops = db.select().from(s.shop).all();
  let firstError: string | null = null;
  for (const sh of shops) {
    const r = await runAgent(sh.id, opts);
    if (!r.ok && firstError == null) firstError = r.error;
  }
  revalidatePath("/", "layout");
  return firstError ? { ok: false, error: firstError } : { ok: true };
}

// Dry-run an agent: returns the proposals it would generate WITHOUT persisting them.
// Used by the Logic Function "Test run" panel. We do this by running the agent,
// reading the new proposals, then deleting them.
export async function dryRunAgent(shopId: number, agentSlug: "reorder-heuristic" | "reorder-llm" | "pricing"): Promise<{ proposals: Array<{ id: number; kind: string; rationale: string; payload: any }>; durationMs: number }> {
  const start = Date.now();
  const beforeMaxId = Number(db.select({ m: sql<number>`COALESCE(MAX(id), 0)` }).from(s.agentProposal).get()!.m);

  if (agentSlug === "reorder-heuristic") {
    proposeReorders(shopId);
  } else if (agentSlug === "reorder-llm") {
    await proposeReordersWithLLM(shopId);
  } else if (agentSlug === "pricing") {
    const { proposePriceChanges } = await import("../sim/pricing-agent.ts");
    proposePriceChanges(shopId);
  }

  const newProposals = db.select().from(s.agentProposal)
    .where(eq(s.agentProposal.status, "pending")).all()
    .filter((p) => p.id > beforeMaxId && p.shopId === shopId);

  // Don't persist test runs — caller will see them and we delete.
  for (const p of newProposals) {
    db.delete(s.agentProposal).where(eq(s.agentProposal.id, p.id)).run();
  }

  return {
    proposals: newProposals.map((p) => ({ id: p.id, kind: p.kind, rationale: p.rationale, payload: p.payload })),
    durationMs: Date.now() - start,
  };
}

// Soft reset to Day 1. Wipes runtime data, re-creates starter inventory per shop,
// resets cash to $8000. Keeps menu / vendors / staff / strategies as configured.
//
// Deletion order matters with FKs ON: dependents first, parents last.
//   review → customer_order
//   email → (email_thread, purchase_order)
//   inventory_batch → purchase_order
//   purchase_order → agent_proposal
export async function resetSim() {
  db.transaction(() => {
    db.delete(s.review).run();
    db.delete(s.customerOrder).run();
    db.delete(s.email).run();
    db.delete(s.emailThread).run();
    db.delete(s.inventoryBatch).run();
    db.delete(s.purchaseOrder).run();
    db.delete(s.agentProposal).run();
    db.delete(s.dailySnapshot).run();
    db.update(s.simState).set({ day: 1, segment: "morning" }).where(eq(s.simState.id, 1)).run();
    db.update(s.shop).set({ cashCents: 800_000 }).run();
    reseedStarterInventory();
  });
  revalidatePath("/", "layout");
}

// Re-creates starter batches per shop with strategy-biased quantities.
// Mirrors db/seed.ts so reset matches a fresh `npm run db:reset`.
//
// Also re-syncs ingredient.storage_weight to current canonical values, so a
// pre-existing DB picks up tweaks without a full reseed.
function reseedStarterInventory() {
  // Sync storage weights to current canonical values.
  const STORAGE_WEIGHTS: Record<string, number> = {
    espresso_beans: 0.05, whole_milk: 0.05, oat_milk: 0.05,
    chocolate_syrup: 0.05, vanilla_syrup: 0.05,
    small_cup: 2, large_cup: 3, lid: 0.5,
    ice: 0, water: 0,
  };
  for (const [name, weight] of Object.entries(STORAGE_WEIGHTS)) {
    db.update(s.ingredient).set({ storageWeight: weight }).where(eq(s.ingredient.name, name)).run();
  }

  const ingredients = db.select().from(s.ingredient).all();
  const offerings = db.select().from(s.vendorIngredient).all();
  const ing = (name: string) => ingredients.find((i) => i.name === name)!.id;

  const baseBatches = [
    { ingredientId: ing("espresso_beans"),  qty: 50000,  deliveredOffset: -2, shelfLife: 30  },
    { ingredientId: ing("whole_milk"),      qty: 300000, deliveredOffset: -1, shelfLife: 7   },
    { ingredientId: ing("oat_milk"),        qty: 80000,  deliveredOffset: 0,  shelfLife: 10  },
    { ingredientId: ing("chocolate_syrup"), qty: 6000,   deliveredOffset: -5, shelfLife: 180 },
    { ingredientId: ing("vanilla_syrup"),   qty: 6000,   deliveredOffset: -5, shelfLife: 180 },
    { ingredientId: ing("small_cup"),       qty: 3000,   deliveredOffset: -3, shelfLife: 365 },
    { ingredientId: ing("large_cup"),       qty: 3750,   deliveredOffset: -3, shelfLife: 365 },
    { ingredientId: ing("lid"),             qty: 6750,   deliveredOffset: -3, shelfLife: 365 },
  ];

  const stockBiasByStrategy: Record<string, number> = {
    aggressive_stocker: 1.5,
    lean_operator: 0.7,
    premium_pricer: 1.0,
    volume_king: 1.3,
    human: 1.0,
  };

  // Strategy-aware vendor picker — same logic as sim/agent.ts.
  const vendors = db.select().from(s.vendor).all();
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

  const shops = db.select().from(s.shop).all();
  for (const shop of shops) {
    const bias = stockBiasByStrategy[shop.agentStrategy] ?? 1.0;
    for (const b of baseBatches) {
      const qty = Math.round(b.qty * bias);
      const pick = pickVendorForStrategy(shop.agentStrategy, b.ingredientId);
      if (!pick) continue;
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
}

export async function approveProposal(proposalId: number): Promise<ActionResult> {
  try {
    approveImpl(proposalId);
  } catch (e) {
    console.error(`[approveProposal] proposal ${proposalId}:`, e);
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function rejectProposal(proposalId: number): Promise<ActionResult> {
  try {
    db.update(s.agentProposal)
      .set({ status: "rejected", decidedAt: new Date() })
      .where(eq(s.agentProposal.id, proposalId))
      .run();
  } catch (e) {
    console.error(`[rejectProposal] proposal ${proposalId}:`, e);
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function toggleProductAvailability(productId: number) {
  const p = db.select().from(s.product).where(eq(s.product.id, productId)).get();
  if (!p) return;
  db.update(s.product).set({ isAvailable: !p.isAvailable }).where(eq(s.product.id, productId)).run();
  revalidatePath("/", "layout");
}

export async function updateProductPrice(productId: number, priceCents: number) {
  if (!Number.isFinite(priceCents) || priceCents < 0) return;
  db.update(s.product).set({ priceCents }).where(eq(s.product.id, productId)).run();
  revalidatePath("/", "layout");
}

export async function updateStaffCount(shopId: number, staffCount: number) {
  if (!Number.isFinite(staffCount) || staffCount < 0 || staffCount > 10) return;
  db.update(s.shop).set({ staffCount }).where(eq(s.shop.id, shopId)).run();
  revalidatePath("/", "layout");
}

export async function setAutoApprove(shopId: number, autoApprove: boolean) {
  db.update(s.shop).set({ autoApprove }).where(eq(s.shop.id, shopId)).run();
  revalidatePath("/", "layout");
}
