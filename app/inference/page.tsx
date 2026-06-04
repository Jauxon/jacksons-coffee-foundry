import Link from "next/link";
import { getLLMMetrics } from "../../lib/llm-metrics.ts";
import { getLLMUsage } from "../../sim/llm-agent.ts";

export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(4)}`;
const usd2 = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const k = (n: number) => n.toLocaleString();

export default function InferencePanel() {
  const m = getLLMMetrics(25);
  const budget = getLLMUsage();

  return (
    <div className="px-6 py-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-2xl text-coffee-900">Inference</h1>
          <p className="text-[13px] text-slate-600 mt-1">
            Every decision the operator agent makes is one Claude call. This panel is the cost,
            latency, and caching ledger behind those calls — the inference layer made legible.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="px-2 py-1 rounded border border-slate-200 bg-slate-50 font-mono">{m.model}</span>
          <span className="px-2 py-1 rounded border border-slate-200 bg-slate-50">
            budget {budget.used}/{budget.budget} this instance
          </span>
        </div>
      </div>

      {!m.hasData ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-md px-4 py-12 text-center text-slate-500">
          <div className="text-base mb-1">No inference calls recorded yet.</div>
          <div className="text-[13px]">
            Open a team and click <strong>Run agent (LLM)</strong> to fire a Claude call — its cost,
            latency, and cache behavior land here. <Link href="/" className="text-coffee-700 underline">Go to the dashboard →</Link>
          </div>
        </div>
      ) : (
        <>
          {/* Hero stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat
              label="Total spend"
              value={usd(m.totalCostUsd)}
              hint={`${m.totalCalls} calls · ${usd(m.avgCostPerCallUsd)}/call`}
            />
            <Stat
              label="Saved by caching"
              value={usd(m.cacheSavingsUsd)}
              hint={`${pct(m.cacheSavingsPct)} vs no-cache (${usd(m.totalCostNoCacheUsd)})`}
              valueClass={m.cacheSavingsUsd >= 0 ? "text-emerald-700" : "text-rose-700"}
            />
            <Stat
              label="Cache hit rate"
              value={pct(m.cacheHitRate)}
              hint={`${k(m.totalCacheReadTokens)} of ${k(m.totalPromptTokens)} prompt tokens`}
            />
            <Stat
              label="Latency"
              value={`${(m.avgLatencyMs / 1000).toFixed(1)}s`}
              hint={`p50 ${(m.p50LatencyMs / 1000).toFixed(1)}s · p95 ${(m.p95LatencyMs / 1000).toFixed(1)}s`}
            />
            <Stat
              label="Cost / proposal"
              value={m.costPerProposalUsd == null ? "—" : usd(m.costPerProposalUsd)}
              hint={`${m.totalProposals} proposals · ${pct(m.errorRate)} errors`}
            />
          </div>

          {/* Token mix + explainer */}
          <div className="grid md:grid-cols-3 gap-4 items-start">
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-md p-4">
              <h3 className="font-medium text-slate-800 text-[14px] mb-1">Prompt token mix</h3>
              <p className="text-[11px] text-slate-500 mb-3">
                Where every billed token went. Cache reads are billed at 10% of the input rate —
                the wider that band, the cheaper the run.
              </p>
              <TokenBar
                segments={[
                  { label: "cache read", value: m.totalCacheReadTokens, color: "#059669" },
                  { label: "cache write", value: m.totalCacheCreationTokens, color: "#D97706" },
                  { label: "fresh input", value: m.totalInputTokens, color: "#2563EB" },
                  { label: "output", value: m.totalOutputTokens, color: "#7C3AED" },
                ]}
              />
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                <TokenStat label="Cache read" value={k(m.totalCacheReadTokens)} color="#059669" />
                <TokenStat label="Cache write" value={k(m.totalCacheCreationTokens)} color="#D97706" />
                <TokenStat label="Fresh input" value={k(m.totalInputTokens)} color="#2563EB" />
                <TokenStat label="Output" value={k(m.totalOutputTokens)} color="#7C3AED" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-4">
              <h3 className="font-medium text-slate-800 text-[14px] mb-2">Inference-layer choices</h3>
              <ul className="text-[12px] text-slate-700 space-y-2 leading-relaxed">
                <li><strong>Opus 4.7</strong> — reasoning-grade model for cross-ingredient tradeoffs (vendor reliability vs. cost vs. perishability vs. cash).</li>
                <li><strong>Prompt caching</strong> — the system prompt (persona, recipes, ontology) is cached ephemeral; only the per-tick world snapshot is fresh.</li>
                <li><strong>Adaptive thinking</strong> — extended reasoning before the tool call, without forcing tool choice.</li>
                <li><strong>Per-instance budget</strong> — {budget.budget} calls per warm instance caps spend during a public demo.</li>
              </ul>
            </div>
          </div>

          {/* Pricing transparency */}
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h3 className="font-medium text-slate-800 text-[14px] mb-2">Pricing model</h3>
            <p className="text-[11px] text-slate-500 mb-3">
              USD per million tokens for <span className="font-mono">{m.model}</span>. All dollar figures
              above are derived from these rates against stored raw token counts.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
              <TokenStat label="Input" value={usd2(m.pricing.input)} />
              <TokenStat label="Output" value={usd2(m.pricing.output)} />
              <TokenStat label="Cache write" value={usd2(m.pricing.cacheWrite)} />
              <TokenStat label="Cache read" value={usd2(m.pricing.cacheRead)} />
            </div>
          </div>

          {/* Recent calls */}
          <section className="bg-white border border-slate-200 rounded-md">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-medium">Recent calls</h2>
              <span className="text-[11px] text-slate-500">last {m.recent.length}</span>
            </div>
            <table className="foundry-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Sim</th>
                  <th>Strategy</th>
                  <th className="text-right">Prompt tok</th>
                  <th className="text-right">Cache hit</th>
                  <th className="text-right">Output tok</th>
                  <th className="text-right">Latency</th>
                  <th className="text-right">Cost</th>
                  <th className="text-right">vs no-cache</th>
                  <th className="text-right">Props</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {m.recent.map((c) => (
                  <tr key={c.id}>
                    <td className="text-slate-500 text-[11px]">{new Date(c.createdAt).toLocaleTimeString()}</td>
                    <td className="font-mono text-slate-600 text-[11px]">D{c.day} {c.segment}</td>
                    <td className="text-slate-600 text-[11px]">{(c.strategy ?? "—").replace(/_/g, " ")}</td>
                    <td className="text-right tabular-nums">{k(c.promptTokens)}</td>
                    <td className="text-right tabular-nums text-emerald-700">{pct(c.cacheReadShare)}</td>
                    <td className="text-right tabular-nums">{k(c.outputTokens)}</td>
                    <td className="text-right tabular-nums">{(c.latencyMs / 1000).toFixed(1)}s</td>
                    <td className="text-right tabular-nums font-medium">{usd(c.costUsd)}</td>
                    <td className="text-right tabular-nums text-slate-500">{usd(c.costNoCacheUsd)}</td>
                    <td className="text-right tabular-nums text-slate-600">{c.proposals}</td>
                    <td>
                      {c.ok
                        ? <span className="pill pill-green">ok</span>
                        : <span className="pill pill-red" title={c.errorText ?? ""}>error</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, valueClass = "text-slate-900" }: { label: string; value: string; hint?: string; valueClass?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function TokenStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      {color && <span className="h-2.5 w-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />}
      <span className="text-slate-500">{label}</span>
      <span className="ml-auto font-mono tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

function TokenBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <div className="text-[12px] text-slate-400 italic">No tokens yet.</div>;
  return (
    <div className="h-6 w-full rounded overflow-hidden flex bg-slate-100">
      {segments.map((s) => {
        const w = (s.value / total) * 100;
        if (w === 0) return null;
        return (
          <div
            key={s.label}
            style={{ width: `${w}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.value.toLocaleString()} (${w.toFixed(0)}%)`}
          />
        );
      })}
    </div>
  );
}
