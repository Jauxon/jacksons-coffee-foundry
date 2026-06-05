import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Logic Functions" };

const AGENTS = [
  {
    slug: "reorder-heuristic",
    name: "Order more stock",
    kind: "Heuristic Logic Function",
    triggers: "Every tick · idempotent",
    output: "agent_proposal (kind=purchase_order)",
    blurb: "Walks the inventory ontology and emits reorder proposals. Honors storage capacity, MOQ, perishable cap, and cumulative cash runway.",
  },
  {
    slug: "reorder-llm",
    name: "Order more stock (LLM)",
    kind: "Claude Opus 4.7 Logic Function",
    triggers: "Manual · invoked from team page",
    output: "agent_proposal (kind=purchase_order) with composed email",
    blurb: "Reads the same world snapshot as the heuristic and uses tool-use to emit decisions plus a vendor email. Strategy varies by team (aggressive_stocker vs lean_operator vs …).",
  },
  {
    slug: "pricing",
    name: "Adjust prices",
    kind: "Heuristic Logic Function",
    triggers: "Once per day · evening segment",
    output: "agent_proposal (kind=price_update)",
    blurb: "Looks at the last 2 days of customer orders per product. Suggests −8% if balked-on-price > 30%; +5% if balked < 5% and stockout rate < 10%.",
  },
];

export default function AgentsIndex() {
  return (
    <div className="px-6 py-6">
      <div className="mb-5">
        <h1 className="font-serif text-2xl text-coffee-900">Logic Functions</h1>
        <p className="text-sm text-slate-500">Read-only editor view of every Logic Function in this build space. Click one to inspect its decision flow.</p>
      </div>

      <div className="space-y-3">
        {AGENTS.map((a) => (
          <Link key={a.slug} href={`/agents/${a.slug}`} className="block group">
            <div className="bg-white border border-slate-200 rounded-md px-5 py-4 hover:border-coffee-400 hover:shadow-sm transition">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-coffee-700">𝒇 </span>
                <h2 className="font-medium text-slate-900 group-hover:underline">{a.name}</h2>
                <span className="pill pill-slate">{a.kind}</span>
              </div>
              <p className="text-[13px] text-slate-700 leading-relaxed mb-2">{a.blurb}</p>
              <div className="text-[11px] text-slate-500 flex gap-4">
                <span><span className="text-slate-400">trigger:</span> {a.triggers}</span>
                <span><span className="text-slate-400">output:</span> <span className="font-mono">{a.output}</span></span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
