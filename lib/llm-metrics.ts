// Inference telemetry aggregation for the /inference panel.
//
// The llm_call table stores only raw token counts + latency. Every dollar
// figure is derived here from a pricing table, so a price change never needs a
// backfill — and we can compute the "what would this have cost WITHOUT prompt
// caching" counterfactual that makes the caching win legible.

import { db, schema as s } from "../db/client.ts";
import { desc } from "drizzle-orm";
import { MODEL } from "../sim/llm-agent.ts";

// USD per million tokens. Source: Anthropic API pricing.
// cache write = 1.25x base input (5-min), cache read = 0.1x base input.
export const PRICING_PER_MTOK: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-4-8":   { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-7":   { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-6":   { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5":  { input: 1, output: 5,  cacheWrite: 1.25, cacheRead: 0.1 },
};
const DEFAULT_PRICING = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };

export function pricingFor(model: string) {
  return PRICING_PER_MTOK[model] ?? DEFAULT_PRICING;
}

interface TokenUsage {
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

// Actual billed cost of one call (USD).
export function computeCostUsd(model: string, u: TokenUsage): number {
  const p = pricingFor(model);
  return (
    u.inputTokens * p.input +
    u.cacheCreationTokens * p.cacheWrite +
    u.cacheReadTokens * p.cacheRead +
    u.outputTokens * p.output
  ) / 1_000_000;
}

// Counterfactual: same tokens, NO caching — every prompt token at full input
// rate, no read discount, no write premium.
export function computeCostNoCacheUsd(model: string, u: TokenUsage): number {
  const p = pricingFor(model);
  const promptTokens = u.inputTokens + u.cacheCreationTokens + u.cacheReadTokens;
  return (promptTokens * p.input + u.outputTokens * p.output) / 1_000_000;
}

interface CallRow {
  id: number;
  shopId: number | null;
  agentName: string;
  model: string;
  strategy: string | null;
  day: number;
  segment: string;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  latencyMs: number;
  proposals: number;
  ok: boolean;
  errorText: string | null;
  createdAt: Date;
}

export interface RecentCall {
  id: number;
  shopId: number | null;
  model: string;
  strategy: string | null;
  day: number;
  segment: string;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  promptTokens: number;
  latencyMs: number;
  proposals: number;
  ok: boolean;
  errorText: string | null;
  costUsd: number;
  costNoCacheUsd: number;
  cacheReadShare: number;
  createdAt: string;
}

export interface ModelAgg {
  model: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
  avgLatencyMs: number;
  proposals: number;
}

export interface LLMMetrics {
  model: string;
  pricing: { input: number; output: number; cacheWrite: number; cacheRead: number };
  hasData: boolean;

  totalCalls: number;
  okCalls: number;
  errorCalls: number;
  errorRate: number;
  totalProposals: number;

  totalInputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalOutputTokens: number;
  totalPromptTokens: number;
  cacheHitRate: number;

  totalCostUsd: number;
  totalCostNoCacheUsd: number;
  cacheSavingsUsd: number;
  cacheSavingsPct: number;
  avgCostPerCallUsd: number;
  costPerProposalUsd: number | null;

  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;

  byModel: ModelAgg[];
  recent: RecentCall[];
}

function usageOf(r: CallRow): TokenUsage {
  return {
    inputTokens: r.inputTokens,
    cacheCreationTokens: r.cacheCreationTokens,
    cacheReadTokens: r.cacheReadTokens,
    outputTokens: r.outputTokens,
  };
}

export function getLLMMetrics(recentLimit = 25): LLMMetrics {
  const rows = db.select().from(s.llmCall).orderBy(desc(s.llmCall.createdAt)).all() as CallRow[];
  const pricing = pricingFor(MODEL);

  const empty: LLMMetrics = {
    model: MODEL, pricing, hasData: false,
    totalCalls: 0, okCalls: 0, errorCalls: 0, errorRate: 0, totalProposals: 0,
    totalInputTokens: 0, totalCacheReadTokens: 0, totalCacheCreationTokens: 0, totalOutputTokens: 0,
    totalPromptTokens: 0, cacheHitRate: 0,
    totalCostUsd: 0, totalCostNoCacheUsd: 0, cacheSavingsUsd: 0, cacheSavingsPct: 0,
    avgCostPerCallUsd: 0, costPerProposalUsd: null,
    avgLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0,
    byModel: [], recent: [],
  };
  if (rows.length === 0) return empty;

  const ok = rows.filter((r) => r.ok);
  const errorCalls = rows.length - ok.length;

  const totalInputTokens = sum(rows, (r) => r.inputTokens);
  const totalCacheReadTokens = sum(rows, (r) => r.cacheReadTokens);
  const totalCacheCreationTokens = sum(rows, (r) => r.cacheCreationTokens);
  const totalOutputTokens = sum(rows, (r) => r.outputTokens);
  const totalPromptTokens = totalInputTokens + totalCacheReadTokens + totalCacheCreationTokens;

  const totalCostUsd = sum(rows, (r) => computeCostUsd(r.model, usageOf(r)));
  const totalCostNoCacheUsd = sum(rows, (r) => computeCostNoCacheUsd(r.model, usageOf(r)));
  const cacheSavingsUsd = totalCostNoCacheUsd - totalCostUsd;
  const totalProposals = sum(rows, (r) => r.proposals);
  const latencies = ok.map((r) => r.latencyMs).sort((a, b) => a - b);

  // Per-model aggregation (drives the "by model" comparison + bake-off history).
  const modelMap = new Map<string, CallRow[]>();
  for (const r of rows) {
    const arr = modelMap.get(r.model) ?? [];
    arr.push(r);
    modelMap.set(r.model, arr);
  }
  const byModel: ModelAgg[] = Array.from(modelMap.entries())
    .map(([model, rs]) => ({
      model,
      calls: rs.length,
      costUsd: sum(rs, (r) => computeCostUsd(r.model, usageOf(r))),
      totalTokens: sum(rs, (r) => r.inputTokens + r.cacheReadTokens + r.cacheCreationTokens + r.outputTokens),
      avgLatencyMs: Math.round(sum(rs.filter((r) => r.ok), (r) => r.latencyMs) / Math.max(1, rs.filter((r) => r.ok).length)),
      proposals: sum(rs, (r) => r.proposals),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    model: MODEL,
    pricing,
    hasData: true,
    totalCalls: rows.length,
    okCalls: ok.length,
    errorCalls,
    errorRate: errorCalls / rows.length,
    totalProposals,
    totalInputTokens,
    totalCacheReadTokens,
    totalCacheCreationTokens,
    totalOutputTokens,
    totalPromptTokens,
    cacheHitRate: totalPromptTokens === 0 ? 0 : totalCacheReadTokens / totalPromptTokens,
    totalCostUsd,
    totalCostNoCacheUsd,
    cacheSavingsUsd,
    cacheSavingsPct: totalCostNoCacheUsd === 0 ? 0 : cacheSavingsUsd / totalCostNoCacheUsd,
    avgCostPerCallUsd: totalCostUsd / rows.length,
    costPerProposalUsd: totalProposals === 0 ? null : totalCostUsd / totalProposals,
    avgLatencyMs: latencies.length === 0 ? 0 : Math.round(sum(latencies, (x) => x) / latencies.length),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    byModel,
    recent: rows.slice(0, recentLimit).map((r) => {
      const promptTokens = r.inputTokens + r.cacheReadTokens + r.cacheCreationTokens;
      return {
        id: r.id,
        shopId: r.shopId,
        model: r.model,
        strategy: r.strategy,
        day: r.day,
        segment: r.segment,
        inputTokens: r.inputTokens,
        cacheCreationTokens: r.cacheCreationTokens,
        cacheReadTokens: r.cacheReadTokens,
        outputTokens: r.outputTokens,
        promptTokens,
        latencyMs: r.latencyMs,
        proposals: r.proposals,
        ok: r.ok,
        errorText: r.errorText,
        costUsd: computeCostUsd(r.model, usageOf(r)),
        costNoCacheUsd: computeCostNoCacheUsd(r.model, usageOf(r)),
        cacheReadShare: promptTokens === 0 ? 0 : r.cacheReadTokens / promptTokens,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      };
    }),
  };
}

function sum<T>(arr: T[], f: (x: T) => number): number {
  let s = 0;
  for (const x of arr) s += f(x);
  return s;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}
