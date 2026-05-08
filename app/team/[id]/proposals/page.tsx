import { notFound } from "next/navigation";
import { getShop, getProposals, fmtUSD } from "../../../../lib/data.ts";
import { ProposalActions } from "../../../../components/ProposalActions.tsx";

export const dynamic = "force-dynamic";

export default async function TeamProposals({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shopId = Number(id);
  const shop = getShop(shopId);
  if (!shop) notFound();
  const proposals = getProposals(shopId);
  const pending = proposals.filter((p) => p.status === "pending");
  const decided = proposals.filter((p) => p.status !== "pending");
  const isHuman = shop.agentStrategy === "human";

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="bg-white border border-slate-200 rounded-md px-4 py-3 text-[13px] text-slate-700">
        {isHuman
          ? <span>This is the human-operated team — the AI doesn't propose orders here. Use the <a href={`/team/${shopId}/menuccino`} className="underline">Menuccino</a> tab to direct inventory and pricing yourself.</span>
          : <span>The reorder agent fires when you click <em>Run agent (LLM)</em> in the top bar. Each proposal stages a Purchase Order + draft email — you approve or reject. {shop.autoApprove && <span className="text-amber-700">Auto-approve is on for this team — proposals execute on creation.</span>}</span>
        }
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-medium text-slate-800">Pending review</h2>
          <span className="text-[11px] text-slate-500">{pending.length} awaiting decision</span>
        </div>
        <div className="space-y-3">
          {pending.length === 0 && (
            <div className="bg-white border border-dashed border-slate-300 rounded-md px-4 py-8 text-center text-sm text-slate-500">
              {isHuman ? "Human-operated team — no AI proposals." : "No pending proposals. Run the agent in the top bar."}
            </div>
          )}
          {pending.map((p) => (
            <ProposalCard key={p.id} p={p} />
          ))}
        </div>
      </section>

      {decided.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-medium text-slate-800">History</h2>
            <span className="text-[11px] text-slate-500">{decided.length} decided</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
            {decided.slice(0, 30).map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-4 text-[13px]">
                <span className="font-mono text-slate-500 w-12">#{p.id}</span>
                <span className={`pill ${p.kind === "price_update" ? "pill-amber" : "pill-slate"} w-20`}>
                  {p.kind === "price_update" ? "price" : "reorder"}
                </span>
                {p.kind === "purchase_order" ? (
                  <>
                    <span className="font-mono text-slate-700 w-32 truncate">{p.ingredientName}</span>
                    <span className="tabular-nums text-slate-600 w-24 text-right">{(p.qty ?? 0).toLocaleString()} {p.ingredientUnit}</span>
                    <span className="text-slate-600 flex-1 truncate">{p.vendorName}</span>
                    <span className="tabular-nums text-slate-700 w-20 text-right">{p.totalCents != null ? fmtUSD(p.totalCents) : "—"}</span>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-slate-700 w-32 truncate">{p.productName}</span>
                    <span className="tabular-nums text-slate-600 flex-1">{p.oldPriceCents != null ? fmtUSD(p.oldPriceCents) : "—"} → {p.newPriceCents != null ? fmtUSD(p.newPriceCents) : "—"}</span>
                    <span className="w-20" />
                  </>
                )}
                <span className="text-slate-500 w-32 text-right">Day {p.createdDay} · {p.createdSegment}</span>
                <ProposalActions proposalId={p.id} status={p.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ProposalCard({ p }: { p: ReturnType<typeof getProposals>[number] }) {
  const isLLM = p.agentName === "reorder-llm";
  const isPriceUpdate = p.kind === "price_update";
  const changePct = (p.oldPriceCents != null && p.newPriceCents != null)
    ? ((p.newPriceCents - p.oldPriceCents) / p.oldPriceCents) * 100
    : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <header className="px-5 py-3 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
        <span className={`pill ${isPriceUpdate ? "pill-amber" : isLLM ? "pill-amber" : "pill-slate"}`}>
          {isPriceUpdate ? "💵 pricing" : isLLM ? "🤖 LLM reorder" : "📦 reorder"}
        </span>
        {isPriceUpdate ? (
          <>
            <span className="font-mono text-slate-700">{p.productName}</span>
            <span className="text-slate-300">→</span>
            <span className={changePct > 0 ? "text-emerald-700" : "text-rose-700"}>
              {changePct > 0 ? "+" : ""}{changePct.toFixed(1)}%
            </span>
          </>
        ) : (
          <>
            <span className="font-mono text-slate-700">{p.ingredientName}</span>
            <span className="text-slate-300">→</span>
            <span className="text-slate-700">{p.vendorName}</span>
          </>
        )}
        <span className="ml-auto text-[11px] text-slate-500">proposed Day {p.createdDay} · {p.createdSegment}</span>
      </header>
      <div className="grid grid-cols-12 gap-0">
        <div className="col-span-4 p-5 border-r border-slate-100">
          {isPriceUpdate ? (
            <>
              <Field label="Product" value={p.productName ?? "—"} />
              <Field label="Current price" value={p.oldPriceCents != null ? fmtUSD(p.oldPriceCents) : "—"} />
              <Field label="Suggested price" value={p.newPriceCents != null ? fmtUSD(p.newPriceCents) : "—"} large />
              <Field label="Change" value={`${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`} />
            </>
          ) : (
            <>
              <Field label="Quantity" value={`${(p.qty ?? 0).toLocaleString()} ${p.ingredientUnit ?? ""}`} />
              <Field label="Unit price" value={`${p.unitPriceCents}¢ / ${p.ingredientUnit ?? ""}`} />
              <Field label="Total" value={p.totalCents != null ? fmtUSD(p.totalCents) : "—"} large />
              <Field label="Expected delivery" value={`Day ${p.expectedDay ?? "?"}`} />
            </>
          )}
        </div>
        <div className="col-span-8 p-5">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Agent rationale</div>
          <p className="text-[13px] text-slate-800 leading-relaxed mb-4 whitespace-pre-wrap">{p.rationale}</p>
          {p.emailSubject && (
            <details className="border border-slate-200 rounded">
              <summary className="cursor-pointer px-3 py-2 bg-slate-50 text-[12px] text-slate-700">
                ✉️ Draft email · {p.emailSubject}
              </summary>
              <pre className="px-4 py-3 whitespace-pre-wrap font-sans text-[12px] text-slate-700 leading-relaxed">{p.emailBody}</pre>
            </details>
          )}
          <div className="mt-4 flex items-center justify-end">
            <ProposalActions proposalId={p.id} status={p.status} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`tabular-nums ${large ? "text-2xl font-semibold text-coffee-900" : "text-[14px] text-slate-800"}`}>{value}</div>
    </div>
  );
}
