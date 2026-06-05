"use client";

import { useState, useTransition } from "react";
import { runBakeoff, type BakeoffResult } from "../app/actions.ts";

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(4)}`);

export function Bakeoff({ shops }: { shops: { id: number; name: string }[] }) {
  const [shopId, setShopId] = useState<number>(shops[0]?.id ?? 0);
  const [results, setResults] = useState<BakeoffResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const r = await runBakeoff(shopId);
      if (r.ok) setResults(r.results);
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
            Same reorder scenario through three Claude tiers. Standardized request — cost & latency are apples-to-apples.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <select
            value={shopId}
            onChange={(e) => setShopId(Number(e.target.value))}
            className="border border-slate-300 rounded px-2 py-1 bg-white"
            disabled={pending}
          >
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            onClick={run}
            disabled={pending}
            className="px-3 py-1 rounded border bg-coffee-600 text-white border-coffee-600 hover:bg-coffee-800 disabled:opacity-50"
          >
            {pending ? "Running 3 calls…" : "Run bake-off"}
          </button>
        </div>
      </div>

      <div className="p-4">
        {error && (
          <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">{error}</div>
        )}

        {!results && !error && (
          <p className="text-[12px] text-slate-500 italic">
            Pick a team and run it — fires the identical prompt at Opus 4.7, Sonnet 4.6, and Haiku 4.5, then compares what each tier charges for the same decision. (3 Claude calls, counts against the instance budget.)
          </p>
        )}

        {results && (
          <div className="space-y-3">
            {results.map((r) => {
              const isCheapest = cheapest && r.ok && r.model === cheapest.model;
              return (
                <div key={r.model} className={`rounded-md border px-4 py-3 ${isCheapest ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200"}`}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="font-medium text-slate-900 text-[13px]">{r.label}</span>
                    <span className="text-[11px] text-slate-500">{r.tier}</span>
                    {isCheapest && <span className="pill pill-green text-[10px] uppercase tracking-wider">cheapest</span>}
                    {!r.ok && <span className="pill pill-red text-[10px]" title={r.error}>error</span>}
                    <span className="ml-auto font-mono tabular-nums font-semibold text-[15px] text-slate-900">
                      {r.ok ? usd(r.costUsd) : "—"}
                    </span>
                  </div>

                  {r.ok ? (
                    <>
                      <div className="space-y-1.5">
                        <Bar label="cost" value={r.costUsd} max={maxCost} color="#8B6F47" display={usd(r.costUsd)} />
                        <Bar label="latency" value={r.latencyMs} max={maxLatency} color="#0EA5E9" display={`${(r.latencyMs / 1000).toFixed(1)}s`} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-600">
                        <span><span className="text-slate-400">decisions</span> <span className="font-mono tabular-nums text-slate-800">{r.decisions}</span></span>
                        <span><span className="text-slate-400">prompt tok</span> <span className="font-mono tabular-nums text-slate-800">{r.promptTokens.toLocaleString()}</span></span>
                        <span><span className="text-slate-400">output tok</span> <span className="font-mono tabular-nums text-slate-800">{r.outputTokens.toLocaleString()}</span></span>
                        {opus && opus.ok && r.model !== opus.model && opus.costUsd > 0 && (
                          <span className="text-emerald-700 font-medium">
                            {(opus.costUsd / Math.max(r.costUsd, 1e-9)).toFixed(0)}× cheaper than Opus
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-rose-700">{r.error}</p>
                  )}
                </div>
              );
            })}

            {cheapest && opus && opus.ok && cheapest.model !== opus.model && cheapest.decisions === opus.decisions && (
              <p className="text-[12px] text-coffee-800 bg-cream-100 border border-cream-300 rounded px-3 py-2">
                <strong>{cheapest.label}</strong> reached the same <strong>{cheapest.decisions}</strong> decisions as Opus for{" "}
                <strong>{(opus.costUsd / Math.max(cheapest.costUsd, 1e-9)).toFixed(0)}× less</strong> — the cost/quality
                frontier in one click.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Bar({ label, value, max, color, display }: { label: string; value: number; max: number; color: string; display: string }) {
  const pct = Math.max(2, (value / max) * 100);
  return (
    <div className="grid grid-cols-[64px_1fr_64px] items-center gap-2 text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className="h-3 bg-slate-100 rounded overflow-hidden">
        <span className="block h-full rounded" style={{ width: `${pct}%`, backgroundColor: color }} />
      </span>
      <span className="text-right font-mono tabular-nums text-slate-700">{display}</span>
    </div>
  );
}
