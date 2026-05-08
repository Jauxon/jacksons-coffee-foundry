import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
dotenv.config({ override: true, path: path.resolve(path.dirname(__filename), "../.env") });

import { proposeReorders, approveProposal } from "../sim/agent.ts";
import { proposeReordersWithLLM } from "../sim/llm-agent.ts";
import { db, schema as s } from "../db/client.ts";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);
const autoApprove = args.includes("--approve");
const useHeuristic = args.includes("--heuristic") || !process.env.ANTHROPIC_API_KEY;
const shopArg = args.find((a) => /^--shop=/.test(a));
const shopId = shopArg ? Number(shopArg.split("=")[1]) : null;
const allFlag = args.includes("--all");

if (!process.env.ANTHROPIC_API_KEY && !args.includes("--heuristic")) {
  console.log("(no ANTHROPIC_API_KEY in env — falling back to heuristic agent. Pass --heuristic to silence this.)\n");
}

const shopsToRun = allFlag
  ? db.select().from(s.shop).all().filter((sh) => sh.agentStrategy !== "human").map((sh) => sh.id)
  : shopId != null
    ? [shopId]
    : (() => {
        // Default: run for the human team for backwards compat. Print usage hint.
        const human = db.select().from(s.shop).all().find((sh) => sh.agentStrategy === "human");
        if (human) console.log(`(no --shop or --all given; defaulting to human team #${human.id} '${human.name}'. Use --all for every AI team or --shop=N for a specific one.)\n`);
        return human ? [human.id] : [];
      })();

for (const sid of shopsToRun) {
  const shop = db.select().from(s.shop).where(eq(s.shop.id, sid)).get();
  if (!shop) { console.log(`shop #${sid}: not found`); continue; }
  console.log(`\n=== ${shop.name} (${shop.agentStrategy}, shopId=${shop.id}) ===`);
  if (shop.agentStrategy === "human") {
    console.log("  human-operated — no AI proposals.");
    continue;
  }

  if (useHeuristic) {
    const r = proposeReorders(shop.id);
    if (r.proposals === 0) console.log("  agent[heuristic]: no reorders proposed.");
    else for (const d of r.decisions) {
      console.log(`  • ${d.ingredientName.padEnd(18)} ${String(d.qty).padStart(6)} units from ${d.vendorName.padEnd(24)} → arrives day ${d.expectedDay} ($${(d.totalCents/100).toFixed(2)})`);
    }
  } else {
    const r = await proposeReordersWithLLM(shop.id);
    console.log(`  agent[llm]: ${r.proposals} proposal(s)`);
    console.log(`  Summary: ${r.summary}\n`);
    for (const d of r.decisions) {
      const ing = db.select().from(s.ingredient).where(eq(s.ingredient.id, d.ingredient_id)).get();
      const vendor = db.select().from(s.vendor).where(eq(s.vendor.id, d.vendor_id)).get();
      const total = (d.qty * d.expected_unit_price_cents) / 100;
      console.log(`  • ${(ing?.name ?? "?").padEnd(18)} ${String(d.qty).padStart(6)} ${(ing?.unit ?? "").padEnd(5)} from ${(vendor?.name ?? "?").padEnd(24)} → arrives day ${d.expected_day} ($${total.toFixed(2)})`);
      console.log(`      ${d.rationale}`);
    }
    const u = r.usage;
    console.log(`  tokens: input=${u.input_tokens} cache_write=${u.cache_creation_input_tokens} cache_read=${u.cache_read_input_tokens} output=${u.output_tokens}`);
  }

  if (autoApprove || shop.autoApprove) {
    const pending = db.select().from(s.agentProposal)
      .where(eq(s.agentProposal.status, "pending")).all().filter((p) => p.shopId === shop.id);
    for (const p of pending) {
      try {
        const r = approveProposal(p.id);
        console.log(`  ✓ approved proposal ${p.id} → PO ${r.purchaseOrderId}`);
      } catch (e) {
        console.log(`  ✗ proposal ${p.id} rejected: ${(e as Error).message}`);
      }
    }
  }
}
