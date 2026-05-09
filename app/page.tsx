import Link from "next/link";
import { getAllShops, getRecentReviews, getSimState, getTicker, getCurrentStockouts, fmtUSD, STRATEGY_META } from "../lib/data.ts";
import { ShopMapClient as ShopMap } from "../components/ShopMapClient.tsx";
import { SimControls } from "../components/SimControls.tsx";
import { Sparkline } from "../components/Sparkline.tsx";
import { getLLMUsage } from "../sim/llm-agent.ts";

export const dynamic = "force-dynamic";

export default function Leaderboard() {
  const shops = getAllShops();
  const sim = getSimState();
  const reviews = getRecentReviews({ limit: 25 });
  const llm = getLLMUsage();

  const fdc = shops.find((s) => s.agentStrategy === "human");
  const fdcStockouts = fdc ? getCurrentStockouts(fdc.id) : [];

  // Map center: average of all shop positions, falling back to Times Square.
  const center = shops.length === 0
    ? { lat: 40.7580, lng: -73.9855 }
    : { lat: shops.reduce((a, s) => a + s.lat, 0) / shops.length, lng: shops.reduce((a, s) => a + s.lng, 0) / shops.length };

  return (
    <div className="bg-cream-50">
      {/* Cream/parchment header banner */}
      <div className="border-b border-cream-300 bg-cream-100">
        <div className="px-6 h-14 flex items-center gap-3">
          <span className="text-2xl">🏆</span>
          <h1 className="font-serif text-xl text-coffee-900 tracking-tight">Jackson's Coffee Foundry</h1>
          <div className="ml-auto">
            <SimControls day={sim.day} segment={sim.segment} llmRemaining={llm.remaining} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-44px-56px)]">
        {/* LEFT — map */}
        <section className="col-span-5 border-r border-cream-300 bg-cream-100 p-6 flex flex-col">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-serif text-lg text-coffee-900">Coffee Shops</h2>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-coffee-800">
              <span className="text-coffee-400">SIMULATION</span>
              <Pill>Day {sim.day}</Pill>
              <span className="text-coffee-400">TIME</span>
              <Pill>{capitalize(sim.segment)}</Pill>
            </div>
          </div>
          <div className="flex-1 rounded-md overflow-hidden border border-coffee-400/30 shadow-inner min-h-[400px]">
            <ShopMap markers={shops.map((s) => ({
              id: s.id, name: s.name, lat: s.lat, lng: s.lng, colorHex: s.colorHex,
              cashCents: s.displayCashCents, isBankrupt: s.isBankrupt, agentStrategy: s.agentStrategy,
            }))} center={center} zoom={16} />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
            {shops.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5 text-slate-700">
                <span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: s.colorHex }} />
                <span className="font-medium">{s.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CENTER — team cards */}
        <section className="col-span-4 p-6 bg-cream-50 border-r border-cream-300">
          <div className="space-y-3">
            {shops.map((shop) => {
              const meta = STRATEGY_META[shop.agentStrategy] ?? { label: shop.agentStrategy, emoji: "•", blurb: "" };
              const ticker = getTicker(shop.id, 14);
              const hasHistory = ticker.series.length > 0;
              const cashSeries = ticker.series.map((s) => s.cash);
              const positive = ticker.netChangePct == null ? null : ticker.netChangePct >= 0;
              return (
                <Link key={shop.id} href={`/team/${shop.id}`} className="block group">
                  <div className={`bg-white rounded-md border px-4 py-3 shadow-sm hover:shadow-md transition ${shop.isBankrupt ? "border-rose-300 hover:border-rose-400" : "border-cream-300 hover:border-coffee-400"}`}>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: shop.colorHex }} />
                      <div className="font-serif text-base text-coffee-900 group-hover:underline">{shop.name}</div>
                      <span className="text-[11px] tracking-wide text-coffee-700 bg-cream-100 border border-cream-300 px-1.5 py-0.5 rounded">{meta.emoji} {meta.label}</span>
                      {shop.isBankrupt && (
                        <span className="text-[10px] uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-300 px-1.5 py-0.5 rounded font-semibold">Bankrupt</span>
                      )}
                      {/* Stock-ticker style change indicator */}
                      <span className="ml-auto flex items-center gap-1.5">
                        {hasHistory && <Sparkline values={cashSeries} positive={positive} width={70} height={20} />}
                        {ticker.netChangePct != null ? (
                          <span className={`text-[12px] font-mono tabular-nums font-semibold ${ticker.netChangePct >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {ticker.netChangePct >= 0 ? "▲" : "▼"} {ticker.netChangePct >= 0 ? "+" : ""}{ticker.netChangePct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-[12px]">
                      <MiniStat label="Cash" value={fmtUSD(shop.displayCashCents)} valueClass={shop.isBankrupt ? "text-rose-700" : "text-coffee-900"} />
                      <MiniStat label="Rating" value={shop.avgRating == null ? "—" : `${shop.avgRating.toFixed(2)}★`} />
                      <MiniStat label="Fulfilled" value={shop.fulfilledOrders.toLocaleString()} valueClass="text-emerald-700" />
                      <MiniStat label="Failed" value={shop.failedOrders.toLocaleString()} valueClass="text-rose-700" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {fdc && fdcStockouts.length > 0 && (
            <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 px-4 py-3">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-rose-700">⚠</span>
                <div className="font-medium text-rose-900 text-[13px]">{fdc.name} is out of stock</div>
                <Link href={`/team/${fdc.id}/proposals`} className="ml-auto text-[11px] text-rose-700 hover:underline">
                  Review proposals →
                </Link>
              </div>
              <div className="text-[12px] text-rose-800 leading-relaxed">
                {fdcStockouts.map((s, i) => (
                  <span key={s.ingredientName}>
                    {i > 0 && ", "}
                    <span className="font-mono">{s.ingredientName.replace(/_/g, " ")}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT — reviews */}
        <section className="col-span-3 bg-white p-5 overflow-y-auto max-h-[calc(100vh-44px-56px)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-coffee-600">💬</span>
            <h2 className="font-medium text-slate-800">Reviews</h2>
            <span className="ml-auto text-[11px] text-slate-500">{reviews.length} recent</span>
          </div>
          <div className="space-y-3">
            {reviews.length === 0 && <div className="text-sm text-slate-500 italic">No reviews yet — run a tick.</div>}
            {reviews.map((r) => (
              <div key={r.id} className="border-b border-slate-100 pb-3 last:border-b-0">
                <div className="flex items-center gap-2 mb-1">
                  <Stars value={r.stars} />
                  <Link href={`/team/${r.shopId}`} className="text-[12px] font-medium text-slate-700 hover:underline">{r.shopName}</Link>
                  <span className="ml-auto text-[10px] text-slate-500">D{r.day} · {r.segment}</span>
                </div>
                <div className="text-[11px] text-slate-500 mb-1">{r.customerName ?? "Anonymous"}</div>
                <p className="text-[12px] leading-relaxed text-slate-700">{r.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded bg-white border border-cream-300 text-coffee-900 text-[11px] font-mono">{children}</span>;
}

function MiniStat({ label, value, valueClass = "text-coffee-900" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`tabular-nums font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="text-amber-500 tracking-tight">
      {"★".repeat(value)}<span className="text-slate-300">{"★".repeat(Math.max(0, 5 - value))}</span>
    </span>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
