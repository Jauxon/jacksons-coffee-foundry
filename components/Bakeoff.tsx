"use client";

import { useState, useTransition } from "react";
import { runBakeoff, type BakeoffResult, type BakeoffComparison } from "../app/actions.ts";

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(4)}`);

export function Bakeoff({ shops }: { shops: { id: number; name: string }[] }) {
  const [shopId, setShopId] = useState<number>(shops[0]?.id ?? 0);
  const [results, setResults] = useState<BakeoffResult[] | null>(null);
  const [comparison, setComparison] = useState<BakeoffComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const r = await runBakeoff(shopId);
      if (r.ok) { setResults(r.results); setComparison(r.comparison); }
      else setError(r.error);
    });
  };

  const ok = (results ?? []).filter((r) => r.ok);
  const maxCost = Math.max(...ok.map((r) => r.costUsd), 1e-9);
  const maxLatency = Math.max(...ok.map((r) => r.latencyMs), 1);
  const cheapest = ok.length ? ok.reduce((a, b) => (b.costUsd < a.costUsd ? b : a)) : null;
  const opus = ok.find((r) => r.model.includes("opus"));

  return (
    <div className="bg-white border border-slate-200 rounded-md">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-medium text-slate-800 text-[14px]">Model bake-off</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Same reorder scenario, three Claude tiers. Compares cost &amp; latency — and the actual decisions, so you see where they agree or diverge.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <select value={shopId} onChange={(e) => setShopId(Number(e.target.value))} className="border border-slate-300 rounded px-2 py-1 bg-white" disabled={pending}>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={run} disabled={pending} className="px-3 py-1 rounded border bg-coffee-600 text-white border-coffee-600 hover:bg-coffee-800 disabled:opacity-50">
            {pending ? "Running 3 calls…" : "Run bake-off"}
          </button>
        </div>
      </div>

      <div className="p-4">
        {error && <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">{error}</div>}

        {!results && !error && (
          <p className="text-[12px] text-slate-500 italic">
            Pick a team and run it — fires the identical prompt at Opus 4.7, Sonnet 4.6, and Haiku 4.5, then shows what each tier charged and exactly which reorders each one chose. (3 Claude calls; counts against the instance budget.)
          </p>
        )}

        {results && (
          <div className="space-y-4">
            {/* Cost / latency cards */}
            <div className="grid sm:grid-cols-3 gap-3">
              {results.map((r) => {
                const isCheapest = cheapest && r.ok && r.model === cheapest.model;
                return (
                  <div key={r.model} className={`rounded-md border px-3 py-2.5 ${isCheapest ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200"}`}>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="font-medium text-slate-900 text-[13px]">{r.label}</span>
                      {isCheapest && <span className="pill pill-green text-[10px] uppercase tracking-wider">cheapest</span>}
                      {!r.ok && <span className="pill pill-red text-[10px]" title={r.error}>error</span>}
                      <span className="ml-auto font-mono tabular-nums font-semibold text-[14px]">{r.ok ? usd(r.costUsd) : "—"}</span>
                    </div>
                    {r.ok ? (
                      <>
                        <div className="space-y-1.5">
                          <Bar label="cost" value={r.costUsd} max={maxCost} color="#8B6F47" display={usd(r.costUsd)} />
                          <Bar label="latency" value={r.latencyMs} max={maxLatency} color="#0EA5E9" display={`${(r.latencyMs / 1000).toFixed(1)}s`} />
                        </div>
                        <div className="mt-2 text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span><span className="text-slate-400">orders</span> <span className="font-mono tabular-nums text-slate-800">{r.decisionCount}</span></span>
                          {opus && opus.ok && r.model !== opus.model && r.costUsd > 0 && (
                            <span className="text-emerald-700 font-medium">{(opus.costUsd / Math.max(r.costUsd, 1e-9)).toFixed(0)}× cheaper than Opus</span>
                          )}
                        </div>
                      </>
                    ) : <p className="text-[11px] text-rose-700">{r.error}</p>}
                  </div>
                );
              })}
            </div>

            {/* Decision agreement matrix — the impactful part */}
            {comparison && <AgreementMatrix comparison={comparison} cheapestLabel={cheapest?.label} opusCost={opus?.costUsd} cheapestCost={cheapest?.costUsd} />}
          </div>
        )}
      </div>
    </div>
  );
}

function AgreementMatrix({ comparison, cheapestLabel, opusCost, cheapestCost }: {
  comparison: BakeoffComparison;
  cheapestLabel?: string;
  opusCost?: number;
  cheapestCost?: number;
}) {
  // Classify each row: identical (all ordered, same qty & vendor) vs diverged.
  const classified = comparison.rows.map((row) => {
    const filled = row.cells.filter((c): c is { qty: number; vendor: string } => c !== null);
    const allOrdered = filled.length === comparison.models.length;
    const sameQty = filled.length > 0 && filled.every((c) => c.qty === filled[0].qty);
    const sameVendor = filled.length > 0 && filled.every((c) => c.vendor === filled[0].vendor);
    const identical = allOrdered && sameQty && sameVendor;
    return { ...row, identical, allOrdered, sameQty, sameVendor };
  });
  const identicalCount = classified.filter((r) => r.identical).length;
  const divergedCount = classified.length - identicalCount;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <h3 className="font-medium text-slate-800 text-[13px]">What each model actually decided</h3>
        <span className="text-[11px]">
          <span className="text-emerald-700 font-medium">{identicalCount} identical</span>
          <span className="text-slate-400"> · </span>
          <span className={divergedCount > 0 ? "text-amber-700 font-medium" : "text-slate-400"}>{divergedCount} diverged</span>
          <span className="text-slate-400"> of {classified.length} items</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-slate-500 text-[11px]">
              <th className="text-left font-medium py-1 pr-3">Ingredient</th>
              {comparison.models.map((m) => (
                <th key={m.model} className="text-right font-medium py-1 px-3 whitespace-nowrap">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classified.map((row) => (
              <tr key={row.ingredient} className={`border-t border-slate-100 ${row.identical ? "" : "bg-amber-50/50"}`}>
                <td className="py-1.5 pr-3 font-mono text-slate-700">{row.ingredient}</td>
                {row.cells.map((c, i) => (
                  <td key={i} className="py-1.5 px-3 text-right tabular-nums">
                    {c === null ? (
                      <span className="text-rose-400 italic">skip</span>
                    ) : (
                      <span>
                        <span className={`font-medium ${row.identical ? "text-slate-800" : "text-amber-800"}`}>{c.qty.toLocaleString()}</span>
                        <span className="block text-[10px] text-slate-400">{c.vendor}</span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-coffee-800 bg-cream-100 border border-cream-300 rounded px-3 py-2 mt-3">
        {divergedCount === 0 ? (
          <>All three tiers made <strong>identical</strong> reorders.{" "}
            {cheapestLabel && opusCost && cheapestCost && opusCost > cheapestCost && (
              <><strong>{cheapestLabel}</strong> got there for <strong>{(opusCost / Math.max(cheapestCost, 1e-9)).toFixed(0)}× less</strong> — for routine ops the cheap model is enough.</>
            )}
          </>
        ) : (
          <>Tiers <strong>diverged on {divergedCount} of {classified.length}</strong> items (highlighted) — different quantities, vendors, or skipped orders. This is where paying for the frontier model can earn its keep.</>
        )}
      </p>
    </div>
  );
}

function Bar({ label, value, max, color, display }: { label: string; value: number; max: number; color: string; display: string }) {
  const pct = Math.max(2, (value / max) * 100);
  return (
    <div className="grid grid-cols-[52px_1fr_56px] items-center gap-2 text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className="h-3 bg-slate-100 rounded overflow-hidden">
        <span className="block h-full rounded" style={{ width: `${pct}%`, backgroundColor: color }} />
      </span>
      <span className="text-right font-mono tabular-nums text-slate-700">{display}</span>
    </div>
  );
}
