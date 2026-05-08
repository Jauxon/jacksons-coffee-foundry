// Generic object-type registry — each entry tells the Object Explorer how to
// list, fetch, and display that ontology type. This is the FDE-shape "Foundry
// Object Type" surface, made concrete for our schema.

import { db, schema as s } from "../db/client.ts";
import { eq, desc, sql } from "drizzle-orm";
import { fmtUSD, STRATEGY_META } from "./data.ts";
import type { ReactNode } from "react";

export interface Column {
  key: string;
  label: string;
  align?: "left" | "right";
  className?: string;
  render?: (row: any) => string | ReactNode;
}

export interface DetailField {
  label: string;
  value: string | ReactNode;
  mono?: boolean;
}

export interface LinkedRef {
  type: string; // object-type key, e.g. "shop"
  id: number;
  label: string; // displayed name
  subtitle?: string;
}

export interface DetailLink {
  title: string;
  // Either a single ref (one-to-one) or many (one-to-many)
  refs: LinkedRef[];
}

export interface ObjectTypeDef {
  key: string; // url slug, e.g. "shop"
  name: string;
  plural: string;
  emoji: string;
  description: string;
  list: () => any[];
  count: () => number;
  get: (id: number) => any | null;
  // Identifier label for an instance (used in linked references)
  labelOf: (row: any) => string;
  subtitleOf?: (row: any) => string;
  columns: Column[];
  detail: (row: any) => { fields: DetailField[]; links: DetailLink[] };
}

// ----- Helpers -----

const fmtDay = (d: number | null | undefined) => d == null ? "—" : `Day ${d}`;
const fmtRating = (r: number | null) => r == null ? "—" : `${r.toFixed(2)} ★`;

export const OBJECT_TYPES: Record<string, ObjectTypeDef> = {
  // ---------- Shop ----------
  shop: {
    key: "shop",
    name: "Shop",
    plural: "Shops",
    emoji: "🏪",
    description: "A coffee shop on Times Square. Each shop has its own ontology of products, batches, orders, and proposals.",
    list: () => db.select().from(s.shop).orderBy(s.shop.id).all(),
    count: () => Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.shop).get()!.c),
    get: (id) => db.select().from(s.shop).where(eq(s.shop.id, id)).get() ?? null,
    labelOf: (r) => r.name,
    subtitleOf: (r) => r.agentStrategy,
    columns: [
      { key: "id", label: "ID", className: "font-mono text-slate-500", render: (r) => `#${r.id}` },
      { key: "name", label: "Name", className: "font-medium text-slate-800" },
      { key: "agentStrategy", label: "Strategy", render: (r) => STRATEGY_META[r.agentStrategy]?.label ?? r.agentStrategy },
      { key: "cashCents", label: "Cash", align: "right", className: "tabular-nums", render: (r) => fmtUSD(r.cashCents) },
      { key: "staffCount", label: "Staff", align: "right", className: "tabular-nums" },
      { key: "storage", label: "Storage", align: "right", className: "tabular-nums", render: (r) => `${r.storageCapacityUnits.toLocaleString()} u` },
    ],
    detail: (r) => ({
      fields: [
        { label: "Name", value: r.name },
        { label: "Strategy", value: STRATEGY_META[r.agentStrategy]?.label ?? r.agentStrategy },
        { label: "Cash", value: fmtUSD(r.cashCents), mono: true },
        { label: "Lat / Lng", value: `${r.lat}, ${r.lng}`, mono: true },
        { label: "Staff count", value: String(r.staffCount), mono: true },
        { label: "Storage capacity", value: `${r.storageCapacityUnits.toLocaleString()} units`, mono: true },
        { label: "Auto-approve", value: r.autoApprove ? "yes" : "no" },
      ],
      links: [
        {
          title: "Products",
          refs: db.select().from(s.product).where(eq(s.product.shopId, r.id)).all().map((p) => ({
            type: "product", id: p.id, label: p.name, subtitle: fmtUSD(p.priceCents),
          })),
        },
        {
          title: "Inventory batches (active)",
          refs: db.select().from(s.inventoryBatch).where(eq(s.inventoryBatch.shopId, r.id)).orderBy(desc(s.inventoryBatch.id)).limit(20).all().map((b) => ({
            type: "inventory-batch", id: b.id, label: `batch-${String(b.id).padStart(4, "0")}`, subtitle: `${b.remainingQty} remaining · expires ${fmtDay(b.expiresDay)}`,
          })),
        },
        {
          title: "Recent purchase orders",
          refs: db.select().from(s.purchaseOrder).where(eq(s.purchaseOrder.shopId, r.id)).orderBy(desc(s.purchaseOrder.id)).limit(10).all().map((p) => ({
            type: "purchase-order", id: p.id, label: `PO #${p.id}`, subtitle: `${p.status} · ${fmtUSD(p.totalCents)}`,
          })),
        },
      ],
    }),
  },

  // ---------- Ingredient ----------
  ingredient: {
    key: "ingredient",
    name: "Ingredient",
    plural: "Ingredients",
    emoji: "🌾",
    description: "Raw inputs to recipes. Tap-supplied ingredients (water, ice) are infinite and free.",
    list: () => db.select().from(s.ingredient).orderBy(s.ingredient.id).all(),
    count: () => Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.ingredient).get()!.c),
    get: (id) => db.select().from(s.ingredient).where(eq(s.ingredient.id, id)).get() ?? null,
    labelOf: (r) => r.name,
    subtitleOf: (r) => `${r.unit} · shelf ${r.shelfLifeDays}d`,
    columns: [
      { key: "id", label: "ID", className: "font-mono text-slate-500", render: (r) => `#${r.id}` },
      { key: "name", label: "Name", className: "font-mono text-slate-800" },
      { key: "unit", label: "Unit" },
      { key: "shelfLifeDays", label: "Shelf life", align: "right", render: (r) => `${r.shelfLifeDays}d` },
      { key: "storageWeight", label: "Storage wt", align: "right", className: "tabular-nums" },
      { key: "isTapSupplied", label: "Tap-supplied", render: (r) => r.isTapSupplied ? "✓" : "" },
    ],
    detail: (r) => ({
      fields: [
        { label: "Name", value: r.name, mono: true },
        { label: "Unit", value: r.unit },
        { label: "Shelf life", value: `${r.shelfLifeDays} days`, mono: true },
        { label: "Storage weight", value: String(r.storageWeight), mono: true },
        { label: "Tap-supplied", value: r.isTapSupplied ? "yes (always available, free)" : "no" },
      ],
      links: [
        {
          title: "Vendor offerings",
          refs: db.select().from(s.vendorIngredient).where(eq(s.vendorIngredient.ingredientId, r.id)).all().map((vi) => {
            const v = db.select().from(s.vendor).where(eq(s.vendor.id, vi.vendorId)).get();
            return {
              type: "vendor-ingredient", id: vi.id,
              label: v?.name ?? "?",
              subtitle: `${vi.unitPriceCents}¢/${r.unit} · MOQ ${vi.moq}`,
            };
          }),
        },
      ],
    }),
  },

  // ---------- Product ----------
  product: {
    key: "product",
    name: "Product",
    plural: "Products",
    emoji: "☕",
    description: "Menu items each shop sells.",
    list: () => db.select().from(s.product).orderBy(s.product.shopId, s.product.id).all(),
    count: () => Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.product).get()!.c),
    get: (id) => db.select().from(s.product).where(eq(s.product.id, id)).get() ?? null,
    labelOf: (r) => r.name,
    subtitleOf: (r) => fmtUSD(r.priceCents),
    columns: [
      { key: "id", label: "ID", className: "font-mono text-slate-500", render: (r) => `#${r.id}` },
      { key: "shopId", label: "Shop", render: (r) => {
        const sh = db.select().from(s.shop).where(eq(s.shop.id, r.shopId)).get();
        return sh?.name ?? "?";
      } },
      { key: "name", label: "Name", className: "font-medium text-slate-800" },
      { key: "priceCents", label: "Price", align: "right", className: "tabular-nums", render: (r) => fmtUSD(r.priceCents) },
      { key: "isAvailable", label: "Status", render: (r) => r.isAvailable ? "On" : "Off" },
    ],
    detail: (r) => ({
      fields: [
        { label: "Name", value: r.name },
        { label: "Price", value: fmtUSD(r.priceCents), mono: true },
        { label: "Available", value: r.isAvailable ? "yes" : "no" },
      ],
      links: [
        {
          title: "Recipe (ingredients per drink)",
          refs: db.select().from(s.productIngredient).where(eq(s.productIngredient.productId, r.id)).all().map((pi) => {
            const ing = db.select().from(s.ingredient).where(eq(s.ingredient.id, pi.ingredientId)).get();
            return { type: "ingredient", id: ing!.id, label: ing!.name, subtitle: `${pi.qtyPerUnit}${ing!.unit}` };
          }),
        },
        { title: "Shop", refs: (() => {
          const sh = db.select().from(s.shop).where(eq(s.shop.id, r.shopId)).get();
          return sh ? [{ type: "shop", id: sh.id, label: sh.name }] : [];
        })() },
      ],
    }),
  },

  // ---------- Vendor ----------
  vendor: {
    key: "vendor",
    name: "Vendor",
    plural: "Vendors",
    emoji: "🚚",
    description: "Suppliers who sell ingredients to the shops. Each tracks lead time, reliability, and per-ingredient pricing.",
    list: () => db.select().from(s.vendor).orderBy(s.vendor.id).all(),
    count: () => Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.vendor).get()!.c),
    get: (id) => db.select().from(s.vendor).where(eq(s.vendor.id, id)).get() ?? null,
    labelOf: (r) => r.name,
    subtitleOf: (r) => `lead ${r.leadTimeDays}d · ${(r.reliability * 100).toFixed(0)}%`,
    columns: [
      { key: "id", label: "ID", className: "font-mono text-slate-500", render: (r) => `#${r.id}` },
      { key: "name", label: "Name", className: "font-medium text-slate-800" },
      { key: "email", label: "Email", className: "font-mono text-slate-600" },
      { key: "leadTimeDays", label: "Lead", align: "right", render: (r) => `${r.leadTimeDays}d` },
      { key: "reliability", label: "Reliability", align: "right", render: (r) => `${(r.reliability * 100).toFixed(0)}%` },
    ],
    detail: (r) => ({
      fields: [
        { label: "Name", value: r.name },
        { label: "Email", value: r.email, mono: true },
        { label: "Lead time", value: `${r.leadTimeDays} days`, mono: true },
        { label: "Reliability", value: `${(r.reliability * 100).toFixed(0)}%`, mono: true },
      ],
      links: [
        {
          title: "Offerings",
          refs: db.select().from(s.vendorIngredient).where(eq(s.vendorIngredient.vendorId, r.id)).all().map((vi) => {
            const ing = db.select().from(s.ingredient).where(eq(s.ingredient.id, vi.ingredientId)).get();
            return { type: "vendor-ingredient", id: vi.id, label: ing!.name, subtitle: `${vi.unitPriceCents}¢/${ing!.unit}` };
          }),
        },
        {
          title: "Recent purchase orders",
          refs: db.select().from(s.purchaseOrder).where(eq(s.purchaseOrder.vendorId, r.id)).orderBy(desc(s.purchaseOrder.id)).limit(10).all().map((p) => ({
            type: "purchase-order", id: p.id, label: `PO #${p.id}`, subtitle: `${p.status} · ${fmtUSD(p.totalCents)}`,
          })),
        },
      ],
    }),
  },

  // ---------- VendorIngredient ----------
  "vendor-ingredient": {
    key: "vendor-ingredient",
    name: "Vendor Offering",
    plural: "Vendor Offerings",
    emoji: "💰",
    description: "A specific vendor's price + MOQ for a specific ingredient.",
    list: () => db.select().from(s.vendorIngredient).orderBy(s.vendorIngredient.id).all(),
    count: () => Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.vendorIngredient).get()!.c),
    get: (id) => db.select().from(s.vendorIngredient).where(eq(s.vendorIngredient.id, id)).get() ?? null,
    labelOf: (r) => `Offering #${r.id}`,
    subtitleOf: (r) => `${r.unitPriceCents}¢/unit · MOQ ${r.moq}`,
    columns: [
      { key: "id", label: "ID", className: "font-mono text-slate-500", render: (r) => `#${r.id}` },
      { key: "vendor", label: "Vendor", render: (r) => db.select().from(s.vendor).where(eq(s.vendor.id, r.vendorId)).get()?.name ?? "?" },
      { key: "ingredient", label: "Ingredient", className: "font-mono", render: (r) => db.select().from(s.ingredient).where(eq(s.ingredient.id, r.ingredientId)).get()?.name ?? "?" },
      { key: "unitPriceCents", label: "Price", align: "right", className: "tabular-nums", render: (r) => `${r.unitPriceCents}¢` },
      { key: "moq", label: "MOQ", align: "right", className: "tabular-nums", render: (r) => r.moq.toLocaleString() },
    ],
    detail: (r) => {
      const v = db.select().from(s.vendor).where(eq(s.vendor.id, r.vendorId)).get();
      const ing = db.select().from(s.ingredient).where(eq(s.ingredient.id, r.ingredientId)).get();
      return {
        fields: [
          { label: "Unit price", value: `${r.unitPriceCents}¢ / ${ing?.unit ?? "unit"}`, mono: true },
          { label: "MOQ", value: r.moq.toLocaleString(), mono: true },
        ],
        links: [
          { title: "Vendor", refs: v ? [{ type: "vendor", id: v.id, label: v.name, subtitle: `lead ${v.leadTimeDays}d` }] : [] },
          { title: "Ingredient", refs: ing ? [{ type: "ingredient", id: ing.id, label: ing.name, subtitle: `${ing.unit}` }] : [] },
        ],
      };
    },
  },

  // ---------- InventoryBatch ----------
  "inventory-batch": {
    key: "inventory-batch",
    name: "Inventory Batch",
    plural: "Inventory Batches",
    emoji: "📦",
    description: "A delivered batch of one ingredient. Depletes as customers are served (FEFO). Expires after shelf-life days.",
    list: () => db.select().from(s.inventoryBatch).orderBy(desc(s.inventoryBatch.id)).limit(200).all(),
    count: () => Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.inventoryBatch).get()!.c),
    get: (id) => db.select().from(s.inventoryBatch).where(eq(s.inventoryBatch.id, id)).get() ?? null,
    labelOf: (r) => `batch-${String(r.id).padStart(4, "0")}`,
    subtitleOf: (r) => `${r.remainingQty} remaining`,
    columns: [
      { key: "id", label: "ID", className: "font-mono text-slate-500", render: (r) => `batch-${String(r.id).padStart(4, "0")}` },
      { key: "shop", label: "Shop", render: (r) => db.select().from(s.shop).where(eq(s.shop.id, r.shopId)).get()?.name ?? "?" },
      { key: "ingredient", label: "Ingredient", className: "font-mono", render: (r) => db.select().from(s.ingredient).where(eq(s.ingredient.id, r.ingredientId)).get()?.name ?? "?" },
      { key: "remainingQty", label: "Remaining", align: "right", className: "tabular-nums" },
      { key: "expiresDay", label: "Expires", align: "right", render: (r) => fmtDay(r.expiresDay) },
    ],
    detail: (r) => {
      const sh = db.select().from(s.shop).where(eq(s.shop.id, r.shopId)).get();
      const ing = db.select().from(s.ingredient).where(eq(s.ingredient.id, r.ingredientId)).get();
      const po = r.purchaseOrderId ? db.select().from(s.purchaseOrder).where(eq(s.purchaseOrder.id, r.purchaseOrderId)).get() : null;
      return {
        fields: [
          { label: "Initial qty", value: `${r.initialQty.toLocaleString()} ${ing?.unit ?? ""}`, mono: true },
          { label: "Remaining qty", value: `${r.remainingQty.toLocaleString()} ${ing?.unit ?? ""}`, mono: true },
          { label: "Delivered", value: fmtDay(r.deliveredDay), mono: true },
          { label: "Expires", value: fmtDay(r.expiresDay), mono: true },
        ],
        links: [
          { title: "Shop", refs: sh ? [{ type: "shop", id: sh.id, label: sh.name }] : [] },
          { title: "Ingredient", refs: ing ? [{ type: "ingredient", id: ing.id, label: ing.name }] : [] },
          { title: "Source purchase order", refs: po ? [{ type: "purchase-order", id: po.id, label: `PO #${po.id}`, subtitle: `${po.status} · ${fmtUSD(po.totalCents)}` }] : [] },
        ],
      };
    },
  },

  // ---------- PurchaseOrder ----------
  "purchase-order": {
    key: "purchase-order",
    name: "Purchase Order",
    plural: "Purchase Orders",
    emoji: "🧾",
    description: "An order placed with a vendor. Cash deducts at placement; status flows pending → in_transit → delivered.",
    list: () => db.select().from(s.purchaseOrder).orderBy(desc(s.purchaseOrder.id)).limit(200).all(),
    count: () => Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.purchaseOrder).get()!.c),
    get: (id) => db.select().from(s.purchaseOrder).where(eq(s.purchaseOrder.id, id)).get() ?? null,
    labelOf: (r) => `PO #${r.id}`,
    subtitleOf: (r) => `${r.status} · ${fmtUSD(r.totalCents)}`,
    columns: [
      { key: "id", label: "ID", className: "font-mono text-slate-500", render: (r) => `#${r.id}` },
      { key: "shop", label: "Shop", render: (r) => db.select().from(s.shop).where(eq(s.shop.id, r.shopId)).get()?.name ?? "?" },
      { key: "ingredient", label: "Ingredient", className: "font-mono", render: (r) => db.select().from(s.ingredient).where(eq(s.ingredient.id, r.ingredientId)).get()?.name ?? "?" },
      { key: "vendor", label: "Vendor", render: (r) => db.select().from(s.vendor).where(eq(s.vendor.id, r.vendorId)).get()?.name ?? "?" },
      { key: "qty", label: "Qty", align: "right", className: "tabular-nums" },
      { key: "totalCents", label: "Total", align: "right", className: "tabular-nums", render: (r) => fmtUSD(r.totalCents) },
      { key: "status", label: "Status", render: (r) => {
        const cls = r.status === "delivered" ? "pill-green" : r.status === "in_transit" ? "pill-amber" : "pill-slate";
        return <span className={`pill ${cls}`}>{r.status.replace("_", " ")}</span>;
      } },
      { key: "expectedDay", label: "Expected", align: "right", render: (r) => fmtDay(r.expectedDay) },
    ],
    detail: (r) => {
      const sh = db.select().from(s.shop).where(eq(s.shop.id, r.shopId)).get();
      const v = db.select().from(s.vendor).where(eq(s.vendor.id, r.vendorId)).get();
      const ing = db.select().from(s.ingredient).where(eq(s.ingredient.id, r.ingredientId)).get();
      const batches = db.select().from(s.inventoryBatch).where(eq(s.inventoryBatch.purchaseOrderId, r.id)).all();
      const emails = db.select().from(s.email).where(eq(s.email.attachedPurchaseOrderId, r.id)).all();
      const proposal = r.proposedByAgentId ? db.select().from(s.agentProposal).where(eq(s.agentProposal.id, r.proposedByAgentId)).get() : null;
      return {
        fields: [
          { label: "Status", value: r.status },
          { label: "Quantity", value: `${r.qty.toLocaleString()} ${ing?.unit ?? ""}`, mono: true },
          { label: "Unit price", value: `${r.unitPriceCents}¢`, mono: true },
          { label: "Total", value: fmtUSD(r.totalCents), mono: true },
          { label: "Placed", value: fmtDay(r.placedDay), mono: true },
          { label: "Expected delivery", value: fmtDay(r.expectedDay), mono: true },
        ],
        links: [
          { title: "Shop", refs: sh ? [{ type: "shop", id: sh.id, label: sh.name }] : [] },
          { title: "Vendor", refs: v ? [{ type: "vendor", id: v.id, label: v.name }] : [] },
          { title: "Ingredient", refs: ing ? [{ type: "ingredient", id: ing.id, label: ing.name }] : [] },
          { title: "Resulting batches", refs: batches.map((b) => ({ type: "inventory-batch", id: b.id, label: `batch-${String(b.id).padStart(4, "0")}`, subtitle: `${b.remainingQty} remaining` })) },
          { title: "Email correspondence", refs: emails.map((e) => ({ type: "email", id: e.id, label: `email #${e.id}`, subtitle: `→ ${e.toAddr}` })) },
          { title: "Proposed by agent", refs: proposal ? [{ type: "agent-proposal", id: proposal.id, label: `Proposal #${proposal.id}`, subtitle: proposal.agentName }] : [] },
        ],
      };
    },
  },

  // ---------- AgentProposal ----------
  "agent-proposal": {
    key: "agent-proposal",
    name: "Agent Proposal",
    plural: "Agent Proposals",
    emoji: "🤖",
    description: "A staged decision from an agent (heuristic or LLM). Pending until human approves or auto-approve fires.",
    list: () => db.select().from(s.agentProposal).orderBy(desc(s.agentProposal.id)).limit(200).all(),
    count: () => Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.agentProposal).get()!.c),
    get: (id) => db.select().from(s.agentProposal).where(eq(s.agentProposal.id, id)).get() ?? null,
    labelOf: (r) => `Proposal #${r.id}`,
    subtitleOf: (r) => `${r.kind} · ${r.status}`,
    columns: [
      { key: "id", label: "ID", className: "font-mono text-slate-500", render: (r) => `#${r.id}` },
      { key: "agentName", label: "Agent" },
      { key: "kind", label: "Kind", render: (r) => r.kind.replace("_", " ") },
      { key: "shop", label: "Shop", render: (r) => db.select().from(s.shop).where(eq(s.shop.id, r.shopId)).get()?.name ?? "?" },
      { key: "status", label: "Status", render: (r) => {
        const cls = r.status === "approved" ? "pill-green" : r.status === "rejected" ? "pill-red" : r.status === "auto_executed" ? "pill-amber" : "pill-slate";
        return <span className={`pill ${cls}`}>{r.status.replace("_", " ")}</span>;
      } },
      { key: "createdDay", label: "Created", align: "right", render: (r) => `D${r.createdDay} ${r.createdSegment}` },
    ],
    detail: (r) => {
      const sh = db.select().from(s.shop).where(eq(s.shop.id, r.shopId)).get();
      const fields: DetailField[] = [
        { label: "Agent", value: r.agentName, mono: true },
        { label: "Kind", value: r.kind },
        { label: "Status", value: r.status },
        { label: "Created", value: `Day ${r.createdDay} · ${r.createdSegment}`, mono: true },
        { label: "Rationale", value: r.rationale },
      ];
      if (r.kind === "purchase_order") {
        const pl = r.payload as any;
        const ing = db.select().from(s.ingredient).where(eq(s.ingredient.id, pl.ingredientId)).get();
        const ven = db.select().from(s.vendor).where(eq(s.vendor.id, pl.vendorId)).get();
        fields.push(
          { label: "Ingredient", value: ing?.name ?? "?", mono: true },
          { label: "Vendor", value: ven?.name ?? "?" },
          { label: "Qty", value: `${pl.qty.toLocaleString()} ${ing?.unit ?? ""}`, mono: true },
          { label: "Total", value: fmtUSD(pl.totalCents), mono: true },
          { label: "Expected delivery", value: fmtDay(pl.expectedDay), mono: true },
        );
      } else if (r.kind === "price_update") {
        const pl = r.payload as any;
        fields.push(
          { label: "Product", value: pl.productName },
          { label: "Old price", value: fmtUSD(pl.oldPriceCents), mono: true },
          { label: "New price", value: fmtUSD(pl.newPriceCents), mono: true },
        );
      }
      return {
        fields,
        links: [
          { title: "Shop", refs: sh ? [{ type: "shop", id: sh.id, label: sh.name }] : [] },
        ],
      };
    },
  },

  // ---------- CustomerOrder ----------
  "customer-order": {
    key: "customer-order",
    name: "Customer Order",
    plural: "Customer Orders",
    emoji: "🧾",
    description: "One row per customer arrival. Status records whether they got a drink or balked / stocked out.",
    list: () => db.select().from(s.customerOrder).orderBy(desc(s.customerOrder.id)).limit(200).all(),
    count: () => Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.customerOrder).get()!.c),
    get: (id) => db.select().from(s.customerOrder).where(eq(s.customerOrder.id, id)).get() ?? null,
    labelOf: (r) => `Order #${r.id}`,
    subtitleOf: (r) => r.status,
    columns: [
      { key: "id", label: "ID", className: "font-mono text-slate-500", render: (r) => `#${r.id}` },
      { key: "shop", label: "Shop", render: (r) => db.select().from(s.shop).where(eq(s.shop.id, r.shopId)).get()?.name ?? "?" },
      { key: "product", label: "Product", render: (r) => r.productId ? db.select().from(s.product).where(eq(s.product.id, r.productId)).get()?.name ?? "?" : "—" },
      { key: "status", label: "Status", render: (r) => {
        const cls = r.status === "fulfilled" ? "pill-green" : r.status === "stockout" ? "pill-red" : "pill-amber";
        return <span className={`pill ${cls}`}>{r.status.replace("_", " ")}</span>;
      } },
      { key: "day", label: "When", align: "right", render: (r) => `D${r.day} ${r.segment}` },
      { key: "priceCentsPaid", label: "Paid", align: "right", className: "tabular-nums", render: (r) => r.priceCentsPaid != null ? fmtUSD(r.priceCentsPaid) : "—" },
    ],
    detail: (r) => ({
      fields: [
        { label: "Status", value: r.status },
        { label: "Day", value: `Day ${r.day} · ${r.segment}`, mono: true },
        { label: "Wait", value: r.waitSeconds != null ? `${r.waitSeconds}s` : "—", mono: true },
        { label: "Price paid", value: r.priceCentsPaid != null ? fmtUSD(r.priceCentsPaid) : "—", mono: true },
        { label: "COGS", value: r.cogsCents != null ? fmtUSD(r.cogsCents) : "—", mono: true },
      ],
      links: [
        { title: "Shop", refs: (() => {
          const sh = db.select().from(s.shop).where(eq(s.shop.id, r.shopId)).get();
          return sh ? [{ type: "shop", id: sh.id, label: sh.name }] : [];
        })() },
        { title: "Product", refs: (() => {
          if (!r.productId) return [];
          const p = db.select().from(s.product).where(eq(s.product.id, r.productId)).get();
          return p ? [{ type: "product", id: p.id, label: p.name }] : [];
        })() },
      ],
    }),
  },

  // ---------- Email ----------
  email: {
    key: "email",
    name: "Email",
    plural: "Emails",
    emoji: "✉️",
    description: "Vendor correspondence. Some emails carry an attached purchase order.",
    list: () => db.select().from(s.email).orderBy(desc(s.email.id)).limit(200).all(),
    count: () => Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.email).get()!.c),
    get: (id) => db.select().from(s.email).where(eq(s.email.id, id)).get() ?? null,
    labelOf: (r) => `email #${r.id}`,
    subtitleOf: (r) => `→ ${r.toAddr}`,
    columns: [
      { key: "id", label: "ID", className: "font-mono text-slate-500", render: (r) => `#${r.id}` },
      { key: "from", label: "From", className: "font-mono text-slate-600", render: (r) => r.fromAddr },
      { key: "to", label: "To", className: "font-mono text-slate-600", render: (r) => r.toAddr },
      { key: "sentDay", label: "Sent", align: "right", render: (r) => `D${r.sentDay} ${r.sentSegment}` },
      { key: "po", label: "Attached PO", render: (r) => r.attachedPurchaseOrderId ? `PO #${r.attachedPurchaseOrderId}` : "—" },
    ],
    detail: (r) => {
      const t = db.select().from(s.emailThread).where(eq(s.emailThread.id, r.threadId)).get();
      const po = r.attachedPurchaseOrderId ? db.select().from(s.purchaseOrder).where(eq(s.purchaseOrder.id, r.attachedPurchaseOrderId)).get() : null;
      return {
        fields: [
          { label: "Subject", value: t?.subject ?? "—" },
          { label: "From", value: r.fromAddr, mono: true },
          { label: "To", value: r.toAddr, mono: true },
          { label: "Sent", value: `Day ${r.sentDay} · ${r.sentSegment}`, mono: true },
          { label: "Body", value: r.body },
        ],
        links: [
          { title: "Attached purchase order", refs: po ? [{ type: "purchase-order", id: po.id, label: `PO #${po.id}` }] : [] },
        ],
      };
    },
  },
};

export function listObjectTypes() {
  return Object.values(OBJECT_TYPES);
}
