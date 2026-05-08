import { notFound } from "next/navigation";
import { getShop, getInventoryBatches, getProducts, fmtUSD } from "../../../../lib/data.ts";
import { PriceEditor } from "../../../../components/PriceEditor.tsx";
import { SortableTable } from "../../../../components/SortableTable.tsx";

export const dynamic = "force-dynamic";

export default async function TeamMenuccino({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shopId = Number(id);
  const shop = getShop(shopId);
  if (!shop) notFound();
  const batches = getInventoryBatches(shopId);
  const products = getProducts(shopId);

  return (
    <div className="px-6 py-6 space-y-5">
      <section className="bg-white border border-slate-200 rounded-md">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-medium">Inventory Batches</h2>
          <span className="text-[11px] text-slate-500">{batches.length} batches · click any column to sort</span>
        </div>
        <SortableTable
          columns={[
            { key: "title", label: "Title", sortable: true, className: "font-mono text-slate-700" },
            { key: "ingredient", label: "Ingredient", sortable: true, className: "font-mono text-slate-700" },
            { key: "remaining", label: "Remaining", align: "right", sortable: true, className: "tabular-nums" },
            { key: "initial", label: "Initial", align: "right", sortable: true, className: "tabular-nums text-slate-500" },
            { key: "days", label: "Days until expiry", align: "right", sortable: true, className: "tabular-nums" },
            { key: "status", label: "Status", sortable: true },
            { key: "delivered", label: "Delivery Day", align: "right", sortable: true, className: "tabular-nums text-slate-700" },
          ]}
          defaultSortKey="days"
          defaultSortDir="asc"
          emptyMessage="No batches."
          rows={batches.map((b) => {
            const status = b.expired
              ? { label: "Expired", cls: "pill-red", rank: 0 }
              : b.remainingQty === 0
              ? { label: "Depleted", cls: "pill-slate", rank: 1 }
              : b.daysUntilExpiry <= 1
              ? { label: "Expires today", cls: "pill-amber", rank: 2 }
              : { label: "Active", cls: "pill-green", rank: 3 };
            return {
              id: b.id,
              sortValues: {
                title: b.id,
                ingredient: b.ingredientName,
                remaining: b.remainingQty,
                initial: b.initialQty,
                days: b.daysUntilExpiry,
                status: status.rank,
                delivered: b.deliveredDay,
              },
              cells: {
                title: `batch-${b.id.toString().padStart(4, "0")}`,
                ingredient: b.ingredientName,
                remaining: <span className={b.remainingQty === 0 ? "text-slate-400" : "text-slate-800"}>{b.remainingQty.toLocaleString()} {b.ingredientUnit}</span>,
                initial: b.initialQty.toLocaleString(),
                days: b.daysUntilExpiry > 0 ? `${b.daysUntilExpiry}` : "—",
                status: <span className={`pill ${status.cls}`}>{status.label}</span>,
                delivered: `Day ${b.deliveredDay}`,
              },
            };
          })}
        />
      </section>

      <section className="bg-white border border-slate-200 rounded-md">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-medium">Team Products</h2>
          <span className="text-[11px] text-slate-500">{products.length} products</span>
        </div>
        <table className="foundry-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Recipe</th>
              <th className="text-right">Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td className="font-medium text-slate-800">{p.name}</td>
                <td className="text-[12px] text-slate-600">
                  {p.ingredients.map((i) => `${i.qty}${i.unit} ${i.name}`).join(" · ")}
                </td>
                <td className="text-right tabular-nums text-slate-800">{fmtUSD(p.priceCents)}</td>
                <td><PriceEditor productId={p.id} priceCents={p.priceCents} isAvailable={p.isAvailable} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
