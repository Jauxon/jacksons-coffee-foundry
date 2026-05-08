import { notFound } from "next/navigation";
import { getShop, getDailySnapshots, getTicker, fmtUSD } from "../../../../lib/data.ts";
import { Sparkline } from "../../../../components/Sparkline.tsx";
import { SortableTable, type SortableColumn, type SortableRow } from "../../../../components/SortableTable.tsx";

export const dynamic = "force-dynamic";

export default async function TeamPerformance({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shopId = Number(id);
  const shop = getShop(shopId);
  if (!shop) notFound();
  const snaps = getDailySnapshots(shopId, 30);
  const ticker = getTicker(shopId, 30);

  const cashSeries = snaps.map((s) => s.cashCents);
  const netSeries = snaps.map((s) => s.netCents);
  const fulSeries = snaps.map((s) => s.fulfillmentRate);

  return (
    <div className="px-6 py-6 space-y-5">
      {snaps.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-md px-4 py-12 text-center text-slate-500">
          <div className="text-base mb-1">No history yet.</div>
          <div className="text-[12px]">Daily snapshots are written at the end of each sim day. Click <strong>Tick day</strong> in the top bar to advance time.</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <BigStat label="Cash" value={fmtUSD(shop.cashCents)} sub={ticker.netChangePct == null ? null : `${ticker.netChangePct >= 0 ? "+" : ""}${ticker.netChangePct.toFixed(1)}% net Δ vs prior day`} sparkline={cashSeries} positive={ticker.netChangePct == null ? null : ticker.netChangePct >= 0} />
            <BigStat label="Net (latest day)" value={ticker.latestNet == null ? "—" : fmtUSD(ticker.latestNet)} valueClass={ticker.latestNet != null && ticker.latestNet < 0 ? "text-rose-700" : "text-emerald-700"} sub={`Avg over ${snaps.length}d: ${fmtUSD(snaps.reduce((a, s) => a + s.netCents, 0) / snaps.length)}`} sparkline={netSeries} positive={ticker.latestNet != null ? ticker.latestNet >= 0 : null} />
            <BigStat label="Fulfillment" value={`${Math.round((snaps[snaps.length - 1]?.fulfillmentRate ?? 0) * 100)}%`} sub={`Avg: ${Math.round(snaps.reduce((a, s) => a + s.fulfillmentRate, 0) / snaps.length * 100)}%`} sparkline={fulSeries.map((v) => v * 100)} positive={null} />
          </div>

          <section className="bg-white border border-slate-200 rounded-md">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-medium">Day-by-day</h2>
              <span className="text-[11px] text-slate-500">{snaps.length} days · click any column to sort</span>
            </div>
            <SortableTable
              columns={[
                { key: "day", label: "Day", sortable: true },
                { key: "rev", label: "Revenue", align: "right", sortable: true, className: "tabular-nums" },
                { key: "cogs", label: "COGS", align: "right", sortable: true, className: "tabular-nums text-slate-600" },
                { key: "wages", label: "Wages", align: "right", sortable: true, className: "tabular-nums text-slate-600" },
                { key: "net", label: "Net", align: "right", sortable: true, className: "tabular-nums" },
                { key: "cash", label: "Cash close", align: "right", sortable: true, className: "tabular-nums" },
                { key: "fulFail", label: "Fulfilled / Failed", align: "right", sortable: true, className: "tabular-nums text-slate-600" },
                { key: "fulRate", label: "Fulfillment", align: "right", sortable: true, className: "tabular-nums" },
                { key: "rating", label: "Avg ★", align: "right", sortable: true, className: "tabular-nums" },
              ]}
              defaultSortKey="day"
              defaultSortDir="desc"
              rows={snaps.map((s) => {
                const netCls = s.netCents >= 0 ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold";
                return {
                  id: s.day,
                  sortValues: {
                    day: s.day,
                    rev: s.revenueCents,
                    cogs: s.cogsCents,
                    wages: s.wagesCents,
                    net: s.netCents,
                    cash: s.cashCents,
                    fulFail: s.fulfilledOrders,
                    fulRate: s.fulfillmentRate,
                    rating: s.avgRating,
                  },
                  cells: {
                    day: <span className="font-mono text-slate-700">D{s.day}</span>,
                    rev: fmtUSD(s.revenueCents),
                    cogs: fmtUSD(s.cogsCents),
                    wages: fmtUSD(s.wagesCents),
                    net: <span className={netCls}>{s.netCents >= 0 ? "+" : ""}{fmtUSD(s.netCents)}</span>,
                    cash: fmtUSD(s.cashCents),
                    fulFail: `${s.fulfilledOrders} / ${s.failedOrders}`,
                    fulRate: `${Math.round(s.fulfillmentRate * 100)}%`,
                    rating: s.avgRating == null ? "—" : s.avgRating.toFixed(2),
                  },
                };
              })}
            />
          </section>
        </>
      )}
    </div>
  );
}

function BigStat({ label, value, sub, sparkline, positive, valueClass = "text-slate-900" }: {
  label: string; value: string; sub: string | null; sparkline: number[];
  positive: boolean | null; valueClass?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
        <Sparkline values={sparkline} width={120} height={28} positive={positive} />
      </div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
