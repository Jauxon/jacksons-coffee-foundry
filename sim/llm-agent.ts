// LLM-powered reorder agent. Same interface as the heuristic agent in agent.ts —
// reads ontology, decides, persists to agent_proposal. Only the decide step changes:
// instead of hardcoded rules it asks Claude (Opus 4.7) via tool use, with the system
// prompt + tools cached so subsequent ticks pay ~10% input cost on the prefix.

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

// Force-override anything in process.env (Claude Code and other harnesses
// inject ANTHROPIC_API_KEY=""; without override the .env file is ignored).
const __filename = fileURLToPath(import.meta.url);
dotenv.config({ override: true, path: path.resolve(path.dirname(__filename), "../.env") });
import { db, schema as s } from "../db/client.ts";
import { eq, and, gt, sql } from "drizzle-orm";

// Lazy client construction. The Anthropic SDK throws at construction if no API
// key is present, and `next build` imports this module (via getLLMUsage/MODEL)
// in a shell that has no key — the key only exists in the runtime systemd env.
// Constructing on first use, not at import, keeps the build green without a key
// and lets the app fall back to the heuristic agent when no key is configured.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}
export const MODEL = "claude-opus-4-7";

// ----------------------------------------------------------------------------
// Per-instance LLM budget — keeps a casual demo visitor from draining your
// Anthropic credit. Counter is in-memory; resets on Vercel cold start.
// Override via env: LLM_CALL_BUDGET=5
// ----------------------------------------------------------------------------
const LLM_CALL_BUDGET = Number(process.env.LLM_CALL_BUDGET ?? 3);
let _llmCallsUsed = 0;

export function getLLMUsage(): { used: number; budget: number; remaining: number } {
  return { used: _llmCallsUsed, budget: LLM_CALL_BUDGET, remaining: Math.max(0, LLM_CALL_BUDGET - _llmCallsUsed) };
}

// ----------------------------------------------------------------------------
// Inference telemetry — persist one row per call (success or failure) so the
// /inference panel can chart cost, latency, and cache effectiveness. Best-effort:
// a telemetry write must never break the agent, so we swallow insert errors.
// ----------------------------------------------------------------------------
function recordLLMCall(
  shopId: number,
  strategy: string,
  snap: { current_day: number; segment: string },
  m: {
    latencyMs: number;
    usage: { input_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; output_tokens: number };
    proposals: number;
    ok: boolean;
    errorText?: string;
  },
  opts?: { model?: string; agentName?: string },
): void {
  try {
    db.insert(s.llmCall).values({
      shopId,
      agentName: opts?.agentName ?? "reorder-llm",
      model: opts?.model ?? MODEL,
      strategy,
      day: snap.current_day,
      segment: snap.segment,
      inputTokens: m.usage.input_tokens,
      cacheCreationTokens: m.usage.cache_creation_input_tokens,
      cacheReadTokens: m.usage.cache_read_input_tokens,
      outputTokens: m.usage.output_tokens,
      latencyMs: m.latencyMs,
      proposals: m.proposals,
      ok: m.ok,
      errorText: m.errorText ?? null,
      createdAt: new Date(),
    }).run();
  } catch (e) {
    console.warn("[llm-agent] failed to record telemetry:", (e as Error).message);
  }
}

// ----------------------------------------------------------------------------
// World snapshot — the dynamic part of the prompt.
// ----------------------------------------------------------------------------

interface VendorOffer {
  vendor_id: number;
  vendor_name: string;
  vendor_email: string;
  lead_time_days: number;
  reliability: number;
  unit_price_cents: number;
  moq: number;
}

interface IngredientSnapshot {
  ingredient_id: number;
  name: string;
  unit: string;
  shelf_life_days: number;
  current_qty: number;
  in_transit_qty: number;
  yesterdays_consumption: number;
  days_of_stock: number;
  vendor_offers: VendorOffer[];
}

interface WorldSnapshot {
  team_name: string;
  agent_strategy: string;
  current_day: number;
  segment: string;
  cash_cents: number;
  staff_count: number;
  yesterday_stockouts: number;
  yesterday_fulfilled: number;
  ingredients: IngredientSnapshot[];
}

function gatherSnapshot(shopId: number): { snapshot: WorldSnapshot; shopId: number; agentStrategy: string } {
  const state = db.select().from(s.simState).where(eq(s.simState.id, 1)).get();
  if (!state) throw new Error("simState missing — run db:seed");
  const shop = db.select().from(s.shop).where(eq(s.shop.id, shopId)).get();
  if (!shop) throw new Error(`no shop with id=${shopId}`);

  const ingredients = db.select().from(s.ingredient).all();
  const offerings = db.select().from(s.vendorIngredient).all();
  const vendors = new Map(db.select().from(s.vendor).all().map((v) => [v.id, v]));
  const yesterday = state.day - 1;

  const consumed = db
    .select({
      ingredientId: s.productIngredient.ingredientId,
      used: sql<number>`SUM(${s.productIngredient.qtyPerUnit})`.as("used"),
    })
    .from(s.customerOrder)
    .innerJoin(s.productIngredient, eq(s.productIngredient.productId, s.customerOrder.productId))
    .where(
      and(
        eq(s.customerOrder.shopId, shop.id),
        eq(s.customerOrder.status, "fulfilled"),
        eq(s.customerOrder.day, yesterday),
      ),
    )
    .groupBy(s.productIngredient.ingredientId)
    .all();
  const consumedById = new Map<number, number>(consumed.map((r) => [r.ingredientId, Number(r.used) || 0]));

  const yStock = db
    .select({ c: sql<number>`COUNT(*)`.as("c") })
    .from(s.customerOrder)
    .where(and(eq(s.customerOrder.shopId, shop.id), eq(s.customerOrder.status, "stockout"), eq(s.customerOrder.day, yesterday)))
    .get();
  const yFul = db
    .select({ c: sql<number>`COUNT(*)`.as("c") })
    .from(s.customerOrder)
    .where(and(eq(s.customerOrder.shopId, shop.id), eq(s.customerOrder.status, "fulfilled"), eq(s.customerOrder.day, yesterday)))
    .get();

  const ingredientSnapshots: IngredientSnapshot[] = ingredients
    .filter((ing) => !ing.isTapSupplied) // tap water + ice maker are infinite
    .map((ing) => {
      const cur = db
        .select({ q: sql<number>`COALESCE(SUM(${s.inventoryBatch.remainingQty}), 0)` })
        .from(s.inventoryBatch)
        .where(
          and(
            eq(s.inventoryBatch.shopId, shop.id),
            eq(s.inventoryBatch.ingredientId, ing.id),
            gt(s.inventoryBatch.expiresDay, state.day - 1),
          ),
        )
        .get();
      const it = db
        .select({ q: sql<number>`COALESCE(SUM(${s.purchaseOrder.qty}), 0)` })
        .from(s.purchaseOrder)
        .where(
          and(
            eq(s.purchaseOrder.shopId, shop.id),
            eq(s.purchaseOrder.ingredientId, ing.id),
            eq(s.purchaseOrder.status, "in_transit"),
          ),
        )
        .get();
      const currentQty = Number(cur?.q ?? 0);
      const inTransitQty = Number(it?.q ?? 0);
      const consumption = consumedById.get(ing.id) ?? 0;
      const daysOfStock = consumption > 0 ? (currentQty + inTransitQty) / consumption : Number.POSITIVE_INFINITY;

      const offers: VendorOffer[] = offerings
        .filter((o) => o.ingredientId === ing.id)
        .map((o) => {
          const v = vendors.get(o.vendorId)!;
          return {
            vendor_id: v.id,
            vendor_name: v.name,
            vendor_email: v.email,
            lead_time_days: v.leadTimeDays,
            reliability: v.reliability,
            unit_price_cents: o.unitPriceCents,
            moq: o.moq,
          };
        })
        .sort((a, b) => a.vendor_id - b.vendor_id);

      return {
        ingredient_id: ing.id,
        name: ing.name,
        unit: ing.unit,
        shelf_life_days: ing.shelfLifeDays,
        current_qty: currentQty,
        in_transit_qty: inTransitQty,
        yesterdays_consumption: consumption,
        days_of_stock: Number.isFinite(daysOfStock) ? Math.round(daysOfStock * 100) / 100 : -1,
        vendor_offers: offers,
      };
    })
    .sort((a, b) => a.ingredient_id - b.ingredient_id);

  return {
    shopId: shop.id,
    agentStrategy: shop.agentStrategy,
    snapshot: {
      team_name: shop.name,
      agent_strategy: shop.agentStrategy,
      current_day: state.day,
      segment: state.segment,
      cash_cents: shop.cashCents,
      staff_count: shop.staffCount,
      yesterday_stockouts: Number(yStock?.c ?? 0),
      yesterday_fulfilled: Number(yFul?.c ?? 0),
      ingredients: ingredientSnapshots,
    },
  };
}

// ----------------------------------------------------------------------------
// Stable system prompt + recipes — the cached prefix.
// ----------------------------------------------------------------------------

function gatherRecipeSummary(shopId: number): string {
  const products = db.select().from(s.product).where(eq(s.product.shopId, shopId)).all();
  const ings = db.select().from(s.ingredient).all();
  const ingsById = new Map(ings.map((i) => [i.id, i]));
  const recipes = db.select().from(s.productIngredient).all();
  const byProduct = new Map<number, { ingredientId: number; qtyPerUnit: number }[]>();
  for (const r of recipes) {
    const arr = byProduct.get(r.productId) ?? [];
    arr.push({ ingredientId: r.ingredientId, qtyPerUnit: r.qtyPerUnit });
    byProduct.set(r.productId, arr);
  }
  const lines: string[] = [];
  for (const p of products.sort((a, b) => a.id - b.id)) {
    const items = (byProduct.get(p.id) ?? [])
      .map((r) => `${r.qtyPerUnit}${ingsById.get(r.ingredientId)?.unit ?? ""} ${ingsById.get(r.ingredientId)?.name ?? "?"}`)
      .join(", ");
    lines.push(`  - ${p.name} ($${(p.priceCents / 100).toFixed(2)}): ${items}`);
  }
  return lines.join("\n");
}

const STRATEGY_ADDENDUM: Record<string, string> = {
  aggressive_stocker: `# YOUR STRATEGY: AGGRESSIVE STOCKER
You overstock to never miss a sale. A stockout is the worst thing that can happen — losing a customer to the shop next door costs reputation and revenue. Override the standard "7 days target" — order **10 days of consumption** for non-perishables, and even for perishables push to the maximum the shelf life allows. Accept some inventory waste; it's cheaper than lost sales.`,

  lean_operator: `# YOUR STRATEGY: LEAN OPERATOR
You optimize for cash preservation above all else. A stockout is recoverable; running out of cash is not. Override the standard "7 days target" — order only **3 days of consumption** rounded up to MOQ. Skip any reorder where the days_of_stock > lead_time + 0.5 (you're willing to risk a same-day reorder). Always pick the cheapest vendor unless they're truly out of contention.`,

  premium_pricer: `# YOUR STRATEGY: PREMIUM PRICER
Your menu is priced 25% above market. Customers expect quality. **Always pick the most reliable vendor** (highest reliability number) for every ingredient — never General Supplies for milk or beans even though they're cheapest. Brooklyn Roasters for beans, Hudson Valley Dairy for milk, even at premium prices. Your customer base tolerates higher COGS in exchange for consistency.`,

  volume_king: `# YOUR STRATEGY: VOLUME KING
Your menu is 15% below market and you run extra staff to push throughput. Cups, lids, and beans are your bottlenecks — running out blocks every single drink. Order **aggressively** on packaging (cups + lids), and pick the cheapest vendor everywhere to preserve margin. You're willing to over-order non-perishables (cups, lids, water, beans last 30+ days) since they don't waste.`,

  human: `# NO AUTONOMOUS AGENT
This team is human-operated. You should not be running on this shop. If you reach this prompt, return an empty decisions array and a summary explaining the team is human-managed.`,
};

function buildSystemPrompt(shopId: number, agentStrategy: string, teamName: string): string {
  return `You are the autonomous reorder agent for "${teamName}", one of several coffee shops competing on the TKTS steps in Times Square, NYC. The Times Square Alliance reports ~330,000 pedestrians/day past this corner — your shop and 4 competitors split that flow based on price, reputation, and capacity. Your job is to propose ingredient purchase orders for a human FDE operator to approve.

# Your principles (ranked, top wins on tradeoffs)

1. **Don't stock out.** A stockout costs revenue immediately and damages the rolling sentiment score that drives future arrivals. Better to over-cushion than to miss the morning rush.
2. **Don't waste cash on perishables.** If shelf life < 5 days, never order more than 3 days of consumption — expired inventory is pure loss. If MOQ would force you over that ceiling, skip the ingredient and explain why in your summary.
3. **Match vendor to need.**
   - Stock critically low (≤ 1 day) → fastest vendor, even if pricier.
   - Stock comfortable (> lead time + safety) → cheapest vendor.
   - Reliability matters when stock is thin. Below 0.9 reliability, bias toward redundancy.
4. **Respect MOQ.** Round qty up to the nearest MOQ multiple.
5. **Cash management.** Never let the order total drop cash below 1 week of payroll runway (staff_count × 4 segments × $72 wages × 7 = roughly $4,000+ for 2 staff). If you'd breach that, skip lower-priority orders and explain.
6. **Skip if covered.** If in_transit_qty already exceeds expected consumption through the vendor's lead time, do not order again.

# Decision math

For each ingredient you decide to reorder:
- Compute days_of_stock = (current_qty + in_transit_qty) / yesterdays_consumption.
- Trigger reorder when days_of_stock < (best_vendor_lead_time + 1 safety day).
- Target qty = (7 days × consumption), capped at (shelf_life_days × consumption) for perishables, then rounded up to the chosen vendor's MOQ.
- expected_day = current_day + chosen_vendor.lead_time_days.

# Ontology you're acting against

- **Ingredient**: tracked by name, unit (g/ml/unit), shelf_life_days. Inventory lives in batches — FEFO depleted as customers are served.
- **VendorIngredient**: a vendor's offer for one ingredient. Has unit_price_cents, moq, and the vendor's lead_time_days + reliability.
- **InventoryBatch**: produced when a PurchaseOrder is delivered. Expires shelf_life_days after delivery.
- **PurchaseOrder**: status flows pending → in_transit → delivered. Cash deducts at order placement.

# This shop's recipes (stable):

${gatherRecipeSummary(shopId)}

${STRATEGY_ADDENDUM[agentStrategy] ?? ""}

# Output requirements

You MUST call the \`submit_reorder_proposals\` tool exactly once. Do not write a textual response.

For each decision in the array:
- ingredient_id, vendor_id, qty (≥ that vendor's MOQ for this ingredient).
- expected_unit_price_cents copied from the vendor offer.
- expected_day = current_day + chosen vendor's lead_time_days.
- **rationale**: 2–3 sentences referencing this specific ingredient's days_of_stock, why this vendor over alternatives, and any perishable / MOQ / cash considerations. Be specific — name the alternative vendor you rejected and why.
- **email_subject** and **email_body**: composed for this vendor. Tone: professional, warm, brief. Reference the order qty, unit price, total, and requested delivery day.

If no reorders are warranted, return an empty decisions array and explain why in summary.`;
}

// ----------------------------------------------------------------------------
// Tool definition (forced via tool_choice).
// ----------------------------------------------------------------------------

const REORDER_TOOL: Anthropic.Tool = {
  name: "submit_reorder_proposals",
  description: "Submit your reorder decisions for human FDE review. Call this exactly once.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Overall reasoning across the shop's inventory: what's tight, what's comfortable, what you skipped and why.",
      },
      decisions: {
        type: "array",
        description: "Per-ingredient reorder proposals. Empty array if no orders are warranted.",
        items: {
          type: "object",
          properties: {
            ingredient_id: { type: "integer" },
            vendor_id: { type: "integer" },
            qty: { type: "integer", description: "Order quantity in the ingredient's unit. Must be a positive multiple of the chosen vendor's MOQ." },
            expected_unit_price_cents: { type: "integer" },
            expected_day: { type: "integer", description: "current_day + chosen vendor's lead_time_days." },
            rationale: { type: "string", description: "2–3 sentences explaining this specific decision." },
            email_subject: { type: "string" },
            email_body: { type: "string" },
          },
          required: [
            "ingredient_id", "vendor_id", "qty",
            "expected_unit_price_cents", "expected_day",
            "rationale", "email_subject", "email_body",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "decisions"],
    additionalProperties: false,
  },
};

// ----------------------------------------------------------------------------
// LLM agent entry point.
// ----------------------------------------------------------------------------

export interface LLMDecision {
  ingredient_id: number;
  vendor_id: number;
  qty: number;
  expected_unit_price_cents: number;
  expected_day: number;
  rationale: string;
  email_subject: string;
  email_body: string;
}

export interface LLMAgentResult {
  proposals: number;
  summary: string;
  decisions: LLMDecision[];
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
  };
}

export async function proposeReordersWithLLM(shopId: number): Promise<LLMAgentResult> {
  if (_llmCallsUsed >= LLM_CALL_BUDGET) {
    throw new Error(`Demo LLM budget reached (${LLM_CALL_BUDGET} calls per warm instance). Use the heuristic agent, or wait for the instance to recycle.`);
  }
  _llmCallsUsed++;

  const { snapshot, agentStrategy } = gatherSnapshot(shopId);

  // Even the human-operated team gets agent drafts (including emails). The
  // operator just has to approve them before anything ships.
  const effectiveStrategy = agentStrategy === "human" ? "premium_pricer" : agentStrategy;
  const systemPrompt = buildSystemPrompt(shopId, effectiveStrategy, snapshot.team_name);

  const t0 = Date.now();
  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      tools: [REORDER_TOOL],
      // Note: forcing tool_choice is incompatible with thinking. With only one tool
      // and an explicit system-prompt instruction to call it, auto is reliable.
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Current world snapshot (JSON):\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n\nDecide on reorders now. Call submit_reorder_proposals exactly once.`,
            },
          ],
        },
      ],
    });
  } catch (e) {
    recordLLMCall(shopId, effectiveStrategy, snapshot, {
      latencyMs: Date.now() - t0,
      usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 },
      proposals: 0,
      ok: false,
      errorText: (e as Error).message,
    });
    throw e;
  }
  const latencyMs = Date.now() - t0;
  const usage = {
    input_tokens: response.usage.input_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    output_tokens: response.usage.output_tokens,
  };

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    recordLLMCall(shopId, effectiveStrategy, snapshot, {
      latencyMs, usage, proposals: 0, ok: false,
      errorText: `expected tool_use response, got stop_reason=${response.stop_reason}`,
    });
    throw new Error(`expected tool_use response, got stop_reason=${response.stop_reason}`);
  }

  const input = toolUse.input as { summary: string; decisions: LLMDecision[] };

  // Cash can go negative — strategies that overspend should crater on purpose.
  // The LLM still sees cash in the snapshot, but we no longer gate persistence
  // on it. Each strategy plays out its philosophy.
  const persisted: LLMDecision[] = [];

  for (const d of input.decisions) {
    const total = d.qty * d.expected_unit_price_cents;
    persisted.push(d);
    db.insert(s.agentProposal).values({
      shopId,
      agentName: "reorder-llm",
      kind: "purchase_order",
      payload: {
        ingredientId: d.ingredient_id,
        vendorId: d.vendor_id,
        qty: d.qty,
        unitPriceCents: d.expected_unit_price_cents,
        totalCents: total,
        expectedDay: d.expected_day,
        emailSubject: d.email_subject,
        emailBody: d.email_body,
      },
      rationale: d.rationale,
      status: "pending",
      createdDay: snapshot.current_day,
      createdSegment: snapshot.segment,
    }).run();
  }

  recordLLMCall(shopId, effectiveStrategy, snapshot, {
    latencyMs, usage, proposals: persisted.length, ok: true,
  });

  return {
    proposals: persisted.length,
    summary: input.summary,
    decisions: persisted,
    usage: {
      input_tokens: usage.input_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
      output_tokens: usage.output_tokens,
    },
  };
}

// ----------------------------------------------------------------------------
// Model bake-off — run the SAME reorder scenario through three Claude tiers and
// compare cost / latency / decisions. Standardized request (tools + cache, no
// extended thinking) so the comparison is apples-to-apples across tiers.
// Does NOT persist proposals — it's a measurement, not a real run. Each call
// still counts against the per-instance budget and is recorded to llm_call
// (agent="bakeoff") so it shows up in the ledger + per-model breakdown.
// ----------------------------------------------------------------------------
export const BAKEOFF_MODELS: { id: string; label: string; tier: string }[] = [
  { id: "claude-opus-4-7",   label: "Opus 4.7",   tier: "Frontier reasoning" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", tier: "Balanced" },
  { id: "claude-haiku-4-5",  label: "Haiku 4.5",  tier: "Fast & cheap" },
];

export interface BakeoffRow {
  model: string;
  label: string;
  tier: string;
  ok: boolean;
  error?: string;
  latencyMs: number;
  usage: { input_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; output_tokens: number };
  decisions: number;
  summary?: string;
}

export async function runModelBakeoff(shopId: number): Promise<BakeoffRow[]> {
  const { snapshot, agentStrategy } = gatherSnapshot(shopId);
  const effectiveStrategy = agentStrategy === "human" ? "premium_pricer" : agentStrategy;
  const systemPrompt = buildSystemPrompt(shopId, effectiveStrategy, snapshot.team_name);
  const userText = `Current world snapshot (JSON):\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n\nDecide on reorders now. Call submit_reorder_proposals exactly once.`;

  const zero = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
  const results: BakeoffRow[] = [];

  for (const m of BAKEOFF_MODELS) {
    if (_llmCallsUsed >= LLM_CALL_BUDGET) {
      results.push({ model: m.id, label: m.label, tier: m.tier, ok: false, error: "instance LLM budget exhausted", latencyMs: 0, usage: zero, decisions: 0 });
      continue;
    }
    _llmCallsUsed++;
    const t0 = Date.now();
    try {
      const response = await getClient().messages.create({
        model: m.id,
        max_tokens: 4096,
        tools: [REORDER_TOOL],
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
      });
      const latencyMs = Date.now() - t0;
      const usage = {
        input_tokens: response.usage.input_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
        output_tokens: response.usage.output_tokens,
      };
      const toolUse = response.content.find((b) => b.type === "tool_use");
      const parsed = toolUse && toolUse.type === "tool_use" ? (toolUse.input as { summary?: string; decisions?: unknown[] }) : null;
      const decisions = parsed?.decisions?.length ?? 0;
      recordLLMCall(shopId, `bakeoff:${effectiveStrategy}`, snapshot, { latencyMs, usage, proposals: decisions, ok: true }, { model: m.id, agentName: "bakeoff" });
      results.push({ model: m.id, label: m.label, tier: m.tier, ok: true, latencyMs, usage, decisions, summary: parsed?.summary });
    } catch (e) {
      const latencyMs = Date.now() - t0;
      recordLLMCall(shopId, `bakeoff:${effectiveStrategy}`, snapshot, { latencyMs, usage: zero, proposals: 0, ok: false, errorText: (e as Error).message }, { model: m.id, agentName: "bakeoff" });
      results.push({ model: m.id, label: m.label, tier: m.tier, ok: false, error: (e as Error).message, latencyMs, usage: zero, decisions: 0 });
    }
  }
  return results;
}
