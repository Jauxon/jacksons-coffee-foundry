"use client";

import { useState, useTransition } from "react";
import { dryRunAgent } from "../app/actions.ts";

export interface ShopOption { id: number; name: string; colorHex: string; }

export function AgentTestRun({
  agentSlug,
  shops,
}: {
  agentSlug: "reorder-heuristic" | "reorder-llm" | "pricing";
  shops: ShopOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [shopId, setShopId] = useState<number>(shops[0]?.id ?? 0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof dryRunAgent>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await dryRunAgent(shopId, agentSlug);
        setResult(r);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-md">
      <div className="px-4 py-3 border-b border-slate-200 flex items-baseline justify-between">
        <div>
          <div className="font-medium text-slate-800 text-[14px]">Test run</div>
          <div className="text-[11px] text-slate-500">Fires the function against a team's current state. Proposals are previewed, not persisted.</div>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-[13px]">
          <label className="text-slate-600">Team</label>
          <select
            className="border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 text-[13px]"
            value={shopId}
            onChange={(e) => setShopId(Number(e.target.value))}
            disabled={pending}
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={pending}
            className="ml-auto px-3 py-1 rounded bg-coffee-600 text-white text-[12px] hover:bg-coffee-800 disabled:opacity-50"
          >
            {pending ? "Running…" : "Run"}
          </button>
        </div>

        {error && <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">{error}</div>}

        {result && (
          <div className="border border-slate-200 rounded">
            <div className="px-3 py-2 border-b border-slate-200 flex items-baseline justify-between bg-slate-50">
              <div className="text-[12px] text-slate-700">
                {result.proposals.length === 0
                  ? <span>No proposals — function ran cleanly with no decisions.</span>
                  : <span>{result.proposals.length} proposal{result.proposals.length === 1 ? "" : "s"} (preview only)</span>}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">{result.durationMs}ms</div>
            </div>
            {result.proposals.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {result.proposals.map((p, i) => (
                  <li key={i} className="px-3 py-2 text-[12px]">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="pill pill-slate uppercase">{p.kind.replace("_", " ")}</span>
                      <span className="font-mono text-slate-600 text-[11px]">{summarizePayload(p.kind, p.payload)}</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{p.rationale}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function summarizePayload(kind: string, payload: any): string {
  if (kind === "purchase_order") {
    return `qty ${payload.qty?.toLocaleString?.() ?? "?"} · $${(payload.totalCents / 100).toFixed(2)} · arrives D${payload.expectedDay}`;
  }
  if (kind === "price_update") {
    return `${payload.productName}: $${(payload.oldPriceCents / 100).toFixed(2)} → $${(payload.newPriceCents / 100).toFixed(2)}`;
  }
  return JSON.stringify(payload);
}
