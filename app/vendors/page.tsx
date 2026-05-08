import Link from "next/link";
import { getVendorCatalog, fmtUSD } from "../../lib/data.ts";

export const dynamic = "force-dynamic";

export default function Vendors() {
  const catalog = getVendorCatalog();
  // Group by ingredient.
  const byIngredient = new Map<string, typeof catalog>();
  for (const row of catalog) {
    const arr = byIngredient.get(row.ingredientName) ?? [];
    arr.push(row);
    byIngredient.set(row.ingredientName, arr);
  }

  return (
    <div className="px-6 py-6 space-y-5">
      <div>
        <Link href="/" className="text-[12px] text-slate-500 hover:underline">← Back to Leaderboard</Link>
        <h1 className="font-serif text-2xl text-coffee-900 mt-2">Vendor Catalog</h1>
        <p className="text-sm text-slate-500">All offerings the agents check on every tick. Per-ingredient leaders are flagged.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from(byIngredient.entries()).map(([ingName, rows]) => (
          <section key={ingName} className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-baseline justify-between bg-slate-50">
              <h2 className="font-mono font-medium text-slate-800">{ingName}</h2>
              <span className="text-[11px] text-slate-500">unit: {rows[0].ingredientUnit}</span>
            </div>
            <table className="foundry-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">MOQ</th>
                  <th className="text-right">Lead time</th>
                  <th className="text-right">Reliability</th>
                  <th>Best for</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.vendorId}-${r.ingredientId}`}>
                    <td>
                      <div className="font-medium text-slate-800">{r.vendorName}</div>
                      <div className="text-[11px] text-slate-500">{r.vendorEmail}</div>
                    </td>
                    <td className="text-right tabular-nums">{r.unitPriceCents}¢ / {r.ingredientUnit}</td>
                    <td className="text-right tabular-nums text-slate-600">{r.moq.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{r.leadTimeDays}d</td>
                    <td className="text-right tabular-nums">{(r.reliability * 100).toFixed(0)}%</td>
                    <td className="space-x-1">
                      {r.isCheapestForIngredient && <span className="pill pill-green">cheapest</span>}
                      {r.isFastestForIngredient && <span className="pill pill-amber">fastest</span>}
                      {r.isMostReliableForIngredient && <span className="pill pill-slate">most reliable</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
