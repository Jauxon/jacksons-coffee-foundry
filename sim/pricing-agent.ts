// Pricing agent (heuristic).
// Looks at recent customer orders per product:
//   - many balked_price → lower price (we're overpriced)
//   - many fulfilled, few balked_price → consider raising (we have headroom)
//   - if a product also caused stockouts → don't raise; demand is already strong
// Emits one agent_proposal per product with kind="price_update".

import { db, schema as s } from "../db/client.ts";
import { eq, and, sql, gte } from "drizzle-orm";

export interface PriceDecision {
  productId: number;
  productName: string;
  oldPriceCents: number;
  newPriceCents: number;
  changePct: number;
  rationale: string;
}

export function proposePriceChanges(shopId: number): { proposals: number; decisions: PriceDecision[] } {
  return db.transaction(() => {
    const state = db.select().from(s.simState).where(eq(s.simState.id, 1)).get();
    if (!state) throw new Error("simState missing");
    const shop = db.select().from(s.shop).where(eq(s.shop.id, shopId)).get();
    if (!shop) throw new Error(`no shop with id=${shopId}`);

    const products = db.select().from(s.product).where(eq(s.product.shopId, shopId)).all();

    // Skip ingredients we already have a pending price proposal for.
    const pending = db.select().from(s.agentProposal).where(
      and(eq(s.agentProposal.shopId, shopId), eq(s.agentProposal.status, "pending")),
    ).all();
    const pendingProductIds = new Set<number>(
      pending.filter((p) => p.kind === "price_update").map((p) => (p.payload as { productId: number }).productId),
    );

    // Look at last 2 sim days of orders per product.
    const since = state.day - 2;
    const decisions: PriceDecision[] = [];

    for (const p of products) {
      if (pendingProductIds.has(p.id)) continue;

      const counts = db.select({
        status: s.customerOrder.status,
        c: sql<number>`COUNT(*)`.as("c"),
      })
        .from(s.customerOrder)
        .where(and(
          eq(s.customerOrder.shopId, shopId),
          eq(s.customerOrder.productId, p.id),
          gte(s.customerOrder.day, since),
        ))
        .groupBy(s.customerOrder.status)
        .all();

      const byStatus: Record<string, number> = {};
      for (const c of counts) byStatus[c.status] = Number(c.c);
      const fulfilled = byStatus["fulfilled"] ?? 0;
      const balkedPrice = byStatus["balked_price"] ?? 0;
      const stockouts = byStatus["stockout"] ?? 0;
      const total = fulfilled + balkedPrice + stockouts + (byStatus["balked_wait"] ?? 0) + (byStatus["product_off"] ?? 0);

      if (total < 30) continue; // need a meaningful sample before suggesting a price change

      const balkPriceRate = balkedPrice / total;
      const stockoutRate = stockouts / total;

      let direction: "up" | "down" | null = null;
      let rationale = "";
      if (balkPriceRate > 0.30) {
        direction = "down";
        rationale = `${balkedPrice} of ${total} customers walked on price (${(balkPriceRate * 100).toFixed(0)}%) — we're overpriced. Suggest −8% to capture more demand.`;
      } else if (balkPriceRate < 0.05 && fulfilled > 30 && stockoutRate < 0.10) {
        direction = "up";
        rationale = `Only ${balkedPrice} of ${total} balked on price; ${fulfilled} fulfilled with low stockout rate. Pricing headroom — suggest +5%.`;
      } else {
        continue;
      }

      const newPrice = direction === "up"
        ? Math.round(p.priceCents * 1.05)
        : Math.round(p.priceCents * 0.92);
      const changePct = (newPrice - p.priceCents) / p.priceCents;

      decisions.push({
        productId: p.id,
        productName: p.name,
        oldPriceCents: p.priceCents,
        newPriceCents: newPrice,
        changePct,
        rationale,
      });
    }

    for (const d of decisions) {
      db.insert(s.agentProposal).values({
        shopId,
        agentName: "pricing",
        kind: "price_update",
        payload: {
          productId: d.productId,
          productName: d.productName,
          oldPriceCents: d.oldPriceCents,
          newPriceCents: d.newPriceCents,
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
