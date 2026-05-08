import Link from "next/link";
import { notFound } from "next/navigation";
import { OBJECT_TYPES } from "../../../lib/object-types.tsx";
import { SortableTable, type SortableColumn, type SortableRow } from "../../../components/SortableTable.tsx";

export const dynamic = "force-dynamic";

export default async function ObjectList({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const def = OBJECT_TYPES[type];
  if (!def) notFound();

  const rows = def.list();

  // Convert the registry's columns into SortableColumn shape.
  const columns: SortableColumn[] = def.columns.map((c) => ({
    key: c.key,
    label: c.label,
    align: c.align ?? "left",
    sortable: true,
    className: c.className,
  }));

  // Pre-render rows with cells (server-rendered ReactNode) + raw sort values.
  const sortableRows: SortableRow[] = rows.map((row) => {
    const cells: Record<string, React.ReactNode> = {};
    const sortValues: Record<string, string | number | null> = {};
    for (const c of def.columns) {
      cells[c.key] = c.render ? c.render(row) : (row[c.key] as React.ReactNode);
      // For sort: prefer raw row value if it's primitive.
      const raw = row[c.key];
      if (typeof raw === "number" || typeof raw === "string") {
        sortValues[c.key] = raw;
      } else if (typeof raw === "boolean") {
        sortValues[c.key] = raw ? 1 : 0;
      } else {
        // Fallback: stringify the rendered cell value.
        sortValues[c.key] = String(cells[c.key] ?? "");
      }
    }
    return {
      id: row.id,
      cells,
      sortValues,
      href: `/objects/${type}/${row.id}`,
    };
  });

  return (
    <div className="px-6 py-6">
      <div className="mb-3 text-[12px]">
        <Link href="/objects" className="text-slate-500 hover:underline">← All object types</Link>
      </div>
      <div className="mb-5 flex items-baseline gap-3">
        <h1 className="font-serif text-2xl text-coffee-900">
          <span className="mr-2">{def.emoji}</span>{def.plural}
        </h1>
        <span className="text-sm text-slate-500">{rows.length.toLocaleString()} rows</span>
      </div>
      <p className="text-[13px] text-slate-600 mb-4 max-w-3xl">{def.description}</p>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <SortableTable columns={columns} rows={sortableRows} emptyMessage="No rows yet." />
      </div>
    </div>
  );
}
