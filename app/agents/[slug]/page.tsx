import Link from "next/link";
import { notFound } from "next/navigation";
import { LogicFlow, type FlowStep } from "../../../components/LogicFlow.tsx";
import { AgentTestRun } from "../../../components/AgentTestRun.tsx";
import { db, schema as s } from "../../../db/client.ts";
import { eq, desc, sql, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

const FLOWS: Record<string, { name: string; kind: string; sourceFile: string; flow: FlowStep[]; signature: string }> = {
  "reorder-heuristic": {
    name: "Order more stock",
    kind: "Heuristic Logic Function",
    sourceFile: "sim/agent.ts › proposeReorders(shopId)",
    signature: "shopId: number → AgentProposal[]",
    flow: [
      {
        type: "input",
        label: "Read shop + sim state",
        detail: "shop = SELECT FROM shop WHERE id = shopId\nstate = SELECT FROM sim_state",
        ontology: "Shop · SimState",
      },
      {
        type: "search",
        label: "Compute available storage",
        detail: "Sum (remainingQty × storageWeight) across unexpired batches.\nSubtract qty already in-transit (POs not yet delivered).",
        ontology: "InventoryBatch · PurchaseOrder",
      },
      {
        type: "filter",
        label: "Skip ingredients with pending proposals (idempotency)",
        detail: "Don't pile up duplicate proposals when auto-fired every tick.",
        ontology: "AgentProposal",
      },
      {
        type: "transform",
        label: "Per-ingredient loop",
        detail: "For every (non-tap-supplied) ingredient — tap water + ice are infinite, never reordered.",
        ontology: "Ingredient[]",
        nested: [
          {
            type: "search",
            label: "Estimate consumption + days_of_stock",
            detail: "Yesterday's fulfilled-order × recipe joins → daily consumption.\nFall back to a per-ingredient prior on day 1.",
            ontology: "CustomerOrder ⋈ ProductIngredient",
          },
          {
            type: "decision",
            label: "Stock will run out before next viable delivery?",
            detail: "days_of_stock < lead_time + 1-day safety",
            branchYes: [
              {
                type: "filter",
                label: "Pick vendor",
                detail: "Urgent (≤1 day stock) → fastest first.\nElse → cheapest first that satisfies viability window.",
                ontology: "VendorIngredient ⋈ Vendor",
              },
              {
                type: "transform",
                label: "Compute qty",
                detail: "Target = min(7d, 14d cap for non-perishables, 3d for perishables) × consumption.\nRound up to vendor MOQ.",
              },
              {
                type: "decision",
                label: "Fits storage + cash runway?",
                detail: "qty × storageWeight ≤ remaining storage\ncash − (committed_so_far + total) ≥ 1 week of wages",
                branchYes: [
                  {
                    type: "output",
                    label: "Stage agent_proposal",
                    detail: "kind = purchase_order\nstatus = pending\npayload = { ingredientId, vendorId, qty, unit_price, expected_day }",
                    ontology: "AgentProposal ↰",
                  },
                ],
                branchNo: [
                  {
                    type: "transform",
                    label: "Try downsized order at smaller qty",
                    detail: "Largest MOQ multiple that fits remaining storage + cash. Skip if even one MOQ doesn't fit.",
                  },
                ],
              },
            ],
            branchNo: [],
          },
        ],
      },
    ],
  },

  "reorder-llm": {
    name: "Order more stock (LLM)",
    kind: "Claude Opus 4.7 Logic Function",
    sourceFile: "sim/llm-agent.ts › proposeReordersWithLLM(shopId)",
    signature: "shopId: number → AgentProposal[]",
    flow: [
      {
        type: "input",
        label: "Gather world snapshot",
        detail: "Per-ingredient: current qty, in-transit, daily consumption, days of stock, vendor offers.\nPlus: cash, staff count, yesterday's stockouts/fulfilled.",
        ontology: "Shop · Ingredient · VendorIngredient · CustomerOrder",
      },
      {
        type: "decision",
        label: "Skip if shop.agentStrategy === 'human'",
        detail: "Human-operated teams don't get LLM proposals.",
        branchYes: [
          { type: "output", label: "Return empty decisions", detail: "summary = 'team is human-operated'" },
        ],
        branchNo: [
          {
            type: "transform",
            label: "Build cached system prompt",
            detail: "Frozen prefix: persona, principles ranked, ontology description, this shop's recipes,\nplus a strategy-specific addendum (aggressive_stocker / lean_operator / premium_pricer / volume_king).",
          },
          {
            type: "search",
            label: "Call Claude Opus 4.7",
            detail: "thinking: adaptive · tool: submit_reorder_proposals · cache_control: ephemeral on system\nFirst call: cache write. Subsequent calls: ~10% input cost on the cached prefix.",
            ontology: "anthropic.com/v1/messages",
          },
          {
            type: "transform",
            label: "Extract tool_use block",
            detail: "Schema-validated: decisions[] with ingredient_id, vendor_id, qty, expected_unit_price_cents, rationale, email_subject, email_body.",
          },
          {
            type: "output",
            label: "Stage agent_proposal per decision",
            detail: "kind = purchase_order, status = pending\npayload includes the LLM-composed email_subject + email_body.\nApproval action will use those instead of templates.",
            ontology: "AgentProposal ↰",
          },
        ],
      },
    ],
  },

  "pricing": {
    name: "Adjust prices",
    kind: "Heuristic Logic Function",
    sourceFile: "sim/pricing-agent.ts › proposePriceChanges(shopId)",
    signature: "shopId: number → AgentProposal[]",
    flow: [
      {
        type: "input",
        label: "Aggregate last 2 days of orders per product",
        detail: "GROUP BY status: fulfilled · stockout · balked_price · balked_wait · product_off",
        ontology: "CustomerOrder",
      },
      {
        type: "filter",
        label: "Skip products with < 30 events (insufficient signal)",
      },
      {
        type: "decision",
        label: "Pricing signal",
        detail: "balkPriceRate = balked_price / total_events",
        branchYes: [
          {
            type: "decision",
            label: "balkPriceRate > 0.30 → overpriced",
            branchYes: [
              { type: "output", label: "Stage price_update −8%", detail: "Sized to recover demand without crushing margin.", ontology: "AgentProposal ↰" },
            ],
            branchNo: [
              {
                type: "decision",
                label: "balkPriceRate < 0.05 AND fulfilled > 30 AND stockout < 0.10 → headroom",
                branchYes: [
                  { type: "output", label: "Stage price_update +5%", ontology: "AgentProposal ↰" },
                ],
                branchNo: [{ type: "filter", label: "Skip — keep current price" }],
              },
            ],
          },
        ],
        branchNo: [],
      },
    ],
  },
};

export default async function AgentDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = FLOWS[slug];
  if (!def) notFound();

  // Recent proposals from this agent for the right rail.
  const agentNameMap: Record<string, string> = {
    "reorder-heuristic": "reorder",
    "reorder-llm": "reorder-llm",
    "pricing": "pricing",
  };
  const recentProposals = db.select().from(s.agentProposal)
    .where(eq(s.agentProposal.agentName, agentNameMap[slug] ?? slug))
    .orderBy(desc(s.agentProposal.id))
    .limit(15)
    .all();

  // Counts by status.
  const totals = db.select({
    status: s.agentProposal.status,
    c: sql<number>`COUNT(*)`,
  })
    .from(s.agentProposal)
    .where(eq(s.agentProposal.agentName, agentNameMap[slug] ?? slug))
    .groupBy(s.agentProposal.status)
    .all();

  const allShops = db.select().from(s.shop).orderBy(s.shop.id).all().map((sh) => ({ id: sh.id, name: sh.name, colorHex: sh.colorHex }));

  return (
    <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-44px)]">
      {/* Main editor area */}
      <div className="col-span-9 px-6 py-6 border-r border-slate-200">
        <div className="mb-3 text-[12px]">
          <Link href="/agents" className="text-slate-500 hover:underline">← All Logic Functions</Link>
        </div>
        <div className="mb-5 flex items-baseline gap-3">
          <h1 className="font-serif text-2xl text-coffee-900">𝒇 {def.name}</h1>
          <span className="pill pill-slate">{def.kind}</span>
          <span className="ml-auto text-[11px] text-slate-500 font-mono">{def.sourceFile}</span>
        </div>

        <div className="bg-cream-50 border border-cream-300 rounded px-4 py-2 mb-5 flex items-baseline gap-2 text-[12px] font-mono">
          <span className="text-coffee-600">signature:</span>
          <span className="text-slate-800">{def.signature}</span>
        </div>

        <LogicFlow steps={def.flow} />

        <div className="mt-5">
          <AgentTestRun agentSlug={slug as "reorder-heuristic" | "reorder-llm" | "pricing"} shops={allShops} />
        </div>

        <div className="mt-6 px-4 py-2 border-t border-slate-200 text-[12px] text-slate-500 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
          No compilation errors detected
        </div>
      </div>

      {/* Right rail — Uses + Deployments + recent proposals */}
      <aside className="col-span-3 px-5 py-6 bg-slate-50/60 space-y-4 text-[12px]">
        <div>
          <div className="font-medium text-slate-800 mb-2">Uses</div>
          <div className="space-y-2">
            <UsedRow label="Published function" sublabel={def.name} status="ok" />
            <UsedRow label="Auto-runs from" sublabel="tick() in sim/tick.ts" status="ok" />
            <UsedRow label="Approval target" sublabel="approveProposal() in sim/agent.ts" status="ok" />
          </div>
        </div>

        <div>
          <div className="font-medium text-slate-800 mb-2">Status</div>
          <div className="space-y-1.5">
            {totals.map((t) => {
              const cls = t.status === "approved" ? "pill-green" : t.status === "rejected" ? "pill-red" : t.status === "auto_executed" ? "pill-amber" : "pill-slate";
              return (
                <div key={t.status} className="flex items-center justify-between">
                  <span className={`pill ${cls}`}>{String(t.status).replace("_", " ")}</span>
                  <span className="font-mono tabular-nums text-slate-700">{Number(t.c).toLocaleString()}</span>
                </div>
              );
            })}
            {totals.length === 0 && <div className="text-slate-500 italic">No proposals yet — tick the sim.</div>}
          </div>
        </div>

        <div>
          <div className="font-medium text-slate-800 mb-2">Recent runs</div>
          <ul className="divide-y divide-slate-100 bg-white border border-slate-200 rounded">
            {recentProposals.length === 0 && <li className="px-3 py-2 text-slate-500 italic">No runs yet.</li>}
            {recentProposals.map((p) => (
              <li key={p.id}>
                <Link href={`/objects/agent-proposal/${p.id}`} className="block px-3 py-2 hover:bg-slate-50">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-slate-700">#{p.id}</span>
                    <span className="text-[10px] text-slate-500">D{p.createdDay} {p.createdSegment}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 truncate">{p.rationale}</div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function UsedRow({ label, sublabel, status }: { label: string; sublabel: string; status: "ok" | "warn" }) {
  const dotCls = status === "ok" ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div className="bg-white border border-slate-200 rounded px-3 py-2 flex items-start gap-2">
      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${dotCls} inline-block shrink-0`} />
      <div>
        <div className="text-slate-700">{label}</div>
        <div className="text-[11px] text-slate-500 font-mono">{sublabel}</div>
      </div>
    </div>
  );
}
