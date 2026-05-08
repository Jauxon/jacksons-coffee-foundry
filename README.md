# Coffee Cup

A simulated multi-team coffee-shop competition on Times Square — built as a recruiting demo for Palantir's Forward Deployed Engineer role. It mirrors the AIP Coffee Cup hackathon: five storefronts, four AI strategies + one human operator, all driven by the same ontology of products, vendors, inventory, customers, and emails.

The simulation runs day-by-day in 6-hour segments. Customer arrivals are calibrated to Times Square pedestrian counts (~330k/day). Each tick advances the world; each agent fires Logic Functions that read the ontology and propose actions; you (or auto-approve) decide what executes.

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
| Forward Deployed Cafe | Manual | You drive every decision; AI drafts proposals + emails |

## The agent loop

Every tick, the world advances and the heuristic reorder + pricing agents auto-fire for every shop. AI teams have `auto_approve = true`, so their proposals execute on creation (PO placed, vendor email sent, cash deducted). The human team accumulates pending proposals — you approve or reject from the Proposals tab.

The LLM agent (Claude Opus 4.7) is opt-in per team. It reads the same ontology snapshot but reasons about cross-ingredient tradeoffs, vendor reliability vs. cost, perishable risk, and cash runway — and composes the vendor email body. Strategy variants change the system prompt: aggressive_stocker overrides the 7-day target with 10 days, lean_operator caps at 3 days, premium_pricer always picks the most-reliable vendor regardless of price, etc.

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

## Deploy to Vercel

The app uses an in-memory SQLite in production (auto-seeded on cold start) so it deploys to Vercel without a database service.

```sh
npm i -g vercel
vercel login
vercel                       # follow prompts; pick "Other" framework if asked
vercel env add ANTHROPIC_API_KEY  # paste your key when prompted
vercel --prod                # promote to production
```

State resets every cold start, which is fine for a demo — every visitor gets a fresh Day 1.

## Tour

| Page | What's there |
|------|--------------|
| `/` | Leaderboard — map of all 5 shops on Times Square, team cards with stock-ticker net Δ, recent reviews |
| `/workshop` | Cross-team analytics: filter teams, switch metrics (net / revenue / cash / fulfillment), hover charts for tooltips, click bars to drill in |
| `/objects` | Object Explorer — every entity type browseable with sortable columns, click any row for properties + linked objects |
| `/ontology` | System diagram — surfaces, sources, central entity graph with action-flow callouts, sample object inspector |
| `/agents` | Logic Functions — read-only flow editor for each agent (heuristic reorder, LLM reorder, pricing) with a live "Test run" widget |
| `/vendors` | Vendor catalog — every offering grouped by ingredient with cheapest/fastest/most-reliable flags |
| `/audit` | Chronological feed of every system event: proposals created, approved, POs placed, emails sent, day closes |
| `/team/[id]` | Per-team Brew dashboard — cash, rating, inventory, storage usage, pending proposals, recent reviews |
| `/team/[id]/performance` | Per-team day-by-day breakdown with sortable columns, sparkline KPIs |
| `/team/[id]/menuccino` | Inventory batches + product price/availability controls |
| `/team/[id]/mochamail` | Vendor email threads with attached purchase orders |
| `/team/[id]/proposals` | Pending agent proposals — full LLM rationale + draft email + approve/reject |

## Stack

- **Next.js 16** (App Router, server components, server actions)
- **TypeScript**, **Tailwind**, **Drizzle ORM** + **better-sqlite3**
- **Anthropic SDK** with prompt caching + adaptive thinking + tool-use forcing
- **Leaflet** + OpenStreetMap for the Times Square map
- All charts and the ontology graph are hand-rolled SVG — no chart library dependency

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
