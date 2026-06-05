# Operator — an AI-native ops manager

> **CS 153 · One-Person Frontier Lab.** A solo-built demonstration that one person plus a
> frontier model can stand in for an operations team.

**Live demo:** `http://YOUR-DROPLET-IP` · **Demo video:** _(add link)_ · **Repo:** [github.com/Jauxon/jacksons-coffee-foundry](https://github.com/Jauxon/jacksons-coffee-foundry)

---

## 1. Problem & motivation

A small business runs on a constant stream of operating decisions that a large company would hire a
whole team for: what to restock, when, and from which vendor; how to price; how to staff. The owner
of a single café is making a buyer's, a pricing analyst's, and a finance lead's calls at once —
usually from gut feel, because hiring those roles is impossible at that scale.

**Operator** asks: can one frontier-model agent do that job, with a human keeping veto power? It's an
AI agent (Claude Opus) that reads a live model of the business, reasons about the cross-cutting
tradeoffs (vendor reliability vs. cost vs. perishability vs. cash runway), and proposes concrete
actions — place this PO, send this vendor email, change this price — that a human approves or
rejects. Nothing executes without sign-off.

**Why now:** tool use + extended reasoning + prompt caching make it newly practical for a *single*
model call to weigh a dozen interacting constraints and emit a structured, auditable action — cheaply
enough to run continuously. That capability is two years old, not twenty.

**The approach (what makes it more than a CRUD app):** rather than hard-code an ops tool, I built an
**ontology-driven simulation** as a testbed. Five storefronts on Times Square share one data model;
four are run autonomously by the agent under different strategies, and one is human-operated. Crucially,
the agent has **two interchangeable backends behind one interface** — a deterministic heuristic and a
Claude LLM agent — so I can A/B the *same* decision across rules vs. model, and across model tiers. The
coffee scenario is the prototype; the engine generalizes to any storefront with a vendor catalog and
customers.

## 2. What I built

A deployed, working web app — not a notebook or mockup. Substantial moving parts:

- **A 17-table ontology** (Drizzle + SQLite): shops, products, recipes, ingredients, vendors,
  purchase orders, inventory batches, customer orders, reviews, emails, agent proposals, daily
  snapshots, and an inference-telemetry table.
- **A discrete-event simulation** (`sim/`): customer arrivals calibrated to Times Square foot traffic,
  per-customer willingness-to-pay and wait tolerance, FEFO inventory depletion with perishable expiry,
  multi-vendor sourcing with lead times, wages, and day-close financial snapshots.
- **Two interchangeable agents** behind one interface: a heuristic reorder/pricing engine and a
  **Claude Opus 4.7 agent** using tool use, adaptive thinking, and prompt caching.
- **A human-in-the-loop approval workflow**: agents emit proposals (with rationale + a drafted vendor
  email); the operator approves/rejects; approval places the PO, sends the email, and deducts cash in
  one transaction. Full audit trail.
- **Eight cross-linked surfaces**: leaderboard, cross-team analytics, object explorer, ontology graph,
  logic-function viewer, vendor catalog, audit log, and an **inference cost panel** — plus per-team
  dashboards.

```
                      ┌─────────────────────────────────┐
                      │   AI + HUMAN TEAMING (UI / API) │
                      └────────────────┬────────────────┘
                ┌──────────────────────┼─────────────────────┐
                ▼                      ▼                     ▼
   ┌─────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
   │ Analytics & metrics │  │   Automations      │  │  Operator surfaces │
   │ Workshop, Inference │  │  Reorder agents,   │  │  Dashboard, Menu,  │
   │ Audit log, Ontology │  │  Pricing agent,    │  │  Mail, Proposals   │
   │                     │  │  Tick scheduler    │  │                    │
   └─────────────────────┘  └────────────────────┘  └────────────────────┘
                       ┌───────────────┴────────────────┐
                       │           ONTOLOGY              │
                       │  Shop · Product · Recipe ·      │
                       │  Ingredient · Vendor · PO ·     │
                       │  InventoryBatch · CustomerOrder │
                       │  · Review · Email · Proposal    │
                       └───────────────┬────────────────┘
                ┌──────────────────────┼─────────────────────┐
                ▼                      ▼                     ▼
   ┌─────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
   │   Data sources      │  │  Logic functions   │  │ Systems of action  │
   │   Pedestrian flow,  │  │  Reorder heuristic,│  │ Place PO, send     │
   │   Vendor catalog,   │  │  Reorder LLM       │  │ vendor email,      │
   │   Customer orders   │  │  (Claude Opus 4.7),│  │ receive delivery,  │
   │   Daily snapshots   │  │  Pricing heuristic │  │ update price       │
   └─────────────────────┘  └────────────────────┘  └────────────────────┘
```

**Five teams, five strategies**

| Team | Strategy | Behavior |
|------|----------|----------|
| Stockpile Cafe | Stockpile | Orders generously; tolerates perishable waste |
| Frugal Brews | Lean inventory | 1 staff, minimum stock; tolerates stockouts |
| Bowery & Co. | Premium | Higher prices, most-reliable vendors only |
| Penny Cup | High volume | 4 staff, lower prices, push throughput |
| Operator's Cafe | Manual | You drive every decision; the agent drafts proposals + emails |

**The agent loop.** Each tick advances the world and auto-fires the heuristic agents for every shop.
AI teams auto-approve, so their proposals execute on creation; the human team accumulates pending
proposals to review. The LLM agent is opt-in per team — it reads the same ontology snapshot but
reasons about cross-ingredient tradeoffs and composes the vendor email. Strategy variants change the
system prompt (e.g. the stockpiler targets 10 days of cover, the lean operator caps at 3).

## 3. Evaluation & evidence

The project validates its claims *inside the product*, not just in prose:

**Model bake-off (cost vs. quality).** The `/inference` page runs the **same reorder scenario through
Opus 4.7, Sonnet 4.6, and Haiku 4.5** and renders a decision-level agreement matrix — which
ingredients each tier reorders, in what quantity, from which vendor. This makes the cost/quality
frontier concrete: where the tiers agree, the cheap model wins (often **5–15× cheaper** for the same
calls); where they diverge (different quantities, vendors, or skipped orders) is exactly where paying
for the frontier model earns its keep. Re-runs vary (temperature unpinned), so it's a live comparison,
not a canned result.

**Inference economics, instrumented.** Every Claude call logs raw token counts + latency to an
`llm_call` table; all dollar figures are *derived* from a pricing table at read time
([`lib/llm-metrics.ts`](lib/llm-metrics.ts)). The panel shows total spend, cost-per-proposal, latency
(p50/p95), cache hit rate, and a **no-cache counterfactual** that quantifies prompt-caching savings
(cache reads bill at 10% of input). Building this surfaced a real bug — the panel had been pricing
Opus at the *old* $15/$75 rate; current Opus 4.7 is **$5/$25 per MTok** ([Anthropic
pricing](https://platform.claude.com/docs/en/about-claude/pricing)), so reported cost was ~3× too
high until corrected.

**Simulation grounded in real numbers.** Customer arrivals are scaled to Times Square pedestrian
counts (~330k/day, [Times Square Alliance](https://www.timessquarenyc.org/do-business/market-research-data/pedestrian-counts))
split across four dayparts; willingness-to-pay is a logistic around each customer's price ceiling;
prices use realistic NYC café ranges; inventory depletes first-expired-first-out with perishable
expiry. Parameters are hand-tuned for legible dynamics (disclosed as a limitation below), not
empirically fit.

**Strategies measurably diverge — including failure.** The four AI strategies produce different cash,
fulfillment-rate, and rating trajectories over time, visible in the Workshop charts. Over-aggressive
spending drives cash negative → the team is flagged **BANKRUPT** and its agent is paused — an explicit,
observable failure mode rather than a hidden crash.

**Engineering validation.** Every change is type-checked (`tsc --noEmit`) and production-built; before
each deploy I run runtime smoke tests (server boots, migrations apply against a fresh DB, key pages
return 200, the OG image renders). The bake-off handles per-model failures independently so one tier
erroring doesn't sink the run.

### Limitations & honest failure analysis

- **It's a simulation, not a measured business.** Capture rate, price elasticity, and arrival mix are
  hand-tuned to produce interpretable dynamics; they are not fit to real café data. Conclusions are
  about the *model*, not ground truth.
- **LLM decisions are nondeterministic** (temperature unpinned). The bake-off is a sample, and a single
  run shouldn't be read as proof of one tier's superiority.
- **Reviews are templated**, not LLM-written — deterministic and free, at the cost of less natural text.
- **Single-instance SQLite, one shared world, no auth/RBAC.** Fine for a demo; not multi-tenant.
- **LLM spend is capped** by a per-instance call budget, so the LLM agent isn't always-on for all teams.
- **No automated unit-test suite yet** — validation is typecheck + production build + manual runtime
  smoke tests. A suite over the pure `sim/` functions is the obvious next step.

## 4. Run it locally

Requires Node 22+. The Anthropic key is optional — without it the app falls back to the heuristic agent.

```sh
npm install
npm run db:migrate           # create SQLite schema
npm run db:seed              # seed 5 teams, 8 vendors, customers, starter inventory
npm run dev                  # http://localhost:3000

# (optional) enable the LLM agent + bake-off:
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env
```

CLI: `npm run tick -- 4` (advance one day), `npm run agent --all` (fire LLM agent), `npm run db:reset`.

## 5. Deploy (DigitalOcean droplet)

The live demo runs on a DigitalOcean droplet, which keeps the SQLite-on-disk architecture intact.
Migrations run **once at server startup** via [`instrumentation.ts`](instrumentation.ts) — never during
`next build` (which spawns ~11 workers that would otherwise deadlock on the DB). Deploy scripts live in
[`deploy/`](deploy/).

1. Create an Ubuntu 24.04 droplet (2 GB+ RAM; the setup script adds swap for the build).
2. Provision (Node 22, build tools, Caddy + auto-HTTPS, systemd service, repo clone):
   ```sh
   curl -fsSL https://raw.githubusercontent.com/Jauxon/jacksons-coffee-foundry/master/deploy/setup-droplet.sh | sudo bash
   ```
3. Set `ANTHROPIC_API_KEY` (and optionally `SITE_URL`, `LLM_CALL_BUDGET`) in `/etc/coffee/coffee.env`;
   set your domain in `/etc/caddy/Caddyfile` (or use the `:80` IP-only block).
4. Build + start: `sudo bash /srv/coffee/deploy/deploy.sh && sudo systemctl reload caddy`.

Redeploy after a push with `ssh root@<ip> "bash /srv/coffee/deploy/deploy.sh"`. The DB persists across
deploys on the droplet's disk; an empty DB self-seeds on first boot.

> Earlier iterations ran on Vercel (dropped — its ephemeral filesystem can't persist SQLite) and
> Railway (worked, then migrated to a droplet to run on existing credits). That history is in the
> commit log.

## 6. Tour

| Page | What's there |
|------|--------------|
| `/` | Leaderboard — map of all 5 shops, team cards with stock-ticker net Δ, recent reviews, FDC stockout alerts |
| `/workshop` | Cross-team analytics: filter teams, switch metrics, hover charts, drill into bars |
| `/inference` | **Inference panel** — cost/latency/cache ledger per Claude call + the **model bake-off** |
| `/objects` | Object Explorer — every entity type browseable with sortable columns + linked objects |
| `/ontology` | System diagram — sources, central entity graph with action-flow callouts, live counts |
| `/agents` | Logic Functions — read-only flow editor per agent with a live "Test run" widget |
| `/vendors` | Vendor catalog — offerings grouped by ingredient with cheapest/fastest/most-reliable flags |
| `/audit` | Chronological feed of every system event (proposals, approvals, POs, emails, day closes) |
| `/team/[id]` | Per-team dashboard — cash, rating, inventory, storage, pending proposals, reviews |
| `/team/[id]/performance` | Day-by-day breakdown with sortable columns + sparkline KPIs |
| `/team/[id]/menuccino` | Inventory batches + product price/availability controls |
| `/team/[id]/mochamail` | Vendor email threads with attached purchase orders |
| `/team/[id]/proposals` | Pending proposals — full LLM rationale + draft email + approve/reject |

## 7. Stack

- **Next.js 16** (App Router, server components, server actions) — every page is a server function
  that queries the DB and returns JSX; no separate API layer.
- **TypeScript**, **Tailwind**, **Drizzle ORM** + **better-sqlite3** (synchronous, in-process).
- **Anthropic SDK** — Claude Opus 4.7 with tool use, adaptive thinking, and prompt caching.
- **Leaflet** + OpenStreetMap for the map; all charts and the ontology graph are hand-rolled (no chart
  library).

```
app/          # Next.js routes + server actions + OG image / manifest / favicon
components/    # React components (charts, bake-off, sim controls, sortable table, ...)
db/            # schema (ontology), client + startup bootstrap, seed, migrations
sim/           # pedestrian model, tick orchestrator, heuristic + LLM agents, reviews
lib/           # read-only data views, object-explorer registry, workshop + inference aggregations
deploy/        # droplet provisioning + deploy scripts, systemd unit, Caddyfile
instrumentation.ts  # runs DB migrations once at server startup
```

## 8. AI usage, integrity & process disclosure

- **AI usage (disclosed).** This project was built by the author with heavy use of AI coding tools
  (Claude / Claude Code). I directed the architecture, product decisions, data model, debugging, and
  evaluation design; the assistant generated and refactored code under that direction. The LLM agent
  inside the app uses the Anthropic API (Claude Opus 4.7).
- **Original work.** All code in this repository is original to it — **nothing was forked from or
  copied out of an existing codebase.** Third-party dependencies are standard npm packages, listed in
  `package.json`. The conceptual framing (an operations agent over a structured business model with
  human approval) is my own.
- **Iteration over time.** The git commit history is the development record: the data model, the
  simulation, the dual agents, three deployment migrations (Vercel → Railway → DigitalOcean), the
  inference panel, the bake-off, and a corrected pricing bug each land as discrete, described commits.
- **Major decisions & limitations** are discussed in §1 (approach), §3 (evaluation), and the
  Limitations subsection above.
- **Citations.** Anthropic model pricing — [platform.claude.com/docs](https://platform.claude.com/docs/en/about-claude/pricing).
  Times Square pedestrian counts — [Times Square Alliance](https://www.timessquarenyc.org/do-business/market-research-data/pedestrian-counts).
