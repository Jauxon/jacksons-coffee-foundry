import Link from "next/link";
import { getLLMMetrics } from "../../lib/llm-metrics.ts";
import { getLLMUsage } from "../../sim/llm-agent.ts";
import { getAllShops } from "../../lib/data.ts";
import { Bakeoff } from "../../components/Bakeoff.tsx";

export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(4)}`;
const usd2 = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const k = (n: number) => n.toLocaleString();

function modelColor(model: string): string {
  if (model.includes("opus")) return "#8B6F47";
  if (model.includes("sonnet")) return "#2563EB";
  if (model.includes("haiku")) return "#059669";
  return "#94A3B8";
}
function modelShort(model: string): string {
  return model.replace(/^claude-/, "").replace(/-/g, " ");
}

export default function InferencePanel() {
  const m = getLLMMetrics(25);
  const budget = getLLMUsage();
  const shops = getAllShops().map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="px-6 py-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-2xl text-coffee-900">Inference</h1>
          <p className="text-[13px] text-slate-600 mt-1">
            Every agent decision is one Claude call. This is the cost, latency, and caching ledger
            behind those calls — the inference layer made legible.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="px-2 py-1 rounded border border-slate-200 bg-slate-50 font-mono">{m.model}</span>
          <span className="px-2 py-1 rounded border border-slate-200 bg-slate-50">
            budget {budget.used}/{budget.budget} this instance
          </span>
        </div>
      </div>

      {/* Bake-off is always available (it doesn't need prior history). */}
      <Bakeoff shops={shops} />

      {!m.hasData ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-md px-4 py-12 text-center text-slate-500">
          <div className="text-base mb-1">No inference calls recorded yet.</div>
          <div className="text-[13px]">
            Run the bake-off above, or open a team and click <strong>Run agent (LLM)</strong>. Each Claude
            call's cost, latency, and cache behavior lands here. <Link href="/" className="text-coffee-700 underline">Dashboard →</Link>
          </div>
        </div>
      ) : (
        <>
          {/* Hero: cache-savings donut + cost headline + stat cards */}
          <div className="grid lg:grid-cols-3 gap-4 items-stretch">
            <div className="bg-white border border-slate-200 rounded-md p-4 flex items-center gap-4">
              <Donut
                actual={m.totalCostUsd}
                saved={Math.max(0, m.cacheSavingsUsd)}
                centerTop={pct(m.cacheSavingsPct)}
                centerBot="saved"
              />
              <div className="text-[12px] leading-relaxed">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Prompt caching</div>
                <div className="text-slate-800 mt-1">
                  Spent <strong className="font-mono">{usd(m.totalCostUsd)}</strong>
                </div>
                <div className="text-slate-500">
                  vs <span className="font-mono">{usd(m.totalCostNoCacheUsd)}</span> uncached
                </div>
                <div className="text-emerald-700 font-medium mt-1">
                  saved {usd(m.cacheSavingsUsd)}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Calls" value={k(m.totalCalls)} hint={`${pct(m.errorRate)} errors`} />
              <Stat label="Cache hit" value={pct(m.cacheHitRate)} hint={`${k(m.totalCacheReadTokens)} tok cached`} />
              <Stat label="Latency" value={`${(m.avgLatencyMs / 1000).toFixed(1)}s`} hint={`p95 ${(m.p95LatencyMs / 1000).toFixed(1)}s`} />
              <Stat label="Cost / proposal" value={m.costPerProposalUsd == null ? "—" : usd(m.costPerProposalUsd)} hint={`${m.totalProposals} proposals`} />
            </div>
          </div>

          {/* By-model comparison (includes bake-off history) */}
          {m.byModel.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <h3 className="font-medium text-slate-800 text-[14px] mb-1">Spend by model</h3>
              <p className="text-[11px] text-slate-500 mb-3">Total cost per model across all recorded calls (real runs + bake-offs).</p>
              <ModelBars rows={m.byModel.map((b) => ({
                label: modelShort(b.model),
                color: modelColor(b.model),
                cost: b.costUsd,
                meta: `${b.calls} call${b.calls === 1 ? "" : "s"} · ${(b.avgLatencyMs / 1000).toFixed(1)}s avg · ${k(b.totalTokens)} tok`,
              }))} />
            </div>
          )}

          {/* Token mix + explainer */}
          <div className="grid md:grid-cols-3 gap-4 items-start">
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-md p-4">
              <h3 className="font-medium text-slate-800 text-[14px] mb-1">Prompt token mix</h3>
              <p className="text-[11px] text-slate-500 mb-3">
                Where every billed token went. Cache reads bill at 10% of the input rate — the wider that band, the cheaper the run.
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
                <li><strong>Opus 4.7</strong> — reasoning-grade model for cross-ingredient tradeoffs.</li>
                <li><strong>Prompt caching</strong> — system prompt cached ephemeral; only the per-tick snapshot is fresh.</li>
                <li><strong>Adaptive thinking</strong> — extended reasoning before the tool call.</li>
                <li><strong>Per-instance budget</strong> — {budget.budget} calls/instance caps demo spend.</li>
              </ul>
            </div>
          </div>

          {/* Pricing transparency */}
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h3 className="font-medium text-slate-800 text-[14px] mb-2">Pricing model</h3>
            <p className="text-[11px] text-slate-500 mb-3">
              USD per million tokens for <span className="font-mono">{m.model}</span>. All dollar figures are derived from these against stored raw token counts.
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
                  <th>Model</th>
                  <th>Sim</th>
                  <th className="text-right">Prompt tok</th>
                  <th className="text-right">Cache hit</th>
                  <th className="text-right">Output tok</th>
                  <th className="text-right">Latency</th>
                  <th className="text-right">Cost</th>
                  <th className="text-right">Props</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {m.recent.map((c) => (
                  <tr key={c.id}>
                    <td className="text-slate-500 text-[11px]">{new Date(c.createdAt).toLocaleTimeString()}</td>
                    <td className="text-[11px]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: modelColor(c.model) }} />
                        {modelShort(c.model)}
                      </span>
                    </td>
                    <td className="font-mono text-slate-600 text-[11px]">D{c.day} {c.segment}</td>
                    <td className="text-right tabular-nums">{k(c.promptTokens)}</td>
                    <td className="text-right tabular-nums text-emerald-700">{pct(c.cacheReadShare)}</td>
                    <td className="text-right tabular-nums">{k(c.outputTokens)}</td>
                    <td className="text-right tabular-nums">{(c.latencyMs / 1000).toFixed(1)}s</td>
                    <td className="text-right tabular-nums font-medium">{usd(c.costUsd)}</td>
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
        return <div key={s.label} style={{ width: `${w}%`, backgroundColor: s.color }} title={`${s.label}: ${s.value.toLocaleString()} (${w.toFixed(0)}%)`} />;
      })}
    </div>
  );
}

function ModelBars({ rows }: { rows: { label: string; color: string; cost: number; meta: string }[] }) {
  const max = Math.max(...rows.map((r) => r.cost), 1e-9);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[110px_1fr_90px] items-center gap-3 text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
            {r.label}
          </span>
          <span className="h-4 bg-slate-100 rounded overflow-hidden" title={r.meta}>
            <span className="block h-full rounded" style={{ width: `${Math.max(2, (r.cost / max) * 100)}%`, backgroundColor: r.color }} />
          </span>
          <span className="text-right font-mono tabular-nums text-slate-800">${r.cost.toFixed(4)}</span>
        </div>
      ))}
      <div className="text-[10px] text-slate-400 pl-[122px]">hover a bar for calls · avg latency · tokens</div>
    </div>
  );
}

function Donut({ actual, saved, centerTop, centerBot }: { actual: number; saved: number; centerTop: string; centerBot: string }) {
  const total = actual + saved;
  const size = 110;
  const r = size / 2;
  const inner = r * 0.62;
  const segs = total === 0
    ? [{ value: 1, color: "#E2E8F0" }]
    : [{ value: actual, color: "#8B6F47" }, { value: saved, color: "#059669" }];
  const sum = segs.reduce((a, s) => a + s.value, 0) || 1;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`-${r} -${r} ${size} ${size}`} className="shrink-0">
      {segs.map((s, i) => {
        const a0 = (acc / sum) * Math.PI * 2 - Math.PI / 2;
        acc += s.value;
        const a1 = (acc / sum) * Math.PI * 2 - Math.PI / 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r;
        const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
        const ix1 = Math.cos(a1) * inner, iy1 = Math.sin(a1) * inner;
        const ix0 = Math.cos(a0) * inner, iy0 = Math.sin(a0) * inner;
        const d = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0} Z`;
        return <path key={i} d={d} fill={s.color} />;
      })}
      <text textAnchor="middle" dy="-2" fontSize="17" fontWeight="600" fill="#0F172A">{centerTop}</text>
      <text textAnchor="middle" dy="14" fontSize="9" fill="#64748B">{centerBot}</text>
    </svg>
  );
}
