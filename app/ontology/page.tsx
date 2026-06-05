import Link from "next/link";
import { db, schema as s } from "../../db/client.ts";
import { sql, desc, eq } from "drizzle-orm";
import { fmtUSD, STRATEGY_META } from "../../lib/data.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ontology" };

// ---------- Live counts ----------
function liveCounts() {
  const c = (n: number) => Number(n);
  return {
    Customer:          c(db.select({ c: sql<number>`COUNT(*)` }).from(s.customer).get()!.c),
    CustomerOrder:     c(db.select({ c: sql<number>`COUNT(*)` }).from(s.customerOrder).get()!.c),
    Review:            c(db.select({ c: sql<number>`COUNT(*)` }).from(s.review).get()!.c),
    Product:           c(db.select({ c: sql<number>`COUNT(*)` }).from(s.product).get()!.c),
    Ingredient:        c(db.select({ c: sql<number>`COUNT(*)` }).from(s.ingredient).get()!.c),
    Recipe:            c(db.select({ c: sql<number>`COUNT(*)` }).from(s.productIngredient).get()!.c),
    Shop:              c(db.select({ c: sql<number>`COUNT(*)` }).from(s.shop).get()!.c),
    AgentProposal:     c(db.select({ c: sql<number>`COUNT(*)` }).from(s.agentProposal).get()!.c),
    PurchaseOrder:     c(db.select({ c: sql<number>`COUNT(*)` }).from(s.purchaseOrder).get()!.c),
    InventoryBatch:    c(db.select({ c: sql<number>`COUNT(*)` }).from(s.inventoryBatch).get()!.c),
    Vendor:            c(db.select({ c: sql<number>`COUNT(*)` }).from(s.vendor).get()!.c),
    VendorIngredient:  c(db.select({ c: sql<number>`COUNT(*)` }).from(s.vendorIngredient).get()!.c),
    EmailThread:       c(db.select({ c: sql<number>`COUNT(*)` }).from(s.emailThread).get()!.c),
    Email:             c(db.select({ c: sql<number>`COUNT(*)` }).from(s.email).get()!.c),
  };
}

// ---------- Graph nodes / edges (lane-based) ----------
type Group = "demand" | "menu" | "shop" | "supply" | "agent" | "comms";

const GROUP_META: Record<Group, { label: string; accent: string; tint: string }> = {
  demand: { label: "Demand",  accent: "#C2410C", tint: "#FFF7ED" },
  menu:   { label: "Menu",    accent: "#6D28D9", tint: "#F5F3FF" },
  shop:   { label: "Shop",    accent: "#8B6F47", tint: "#FAF7EF" },
  supply: { label: "Supply",  accent: "#047857", tint: "#ECFDF5" },
  agent:  { label: "Agent",   accent: "#B45309", tint: "#FEF3C7" },
  comms:  { label: "Comms",   accent: "#1D4ED8", tint: "#EFF6FF" },
};

interface Node {
  key: string;
  label: string;
  href: string;
  group: Group;
  gx: number; // 0..3 columns
  gy: number; // 0..4 rows
  count: number;
}

const COL_W = 230;
const ROW_H = 100;
const NODE_W = 184;
const NODE_H = 60;
const PADDING_X = 56;
const PADDING_Y = 86;

function buildNodes(c: ReturnType<typeof liveCounts>): Node[] {
  return [
    { key: "Customer",         label: "Customer",         href: "/objects/customer-order",  group: "demand", gx: 0, gy: 0, count: c.Customer },
    { key: "CustomerOrder",    label: "Customer Order",   href: "/objects/customer-order",  group: "demand", gx: 0, gy: 1, count: c.CustomerOrder },
    { key: "Review",           label: "Review",           href: "/objects/customer-order",  group: "demand", gx: 0, gy: 2, count: c.Review },

    { key: "Product",          label: "Product",          href: "/objects/product",         group: "menu",   gx: 1, gy: 0, count: c.Product },
    { key: "Recipe",           label: "Recipe",           href: "/objects/product",         group: "menu",   gx: 1, gy: 1, count: c.Recipe },
    { key: "Ingredient",       label: "Ingredient",       href: "/objects/ingredient",      group: "menu",   gx: 1, gy: 2, count: c.Ingredient },

    { key: "Shop",             label: "Shop",             href: "/objects/shop",            group: "shop",   gx: 2, gy: 0, count: c.Shop },
    { key: "AgentProposal",    label: "Agent Proposal",   href: "/objects/agent-proposal",  group: "agent",  gx: 2, gy: 2, count: c.AgentProposal },

    { key: "PurchaseOrder",    label: "Purchase Order",   href: "/objects/purchase-order",  group: "supply", gx: 3, gy: 0, count: c.PurchaseOrder },
    { key: "InventoryBatch",   label: "Inventory Batch",  href: "/objects/inventory-batch", group: "supply", gx: 3, gy: 1, count: c.InventoryBatch },
    { key: "Vendor",           label: "Vendor",           href: "/objects/vendor",          group: "supply", gx: 3, gy: 2, count: c.Vendor },
    { key: "VendorIngredient", label: "Vendor Offering",  href: "/objects/vendor-ingredient", group: "supply", gx: 3, gy: 3, count: c.VendorIngredient },

    { key: "Email",            label: "Email",            href: "/objects/email",           group: "comms",  gx: 2, gy: 3, count: c.Email },
    { key: "EmailThread",      label: "Email Thread",     href: "/objects/email",           group: "comms",  gx: 1, gy: 3, count: c.EmailThread },
  ];
}

// ---------- Edges with action labels ----------
const EDGES: { from: string; to: string; action: string; dashed?: boolean }[] = [
  { from: "CustomerOrder", to: "Customer", action: "by" },
  { from: "Review", to: "CustomerOrder", action: "Generate Review" },
  { from: "CustomerOrder", to: "Product", action: "Order Drink" },
  { from: "Product", to: "Recipe", action: "has" },
  { from: "Recipe", to: "Ingredient", action: "of" },
  { from: "Product", to: "Shop", action: "in" },
  { from: "VendorIngredient", to: "Ingredient", action: "of", dashed: true },
  { from: "VendorIngredient", to: "Vendor", action: "from" },
  { from: "PurchaseOrder", to: "Vendor", action: "Place Order" },
  { from: "PurchaseOrder", to: "Shop", action: "for" },
  { from: "PurchaseOrder", to: "InventoryBatch", action: "Receive Delivery" },
  { from: "InventoryBatch", to: "Shop", action: "in", dashed: true },
  { from: "AgentProposal", to: "Shop", action: "for" },
  { from: "AgentProposal", to: "PurchaseOrder", action: "Approve" },
  { from: "Email", to: "PurchaseOrder", action: "Send Email" },
  { from: "Email", to: "EmailThread", action: "in" },
  { from: "EmailThread", to: "Vendor", action: "with", dashed: true },
];

function nodePos(n: Node) {
  return { x: PADDING_X + n.gx * COL_W, y: PADDING_Y + n.gy * ROW_H, w: NODE_W, h: NODE_H };
}

function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const cx1 = from.x + (horizontal ? dx * 0.45 : 0);
  const cy1 = from.y + (horizontal ? 0 : dy * 0.45);
  const cx2 = to.x - (horizontal ? dx * 0.45 : 0);
  const cy2 = to.y - (horizontal ? 0 : dy * 0.45);
  return `M ${from.x} ${from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`;
}

function anchors(from: Node, to: Node) {
  const f = nodePos(from);
  const t = nodePos(to);
  const dx = (t.x + t.w / 2) - (f.x + f.w / 2);
  const dy = (t.y + t.h / 2) - (f.y + f.h / 2);
  if (Math.abs(dx) > Math.abs(dy) * 1.3) {
    return dx > 0
      ? { from: { x: f.x + f.w, y: f.y + f.h / 2 }, to: { x: t.x, y: t.y + t.h / 2 } }
      : { from: { x: f.x, y: f.y + f.h / 2 }, to: { x: t.x + t.w, y: t.y + t.h / 2 } };
  }
  return dy > 0
    ? { from: { x: f.x + f.w / 2, y: f.y + f.h }, to: { x: t.x + t.w / 2, y: t.y } }
    : { from: { x: f.x + f.w / 2, y: f.y }, to: { x: t.x + t.w / 2, y: t.y + t.h } };
}

// "Action" edges — these are operational flows we want to call out specifically.
const ACTION_EDGE_KEYS = new Set([
  "Review→CustomerOrder",
  "CustomerOrder→Product",
  "PurchaseOrder→Vendor",
  "PurchaseOrder→InventoryBatch",
  "AgentProposal→PurchaseOrder",
  "Email→PurchaseOrder",
]);

function isActionEdge(e: { from: string; to: string }) {
  return ACTION_EDGE_KEYS.has(`${e.from}→${e.to}`);
}

export default function OntologyPage() {
  const counts = liveCounts();
  const nodes = buildNodes(counts);
  const nodeByKey = Object.fromEntries(nodes.map((n) => [n.key, n]));

  const W = PADDING_X * 2 + 4 * COL_W;
  const H = PADDING_Y * 2 + 5 * ROW_H;

  // Sample shop for the side card.
  const sampleShop = db.select().from(s.shop).where(eq(s.shop.agentStrategy, "human")).get();
  const sampleStats = sampleShop ? {
    cash: sampleShop.cashCents,
    staff: sampleShop.staffCount,
    storage: sampleShop.storageCapacityUnits,
    proposals: Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.agentProposal).where(eq(s.agentProposal.shopId, sampleShop.id)).get()!.c),
    orders: Number(db.select({ c: sql<number>`COUNT(*)` }).from(s.customerOrder).where(eq(s.customerOrder.shopId, sampleShop.id)).get()!.c),
  } : null;

  return (
    <div className="bg-cream-50">
      {/* Title bar — full-width */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="font-serif text-3xl text-slate-900">Ontology System</h1>
      </div>

      {/* Body */}
      <div className="px-6 py-6 max-w-[1400px] mx-auto">
        {/* AI + Human Teaming chip row */}
        <div className="flex flex-col items-center mb-6">
          <div className="text-[11px] uppercase tracking-[3px] text-slate-500 mb-3">AI + Human teaming</div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <Chip>Multimodal</Chip>
            <Chip>Open Source</Chip>
            <Chip>Commercial</Chip>
            <span className="text-slate-300 px-1">+</span>
            <Chip>Operators</Chip>
            <Chip>Developers</Chip>
            <Chip>Analysts</Chip>
          </div>
        </div>

        {/* Top tier — surfaces above the platform */}
        <div className="grid grid-cols-3 gap-4 mb-2">
          <SurfaceCard title="Analytics & Workflows" links={[
            { label: "Workshop", href: "/workshop" },
            { label: "Performance (per team)", href: "/team/1/performance" },
            { label: "Audit log", href: "/audit" },
          ]} />
          <SurfaceCard title="Automations" links={[
            { label: "Reorder agent (heuristic)", href: "/agents/reorder-heuristic" },
            { label: "Reorder agent (LLM)", href: "/agents/reorder-llm" },
            { label: "Pricing agent", href: "/agents/pricing" },
          ]} />
          <SurfaceCard title="Products & SDKs" links={[
            { label: "Brew dashboard", href: "/team/1" },
            { label: "Menuccino", href: "/team/1/menuccino" },
            { label: "MochaMail", href: "/team/1/mochamail" },
            { label: "Proposals", href: "/team/1/proposals" },
          ]} />
        </div>

        {/* Connector lines — visual: 3 short arrows pointing to platform */}
        <div className="flex justify-around max-w-3xl mx-auto py-1">
          <div className="h-4 border-l border-slate-300 border-dashed" />
          <div className="h-4 border-l border-slate-300 border-dashed" />
          <div className="h-4 border-l border-slate-300 border-dashed" />
        </div>

        {/* Central platform — graph + side card */}
        <div className="grid grid-cols-12 gap-4 mb-2">
          <div className="col-span-3">
            {sampleShop && sampleStats && (
              <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4">
                <div className="text-[10px] uppercase tracking-[2px] text-slate-500 mb-2">Sample Object</div>
                <div className="text-[11px] text-slate-500 mb-1">Shop</div>
                <div className="font-serif text-lg text-slate-900 mb-3">{sampleShop.name}</div>
                <dl className="space-y-1.5 text-[12px]">
                  <Pair label="Status" value={<span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Running</span>} />
                  <Pair label="Strategy" value={STRATEGY_META[sampleShop.agentStrategy]?.label ?? sampleShop.agentStrategy} />
                  <Pair label="Cash" value={fmtUSD(sampleStats.cash)} mono />
                  <Pair label="Staff" value={String(sampleStats.staff)} mono />
                  <Pair label="Storage cap" value={`${sampleStats.storage.toLocaleString()} units`} mono />
                  <Pair label="Lifetime orders" value={sampleStats.orders.toLocaleString()} mono />
                  <Pair label="Open proposals" value={String(sampleStats.proposals)} mono />
                </dl>
                <Link href={`/objects/shop/${sampleShop.id}`} className="block mt-3 text-[11px] text-coffee-700 hover:underline">Open in Object Explorer →</Link>
              </div>
            )}
          </div>

          {/* Graph */}
          <div className="col-span-9 bg-white border border-slate-200 rounded-md shadow-sm overflow-x-auto">
            <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <div className="text-[12px] text-slate-700 font-medium">Entity graph</div>
              <div className="text-[10px] text-slate-500 flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-px w-5 bg-slate-500" />FK</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-px w-5 border-t border-dashed border-slate-400" />Derived</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-3 rounded-sm bg-coffee-600" />Action</span>
              </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minHeight: 520, display: "block" }}>
              <defs>
                <marker id="arrow-fk" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L12,6 L0,12 z" fill="#94A3B8" />
                </marker>
                <marker id="arrow-fk-dashed" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L12,6 L0,12 z" fill="#CBD5E1" />
                </marker>
                <marker id="arrow-action" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L12,6 L0,12 z" fill="#8B6F47" />
                </marker>
                <filter id="card-shadow" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.08" />
                </filter>
              </defs>

              {/* Lane backgrounds */}
              {[0, 1, 2, 3].map((col) => (
                <rect key={col}
                  x={PADDING_X + col * COL_W - 22} y={PADDING_Y - 28}
                  width={NODE_W + 44} height={5 * ROW_H - 30}
                  fill="#FAFAFA" rx="10" stroke="#E2E8F0" strokeDasharray="3 4"
                />
              ))}
              {["Demand", "Menu", "Shop / Agent", "Supply"].map((lbl, i) => (
                <text key={lbl}
                  x={PADDING_X + i * COL_W + NODE_W / 2}
                  y={PADDING_Y - 42}
                  textAnchor="middle"
                  fontSize="9" letterSpacing="2" fill="#94A3B8" fontWeight="600"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >{lbl.toUpperCase()}</text>
              ))}

              {/* Edges */}
              {EDGES.map((e, i) => {
                const from = nodeByKey[e.from];
                const to = nodeByKey[e.to];
                if (!from || !to) return null;
                const a = anchors(from, to);
                const path = bezierPath(a.from, a.to);
                const midX = (a.from.x + a.to.x) / 2;
                const midY = (a.from.y + a.to.y) / 2;
                const isAction = isActionEdge(e);
                const stroke = isAction ? "#8B6F47" : e.dashed ? "#CBD5E1" : "#94A3B8";
                const marker = isAction ? "url(#arrow-action)" : e.dashed ? "url(#arrow-fk-dashed)" : "url(#arrow-fk)";
                return (
                  <g key={i}>
                    <path d={path} fill="none"
                      stroke={stroke}
                      strokeWidth={isAction ? 1.6 : e.dashed ? 1 : 1.3}
                      strokeDasharray={e.dashed ? "5 4" : undefined}
                      markerEnd={marker}
                    />
                    {/* Label badge — action edges in coffee accent, regular ones in slate */}
                    {isAction ? (
                      <g>
                        <rect
                          x={midX - (e.action.length * 3.4) - 8}
                          y={midY - 10}
                          width={(e.action.length * 6.8) + 16}
                          height={20}
                          fill="#FAF7EF" stroke="#A98562" strokeWidth="1" rx="10"
                        />
                        <text x={midX} y={midY + 4} textAnchor="middle"
                          fontSize="10" fontWeight="600" fill="#5C4830"
                          fontFamily="ui-sans-serif, system-ui, sans-serif"
                        >{e.action}</text>
                      </g>
                    ) : (
                      <g>
                        <rect
                          x={midX - (e.action.length * 3.2) - 5}
                          y={midY - 8}
                          width={(e.action.length * 6.4) + 10}
                          height={16}
                          fill="white" stroke="#E2E8F0" strokeWidth="0.75" rx="3"
                        />
                        <text x={midX} y={midY + 3} textAnchor="middle"
                          fontSize="10" fill="#475569"
                          fontFamily="ui-sans-serif, system-ui, sans-serif"
                        >{e.action}</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map((n) => {
                const p = nodePos(n);
                const meta = GROUP_META[n.group];
                return (
                  <g key={n.key} filter="url(#card-shadow)">
                    <a href={n.href}>
                      <rect x={p.x} y={p.y} width={p.w} height={p.h}
                        fill="white" stroke={meta.accent} strokeOpacity="0.6" strokeWidth="1.5" rx="8"
                      />
                      <rect x={p.x} y={p.y} width="3" height={p.h} fill={meta.accent} rx="2" />
                      <text x={p.x + 14} y={p.y + 24} fontSize="13" fontWeight="600" fill="#1F2937"
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                      >{n.label}</text>
                      <text x={p.x + 14} y={p.y + 42} fontSize="9" letterSpacing="1.5" fill={meta.accent} fontWeight="600"
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                      >{meta.label.toUpperCase()}</text>
                      <rect x={p.x + p.w - 50} y={p.y + p.h / 2 - 11} width="38" height="22" rx="11" fill="#F1F5F9" />
                      <text x={p.x + p.w - 31} y={p.y + p.h / 2 + 4} textAnchor="middle"
                        fontSize="11" fontFamily="ui-monospace, monospace" fill="#475569" fontWeight="600"
                      >{n.count.toLocaleString()}</text>
                    </a>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Connector lines down to bottom tier */}
        <div className="flex justify-around max-w-3xl mx-auto py-1">
          <div className="h-4 border-l border-slate-300 border-dashed" />
          <div className="h-4 border-l border-slate-300 border-dashed" />
          <div className="h-4 border-l border-slate-300 border-dashed" />
        </div>

        {/* Bottom tier — sources of data, logic, and action */}
        <div className="grid grid-cols-3 gap-4">
          <SourceCard title="Data Sources" chips={[
            "Pedestrian flow",
            "Customer orders",
            "Reviews",
            "Vendor catalog",
            "Sim clock",
            "Daily snapshots",
          ]} />
          <SourceCard title="Logic Sources" chips={[
            "Reorder heuristic",
            "Reorder LLM (Opus 4.7)",
            "Pricing heuristic",
            "Customer routing",
            "FEFO depletion",
            "Storage caps",
          ]} />
          <SourceCard title="Systems of Action" chips={[
            "Place purchase order",
            "Send vendor email",
            "Receive delivery",
            "Update product price",
            "Toggle product on/off",
            "Adjust staffing",
          ]} />
        </div>
      </div>
    </div>
  );
}

// ---------- Small components ----------

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-slate-300 text-slate-700 text-[11px] font-medium">
      {children}
    </span>
  );
}

function Pair({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-b-0 last:pb-0">
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`${mono ? "font-mono tabular-nums" : ""} text-slate-800`}>{value}</dd>
    </div>
  );
}

function SurfaceCard({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-sm">
      <div className="px-4 py-2.5 border-b border-slate-200">
        <div className="text-[10px] uppercase tracking-[2px] text-slate-500">{title}</div>
      </div>
      <div className="p-3 grid grid-cols-1 gap-1">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="px-2 py-1.5 rounded text-[12px] text-slate-700 hover:bg-slate-50 hover:text-coffee-800 flex items-center justify-between group">
            <span>{l.label}</span>
            <span className="text-slate-300 group-hover:text-coffee-600">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SourceCard({ title, chips }: { title: string; chips: string[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-sm">
      <div className="px-4 py-2.5 border-b border-slate-200">
        <div className="text-[10px] uppercase tracking-[2px] text-slate-500">{title}</div>
      </div>
      <div className="p-3 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span key={chip} className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium">
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}
