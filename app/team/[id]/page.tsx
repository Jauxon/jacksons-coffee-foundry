import { notFound } from "next/navigation";
import { getShop, getInventoryByIngredient, getRecentReviews, getProposals, fmtUSD } from "../../../lib/data.ts";
import { StaffEditor } from "../../../components/StaffEditor.tsx";

export const dynamic = "force-dynamic";

export default async function TeamBrew({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shopId = Number(id);
  const shop = getShop(shopId);
  if (!shop) notFound();
  const inventory = getInventoryByIngredient(shopId);
  const reviews = getRecentReviews({ shopId, limit: 8 });
  const pendingProposals = getProposals(shopId).filter((p) => p.status === "pending");

  const storagePct = Math.min(100, Math.round((shop.storageUsedUnits / shop.storageCapacityUnits) * 100));
  const storageBarClass = storagePct > 90 ? "bg-rose-500" : storagePct > 75 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="grid grid-cols-5 gap-4">
        <Stat title="Cash" value={fmtUSD(shop.cashCents)} hint="$8,000 starting" />
        <Stat title="Avg rating" value={shop.avgRating == null ? "—" : `${shop.avgRating.toFixed(2)} ★`} hint={`${shop.totalReviews} reviews`} />
        <Stat title="Fulfilled" value={shop.fulfilledOrders.toLocaleString()} hint={`yesterday: ${shop.yesterdayFulfilled}`} valueClass="text-emerald-700" />
        <Stat title="Failed" value={shop.failedOrders.toLocaleString()} hint={`yesterday: ${shop.yesterdayFailed}`} valueClass="text-rose-700" />
        <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Staff</div>
          <StaffEditor shopId={shop.id} staffCount={shop.staffCount} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Storage usage bar */}
        <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Storage</div>
            <div className="text-[12px] tabular-nums text-slate-700">{Math.round(shop.storageUsedUnits).toLocaleString()} / {shop.storageCapacityUnits.toLocaleString()} units · <span className="font-semibold">{storagePct}%</span></div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-2 ${storageBarClass}`} style={{ width: `${storagePct}%` }} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5">Storage volume used vs. capacity. Reorder agent caps non-perishables at 14 days of consumption.</div>
        </div>

        {/* Pending proposals summary */}
        <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Suggestions awaiting review</div>
            <div className="text-[12px] tabular-nums text-slate-700">{pendingProposals.length} pending</div>
          </div>
          {pendingProposals.length === 0 ? (
            <div className="text-[12px] text-slate-500">No pending suggestions. Heuristic auto-fires on each tick when stock drops below the reorder threshold.</div>
          ) : (
            <div className="text-[12px] text-slate-700 space-y-1">
              {pendingProposals.slice(0, 3).map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className={`pill ${p.kind === "price_update" ? "pill-amber" : "pill-slate"}`}>
                    {p.kind === "price_update" ? "price" : "reorder"}
                  </span>
                  <span className="font-mono">{p.kind === "price_update" ? p.rationale.split(".")[0].slice(0, 60) : p.ingredientName}</span>
                </div>
              ))}
              <a href={`/team/${shop.id}/proposals`} className="block text-coffee-700 underline mt-1">Review all {pendingProposals.length} →</a>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <section className="col-span-2 bg-white border border-slate-200 rounded-md">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-medium">Inventory by ingredient</h2>
            <span className="text-[11px] text-slate-500">FEFO depletion · expiry sweep on tick</span>
          </div>
          <table className="foundry-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th className="text-right">On-hand</th>
                <th className="text-right">In transit</th>
                <th className="text-right">Earliest expiry</th>
                <th className="text-right">Shelf life</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((row) => {
                const daysToExpiry = row.earliestExpiryDay == null ? null : row.earliestExpiryDay - shop.day;
                const stockClass = row.totalQty === 0 ? "text-rose-700 font-semibold"
                  : row.totalQty < 100 ? "text-amber-700" : "text-slate-800";
                return (
                  <tr key={row.ingredientId}>
                    <td className="font-mono text-slate-700">{row.name}</td>
                    <td className={`text-right tabular-nums ${stockClass}`}>{row.totalQty.toLocaleString()} {row.unit}</td>
                    <td className="text-right tabular-nums text-slate-600">{row.inTransitQty > 0 ? `+${row.inTransitQty.toLocaleString()}` : "—"}</td>
                    <td className="text-right tabular-nums">
                      {daysToExpiry == null
                        ? <span className="text-slate-400">—</span>
                        : daysToExpiry <= 0
                        ? <span className="pill pill-red">expired</span>
                        : daysToExpiry <= 1
                        ? <span className="pill pill-amber">{daysToExpiry}d</span>
                        : <span className="text-slate-700">{daysToExpiry}d</span>}
                    </td>
                    <td className="text-right text-slate-500">{row.shelfLifeDays}d</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="bg-white border border-slate-200 rounded-md">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="font-medium">Latest reviews</h2>
          </div>
          <div className="p-3 space-y-3 max-h-[480px] overflow-y-auto">
            {reviews.length === 0 && <div className="text-sm text-slate-500 italic px-2">No reviews yet.</div>}
            {reviews.map((r) => (
              <div key={r.id} className="text-[12px] border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500">{"★".repeat(r.stars)}<span className="text-slate-300">{"★".repeat(5 - r.stars)}</span></span>
                  <span className="text-slate-500 text-[11px]">{r.customerName ?? "anon"} · D{r.day} {r.segment}</span>
                </div>
                <p className="text-slate-700 leading-relaxed mt-1">{r.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ title, value, hint, valueClass = "text-slate-900" }: { title: string; value: string; hint?: string; valueClass?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{title}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
