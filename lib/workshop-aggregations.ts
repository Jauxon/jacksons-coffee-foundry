// Server-side aggregations for the Workshop page.

import { db, schema as s } from "../db/client.ts";
import { eq, and, sql } from "drizzle-orm";

export interface TeamSummary {
  shopId: number;
  name: string;
  colorHex: string;
  agentStrategy: string;
  cashCents: number;
  totalRevenueCents: number;
  totalCogsCents: number;
  totalWagesCents: number;
  totalNetCents: number;
  fulfilled: number;
  failed: number;
  fulfillmentRate: number;
  avgRating: number | null;
  storageCapacityUnits: number;
  storageUsedUnits: number;
}

export interface DailyPoint {
  day: number;
  cashCents: number;
  revenueCents: number;
  cogsCents: number;
  wagesCents: number;
  netCents: number;
  fulfilled: number;
  failed: number;
  fulfillmentRate: number;
}

export interface TeamSeries {
  shopId: number;
  name: string;
  colorHex: string;
  byDay: DailyPoint[];
}

export interface OutcomeRow {
  shopId: number;
  fulfilled: number;
  stockout: number;
  balkedPrice: number;
  balkedWait: number;
  productOff: number;
}

export interface VendorSpend {
  vendorId: number;
  vendorName: string;
  byTeam: { shopId: number; totalCents: number }[];
}

export interface ProductMixRow {
  productName: string;
  byTeam: { shopId: number; count: number; revenueCents: number }[];
}

export interface WorkshopData {
  teams: TeamSummary[];
  series: TeamSeries[];
  days: number[];
  outcomes: OutcomeRow[];
  vendorSpend: VendorSpend[];
  productMix: ProductMixRow[];
  stockoutHeatmap: { ingredients: string[]; rows: { shopId: number; counts: number[] }[] };
}

export function getWorkshopData(): WorkshopData {
  const shops = db.select().from(s.shop).orderBy(s.shop.id).all();
  const dayRows = db.selectDistinct({ day: s.dailySnapshot.day }).from(s.dailySnapshot).orderBy(s.dailySnapshot.day).all();
  const days = dayRows.map((d) => d.day);

  const teams: TeamSummary[] = shops.map((sh) => {
    const orderCounts = db.select({
      status: s.customerOrder.status,
      c: sql<number>`COUNT(*)`,
      rev: sql<number>`COALESCE(SUM(${s.customerOrder.priceCentsPaid}), 0)`,
      cogs: sql<number>`COALESCE(SUM(${s.customerOrder.cogsCents}), 0)`,
    })
      .from(s.customerOrder)
      .where(eq(s.customerOrder.shopId, sh.id))
      .groupBy(s.customerOrder.status)
      .all();
    const ful = Number(orderCounts.find((c) => c.status === "fulfilled")?.c ?? 0);
    const fail = orderCounts.filter((c) => c.status !== "fulfilled").reduce((a, c) => a + Number(c.c), 0);
    const totalRev = Number(orderCounts.find((c) => c.status === "fulfilled")?.rev ?? 0);
    const totalCogs = Number(orderCounts.find((c) => c.status === "fulfilled")?.cogs ?? 0);
    const wages = db.select({ w: sql<number>`COALESCE(SUM(${s.dailySnapshot.wagesCents}), 0)` })
      .from(s.dailySnapshot).where(eq(s.dailySnapshot.shopId, sh.id)).get();
    const totalWages = Number(wages?.w ?? 0);
    const ratingRows = db.select({ stars: s.review.stars }).from(s.review).where(eq(s.review.shopId, sh.id)).all();
    const total = ful + fail;

    // Storage usage = sum(remainingQty × storageWeight) across unexpired batches.
    const stRow = db.select({
      used: sql<number>`COALESCE(SUM(${s.inventoryBatch.remainingQty} * ${s.ingredient.storageWeight}), 0)`,
    })
      .from(s.inventoryBatch)
      .innerJoin(s.ingredient, eq(s.ingredient.id, s.inventoryBatch.ingredientId))
      .where(eq(s.inventoryBatch.shopId, sh.id))
      .get();

    return {
      shopId: sh.id,
      name: sh.name,
      colorHex: sh.colorHex,
      agentStrategy: sh.agentStrategy,
      cashCents: sh.cashCents,
      totalRevenueCents: totalRev,
      totalCogsCents: totalCogs,
      totalWagesCents: totalWages,
      totalNetCents: totalRev - totalCogs - totalWages,
      fulfilled: ful,
      failed: fail,
      fulfillmentRate: total === 0 ? 0 : ful / total,
      avgRating: ratingRows.length === 0 ? null : ratingRows.reduce((a, r) => a + r.stars, 0) / ratingRows.length,
      storageCapacityUnits: sh.storageCapacityUnits,
      storageUsedUnits: Number(stRow?.used ?? 0),
    };
  });

  const series: TeamSeries[] = shops.map((sh) => {
    const snaps = db.select().from(s.dailySnapshot).where(eq(s.dailySnapshot.shopId, sh.id)).orderBy(s.dailySnapshot.day).all();
    const byDayMap = new Map(snaps.map((s) => [s.day, s]));
    return {
      shopId: sh.id,
      name: sh.name,
      colorHex: sh.colorHex,
      byDay: days.map((d) => {
        const sn = byDayMap.get(d);
        return {
          day: d,
          cashCents: sn?.cashCents ?? 0,
          revenueCents: sn?.revenueCents ?? 0,
          cogsCents: sn?.cogsCents ?? 0,
          wagesCents: sn?.wagesCents ?? 0,
          netCents: sn?.netCents ?? 0,
          fulfilled: sn?.fulfilledOrders ?? 0,
          failed: sn?.failedOrders ?? 0,
          fulfillmentRate: sn?.fulfillmentRate ?? 0,
        };
      }),
    };
  });

  const outcomes: OutcomeRow[] = shops.map((sh) => {
    const counts = db.select({ status: s.customerOrder.status, c: sql<number>`COUNT(*)` })
      .from(s.customerOrder).where(eq(s.customerOrder.shopId, sh.id))
      .groupBy(s.customerOrder.status).all();
    const get = (k: string) => Number(counts.find((c) => c.status === k)?.c ?? 0);
    return {
      shopId: sh.id,
      fulfilled: get("fulfilled"),
      stockout: get("stockout"),
      balkedPrice: get("balked_price"),
      balkedWait: get("balked_wait"),
      productOff: get("product_off"),
    };
  });

  // Vendor spend per team, then aggregated.
  const vendorRows = db.select({
    vendorId: s.purchaseOrder.vendorId,
    name: s.vendor.name,
    shopId: s.purchaseOrder.shopId,
    total: sql<number>`SUM(${s.purchaseOrder.totalCents})`,
  })
    .from(s.purchaseOrder)
    .innerJoin(s.vendor, eq(s.vendor.id, s.purchaseOrder.vendorId))
    .where(eq(s.purchaseOrder.status, "delivered"))
    .groupBy(s.purchaseOrder.vendorId, s.vendor.name, s.purchaseOrder.shopId)
    .all();
  const vendorSpendMap = new Map<number, VendorSpend>();
  for (const r of vendorRows) {
    if (!vendorSpendMap.has(r.vendorId)) {
      vendorSpendMap.set(r.vendorId, { vendorId: r.vendorId, vendorName: r.name, byTeam: [] });
    }
    vendorSpendMap.get(r.vendorId)!.byTeam.push({ shopId: r.shopId, totalCents: Number(r.total) });
  }
  const vendorSpend = Array.from(vendorSpendMap.values());

  const productRows = db.select({
    productName: s.product.name,
    shopId: s.customerOrder.shopId,
    c: sql<number>`COUNT(*)`,
    rev: sql<number>`COALESCE(SUM(${s.customerOrder.priceCentsPaid}), 0)`,
  })
    .from(s.customerOrder)
    .innerJoin(s.product, eq(s.product.id, s.customerOrder.productId))
    .where(eq(s.customerOrder.status, "fulfilled"))
    .groupBy(s.product.name, s.customerOrder.shopId)
    .all();
  const productMixMap = new Map<string, ProductMixRow>();
  for (const r of productRows) {
    if (!productMixMap.has(r.productName)) {
      productMixMap.set(r.productName, { productName: r.productName, byTeam: [] });
    }
    productMixMap.get(r.productName)!.byTeam.push({ shopId: r.shopId, count: Number(r.c), revenueCents: Number(r.rev) });
  }
  const productMix = Array.from(productMixMap.values()).sort((a, b) => {
    const ta = a.byTeam.reduce((acc, t) => acc + t.count, 0);
    const tb = b.byTeam.reduce((acc, t) => acc + t.count, 0);
    return tb - ta;
  });

  // Stockout heatmap — attributed to the *specific* ingredient that ran out
  // (stockoutIngredientId is captured in tick.ts when fulfillment fails).
  const ingredients = db.select().from(s.ingredient).where(eq(s.ingredient.isTapSupplied, false)).orderBy(s.ingredient.name).all();
  const stockoutHeatmap = {
    ingredients: ingredients.map((i) => i.name),
    rows: shops.map((sh) => {
      const counts = ingredients.map((ing) => {
        const c = db.select({ c: sql<number>`COUNT(*)` })
          .from(s.customerOrder)
          .where(and(
            eq(s.customerOrder.shopId, sh.id),
            eq(s.customerOrder.status, "stockout"),
            eq(s.customerOrder.stockoutIngredientId, ing.id),
          )).get();
        return Number(c?.c ?? 0);
      });
      return { shopId: sh.id, counts };
    }),
  };

  return { teams, series, days, outcomes, vendorSpend, productMix, stockoutHeatmap };
}
