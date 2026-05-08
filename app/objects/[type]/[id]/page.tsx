import Link from "next/link";
import { notFound } from "next/navigation";
import { OBJECT_TYPES } from "../../../../lib/object-types.tsx";

export const dynamic = "force-dynamic";

export default async function ObjectDetail({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const def = OBJECT_TYPES[type];
  if (!def) notFound();
  const row = def.get(Number(id));
  if (!row) notFound();
  const detail = def.detail(row);

  return (
    <div className="px-6 py-6">
      <div className="mb-3 text-[12px]">
        <Link href="/objects" className="text-slate-500 hover:underline">All types</Link>
        <span className="text-slate-300 mx-2">›</span>
        <Link href={`/objects/${type}`} className="text-slate-500 hover:underline">{def.plural}</Link>
        <span className="text-slate-300 mx-2">›</span>
        <span className="text-slate-700 font-mono">{def.labelOf(row)}</span>
      </div>

      <div className="mb-5">
        <h1 className="font-serif text-2xl text-coffee-900">
          <span className="mr-2">{def.emoji}</span>{def.labelOf(row)}
        </h1>
        {def.subtitleOf && <p className="text-sm text-slate-500">{def.subtitleOf(row)}</p>}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Properties */}
        <section className="col-span-1 bg-white border border-slate-200 rounded-md">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="font-medium text-slate-800">Properties</h2>
          </div>
          <dl className="px-4 py-3 space-y-2 text-[13px]">
            {detail.fields.map((f, i) => (
              <div key={i} className="grid grid-cols-3 gap-3 items-baseline border-b border-slate-100 pb-2 last:border-b-0">
                <dt className="text-[11px] uppercase tracking-wider text-slate-500">{f.label}</dt>
                <dd className={`col-span-2 ${f.mono ? "font-mono" : ""} text-slate-800`}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Linked objects */}
        <section className="col-span-2 space-y-4">
          {detail.links.length === 0 && <div className="text-sm text-slate-500 italic">No linked objects.</div>}
          {detail.links.map((g, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-md">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-medium text-slate-800">{g.title}</h3>
                <span className="text-[11px] text-slate-500">{g.refs.length}</span>
              </div>
              {g.refs.length === 0 ? (
                <div className="px-4 py-4 text-[12px] text-slate-500 italic">None</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {g.refs.map((ref, j) => (
                    <li key={`${ref.type}-${ref.id}-${j}`}>
                      <Link href={`/objects/${ref.type}/${ref.id}`} className="block px-4 py-2 hover:bg-slate-50 text-[13px]">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="flex items-baseline gap-2">
                            <span>{OBJECT_TYPES[ref.type]?.emoji ?? "•"}</span>
                            <span className="font-medium text-slate-800">{ref.label}</span>
                          </div>
                          {ref.subtitle && <span className="text-[11px] text-slate-500 truncate">{ref.subtitle}</span>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
