# Operator — an AI-native ops manager

> **CS 153 · One-Person Frontier Lab.** A solo-built demonstration that one person plus a
> frontier model can stand in for an operations team.

A small business runs on a stream of decisions a large company would hire a whole team for:
what to restock, when, and from which vendor; how to price; how to staff. **Operator** is an
AI agent (Claude Opus) that makes those calls against a live business model and hands each one
to a human for approval — order placed, vendor email drafted, price changed, only on your say-so.

The working prototype is a competitive simulation: five storefronts on Times Square running the
same data model — products, vendors, inventory, customers, emails. Four shops are run
autonomously by the agent under different strategies (stockpile, lean, premium, high-volume);
the fifth is yours, where the agent drafts every move and you approve or reject it. The same
engine generalizes to any storefront with a vendor catalog and customers.

The simulation runs day-by-day in 6-hour segments, with customer arrivals calibrated to real
Times Square pedestrian counts (~330k/day). Each tick advances the world; the agent reads the
current state, reasons about tradeoffs, and proposes actions; you decide what executes. The
[**Inference**](#inference-panel) panel exposes the cost, latency, and prompt-caching behind
every agent decision.

## What's in here

```
                      ┌─────────────────────────────────┐
                      │  AI + HUMAN TEAMING (UI / API)  │
                      └────────────────┬────────────────┘
                                       │
                ┌──────────────────────┼─────────────────────┐
                ▼                      ▼                     ▼
   ┌─────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
   │ Analytics & Workflows│  │   Automations     │  │ Products & SDKs    │
   │ Workshop, Performance│  │  Reorder agents,  │  │ Brew, Menuccino,   │
   │ Audit log, Ontology  │  │  Pricing agent,   │  │ MochaMail,         │
   │                     │  │  Tick scheduler   │  │ Proposals          │
   └─────────────────────┘  └────────────────────┘  └────────────────────┘
                                       │
                       ┌───────────────┴────────────────┐
                       │           ONTOLOGY              │
                       │  Shop · Product · Recipe ·      │
                       │  Ingredient · Vendor · PO ·     │
                       │  InventoryBatch · CustomerOrder │
                       │  · Review · Email · Proposal    │
                       └───────────────┬────────────────┘
                                       │
                ┌──────────────────────┼─────────────────────┐
                ▼                      ▼                     ▼
   ┌─────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
   │   Data Sources      │  │  Logic Sources    │  │ Systems of Action  │
   │   Pedestrian flow,  │  │  Reorder heuristic,│  │ Place PO, Send    │
   │   Vendor catalog,   │  │  Reorder LLM       │  │ vendor email,     │
   │   Customer orders,  │  │  (Claude Opus 4.7),│  │ Receive delivery, │
   │   Daily snapshots   │  │  Pricing heuristic │  │ Update price      │
   └─────────────────────┘  └────────────────────┘  └────────────────────┘
```

## Five teams, five strategies

| Team | Strategy | Behavior |
|------|----------|----------|
| Stockpile Cafe | Stockpile | Orders generously; tolerates perishable waste |
| Frugal Brews | Lean inventory | 1 staff, minimum stock; tolerates stockouts |
| Bowery & Co. | Premium | +25% prices, premium vendors only |
| Penny Cup | High volume | 4 staff, −15% prices, push throughput |
| Operator's Cafe | Manual | You drive every decision; the agent drafts proposals + emails |

## The agent loop

Every tick, the world advances and the heuristic reorder + pricing agents auto-fire for every shop. AI teams have `auto_approve = true`, so their proposals execute on creation (PO placed, vendor email sent, cash deducted). The human team accumulates pending proposals — you approve or reject from the Proposals tab.

The LLM agent (Claude Opus 4.7) is opt-in per team. It reads the same ontology snapshot but reasons about cross-ingredient tradeoffs, vendor reliability vs. cost, perishable risk, and cash runway — and composes the vendor email body. Strategy variants change the system prompt: aggressive_stocker overrides the 7-day target with 10 days, lean_operator caps at 3 days, premium_pricer always picks the most-reliable vendor regardless of price, etc.

The deployed demo enforces a 3-call LLM budget per server instance to protect API credits — heuristic agents stay available indefinitely.

## Run locally

Requires Node 22+. Anthropic API key optional — falls back to the heuristic agent if `ANTHROPIC_API_KEY` is unset.

```sh
npm install
npm run db:migrate           # create SQLite schema
npm run db:seed              # seed 5 teams, 8 vendors, 30 customers, starter inventory
npm run dev                  # http://localhost:3000

# (optional) drop your API key into .env so the LLM agent works:
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env
```

CLI scripts:

```sh
npm run tick -- 4            # advance 4 segments (one day)
npm run agent --all          # fire LLM agent for every AI team
npm run db:reset             # wipe + reseed
```

## Deploy to Railway

The live demo runs on Railway with a persistent volume so state survives restarts and visitors share the same world. Cold start runs migrations and only seeds if the DB is empty.

1. Create a Railway project from the GitHub repo.
2. Attach a volume mounted at `/data`.
3. Set env vars:
   - `DB_PATH=/data/coffee.db`
   - `ANTHROPIC_API_KEY=sk-ant-...` (optional — heuristic agent works without it)
4. Deploy. Railway autodetects Next.js and runs `npm run build` + `npm start`.

`db/client.ts` falls back to `:memory:` if it can't open the configured file, so the app still boots if the volume isn't attached yet — useful while wiring things up.

## Deploy to DigitalOcean (Droplet)

A droplet keeps the SQLite-on-disk architecture intact (App Platform's filesystem is
ephemeral, which would force a Postgres rewrite). Migrations run once at server startup via
`instrumentation.ts`, never during build, so deploys are safe. Deploy artifacts live in
[`deploy/`](deploy/).

1. **Create** an Ubuntu 24.04 droplet (2 GB RAM — `next build` is memory-hungry; the setup
   script also adds 2 GB swap as insurance). SSH in as root.
2. **Provision** (installs Node 22, build tools, Caddy, clones the repo, installs the systemd
   service):
   ```sh
   curl -fsSL https://raw.githubusercontent.com/Jauxon/jacksons-coffee-foundry/master/deploy/setup-droplet.sh | sudo bash
   ```
3. **Configure**:
   - `sudo nano /etc/coffee/coffee.env` → set `ANTHROPIC_API_KEY`. `DB_PATH` defaults to
     `/var/lib/coffee/coffee.db` (persists across deploys; point it at an attached Block Storage
     volume if you want independent snapshots).
   - `sudo nano /etc/caddy/Caddyfile` → set your domain (or switch to the `:80` IP-only block).
4. **Build + start**:
   ```sh
   sudo bash /srv/coffee/deploy/deploy.sh && sudo systemctl reload caddy
   ```
5. **Point DNS** — an `A` record from your domain to the droplet IP. Caddy fetches HTTPS
   automatically once DNS resolves.

**Auto-deploy on push** (replicates Railway's git-push DX): the
[`deploy-droplet.yml`](.github/workflows/deploy-droplet.yml) Action SSHes in and runs
`deploy/deploy.sh` on every push to `master`. Add three repo secrets: `DROPLET_HOST`,
`DROPLET_USER` (`root`), `DROPLET_SSH_KEY` (a private key whose public half is in the droplet's
`authorized_keys`).

**Migrating the live world** is optional — an empty DB self-seeds on first boot, so you can
start fresh. To carry over Railway's state instead, copy its `coffee.db` to the droplet's
`DB_PATH` before first start.

## Tour

| Page | What's there |
|------|--------------|
| `/` | Leaderboard — map of all 5 shops on Times Square, team cards with stock-ticker net Δ, recent reviews |
| `/workshop` | Cross-team analytics: filter teams, switch metrics (net / revenue / cash / fulfillment), hover charts for tooltips, click bars to drill in |
| `/objects` | Object Explorer — every entity type browseable with sortable columns, click any row for properties + linked objects |
| `/ontology` | System diagram — surfaces, sources, central entity graph with action-flow callouts, sample object inspector |
| `/agents` | Logic Functions — read-only flow editor for each agent (heuristic reorder, LLM reorder, pricing) with a live "Test run" widget |
| `/inference` | **Inference panel** — cost, latency, and prompt-cache ledger for every Claude call (see below) |
| `/vendors` | Vendor catalog — every offering grouped by ingredient with cheapest/fastest/most-reliable flags |
| `/audit` | Chronological feed of every system event: proposals created, approved, POs placed, emails sent, day closes |
| `/team/[id]` | Per-team Brew dashboard — cash, rating, inventory, storage usage, pending proposals, recent reviews |
| `/team/[id]/performance` | Per-team day-by-day breakdown with sortable columns, sparkline KPIs |
| `/team/[id]/menuccino` | Inventory batches + product price/availability controls |
| `/team/[id]/mochamail` | Vendor email threads with attached purchase orders |
| `/team/[id]/proposals` | Pending agent proposals — full LLM rationale + draft email + approve/reject |

## Inference panel

Every agent decision is one Claude call, and the `/inference` route is the ledger behind them.
Each call writes a row to the `llm_call` table with **raw token counts and latency only** — every
dollar figure is derived at read time in [`lib/llm-metrics.ts`](lib/llm-metrics.ts) from a pricing
table, so a model-price change never requires a backfill.

What it surfaces:

- **Total spend** and **cost per proposal** — what the agent's reasoning actually costs.
- **Saved by caching** — the counterfactual: the same tokens billed with *no* prompt caching,
  minus actual cost. Cache reads bill at 10% of the input rate, so the wider the cache-read band
  in the token-mix chart, the cheaper the run.
- **Cache hit rate** — fraction of prompt tokens served from cache (the system prompt — persona,
  recipes, ontology — is cached ephemeral; only the per-tick world snapshot is fresh).
- **Latency** — avg / p50 / p95 over successful calls.
- **Recent calls** — per-call token mix, latency, cost, no-cache counterfactual, and status.

This is the "inference layer made legible" — the same cost/latency/caching tradeoffs the
infrastructure speakers talk about, instrumented in an app I can actually point at.

## Stack

- **Next.js 16** (App Router, server components, server actions)
- **TypeScript**, **Tailwind**, **Drizzle ORM** + **better-sqlite3**
- **Anthropic SDK** with prompt caching + adaptive thinking + tool use
- **Leaflet** + OpenStreetMap for the Times Square map
- Charts and the ontology graph are hand-rolled — bar/stacked charts in HTML/CSS, time series + ontology graph in SVG. No chart library dependency.

## Project structure

```
app/                  # Next.js routes (Leaderboard, Workshop, Objects, Ontology, Agents, ...)
components/           # Reusable React components (charts, sortable table, sim controls, ...)
db/
  schema.ts           # Drizzle schema — 17 tables defining the ontology
  client.ts           # SQLite + auto-bootstrap in production
  seed.ts             # seedDatabase() — 5 teams, 8 vendors, 10 ingredients, recipes, customers
  migrations/         # Drizzle-generated SQL migrations
sim/
  pedestrian.ts       # Times Square flow model (calibrated to ~330k peds/day)
  tick.ts             # Multi-team customer routing + service + day-end snapshot
  agent.ts            # Heuristic reorder + approval action
  pricing-agent.ts    # Heuristic price adjustment based on balked-on-price
  llm-agent.ts        # Claude Opus 4.7 agent with strategy-specific prompts
  review.ts           # Templated review generator (LLM-replaceable)
lib/
  data.ts             # Server-side data access (read-only views over the ontology)
  object-types.tsx    # Object Explorer registry — list/get/columns/detail per entity
  workshop-aggregations.ts  # Cross-team aggregations for the Workshop page
scripts/
  tick.ts             # CLI: advance the sim N segments
  agent.ts            # CLI: fire the agent for one or all teams
```
