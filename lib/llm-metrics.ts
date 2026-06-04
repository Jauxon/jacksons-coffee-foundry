// Inference telemetry aggregation for the /inference panel.
//
// The llm_call table stores only raw token counts + latency. Every dollar
// figure is derived here from a pricing table, so a price change never needs a
// backfill — and we can compute the "what would this have cost WITHOUT prompt
// caching" counterfactual that makes the caching win legible.

import { db, schema as s } from "../db/client.ts";
import { desc } from "drizzle-orm";
import { MODEL } from "../sim/llm-agent.ts";

// USD per million tokens. Opus-tier rates; cache write is 1.25x input, cache
// read is 0.1x input (Anthropic ephemeral-cache pricing model).
export const PRICING_PER_MTOK: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-4-7": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
};
const DEFAULT_PRICING = { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 };

function pricingFor(model: string) {
  return PRICING_PER_MTOK[model] ?? DEFAULT_PRICING;
}

// Actual billed cost of one call (USD).
function callCostUsd(c: CallRow): number {
  const p = pricingFor(c.model);
  return (
    c.inputTokens * p.input +
    c.cacheCreationTokens * p.cacheWrite +
    c.cacheReadTokens * p.cacheRead +
    c.outputTokens * p.output
  ) / 1_000_000;
}

// Counterfactual: same tokens, but with NO caching — every prompt token billed
// at the full input rate, no read discount, no write premium.
function callCostNoCacheUsd(c: CallRow): number {
  const p = pricingFor(c.model);
  const promptTokens = c.inputTokens + c.cacheCreationTokens + c.cacheReadTokens;
  return (promptTokens * p.input + c.outputTokens * p.output) / 1_000_000;
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
  cacheReadShare: number; // 0..1 of prompt tokens served from cache
  createdAt: string; // ISO
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

  // Tokens
  totalInputTokens: number;       // uncached prompt
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalOutputTokens: number;
  totalPromptTokens: number;      // input + cacheRead + cacheCreation
  cacheHitRate: number;           // cacheRead / promptTokens

  // Cost
  totalCostUsd: number;
  totalCostNoCacheUsd: number;
  cacheSavingsUsd: number;
  cacheSavingsPct: number;
  avgCostPerCallUsd: number;
  costPerProposalUsd: number | null;

  // Latency (ms)
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;

  recent: RecentCall[];
}

export function getLLMMetrics(recentLimit = 25): LLMMetrics {
  const rows = db.select().from(s.llmCall).orderBy(desc(s.llmCall.createdAt)).all() as CallRow[];
  const pricing = pricingFor(MODEL);

  if (rows.length === 0) {
    return {
      model: MODEL, pricing, hasData: false,
      totalCalls: 0, okCalls: 0, errorCalls: 0, errorRate: 0, totalProposals: 0,
      totalInputTokens: 0, totalCacheReadTokens: 0, totalCacheCreationTokens: 0, totalOutputTokens: 0,
      totalPromptTokens: 0, cacheHitRate: 0,
      totalCostUsd: 0, totalCostNoCacheUsd: 0, cacheSavingsUsd: 0, cacheSavingsPct: 0,
      avgCostPerCallUsd: 0, costPerProposalUsd: null,
      avgLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0,
      recent: [],
    };
  }

  const ok = rows.filter((r) => r.ok);
  const errorCalls = rows.length - ok.length;

  const totalInputTokens = sum(rows, (r) => r.inputTokens);
  const totalCacheReadTokens = sum(rows, (r) => r.cacheReadTokens);
  const totalCacheCreationTokens = sum(rows, (r) => r.cacheCreationTokens);
  const totalOutputTokens = sum(rows, (r) => r.outputTokens);
  const totalPromptTokens = totalInputTokens + totalCacheReadTokens + totalCacheCreationTokens;

  const totalCostUsd = sum(rows, callCostUsd);
  const totalCostNoCacheUsd = sum(rows, callCostNoCacheUsd);
  const cacheSavingsUsd = totalCostNoCacheUsd - totalCostUsd;

  const totalProposals = sum(rows, (r) => r.proposals);

  // Latency stats over successful calls only (errors are usually instant or timeouts).
  const latencies = ok.map((r) => r.latencyMs).sort((a, b) => a - b);

  return {
    model: MODEL,
    pricing,
    hasData: true,
    totalCalls: rows.length,
    okCalls: ok.length,
    errorCalls,
    errorRate: rows.length === 0 ? 0 : errorCalls / rows.length,
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
        costUsd: callCostUsd(r),
        costNoCacheUsd: callCostNoCacheUsd(r),
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
