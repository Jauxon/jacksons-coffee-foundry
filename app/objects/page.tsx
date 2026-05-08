import Link from "next/link";
import { listObjectTypes } from "../../lib/object-types.tsx";

export const dynamic = "force-dynamic";

export default function ObjectsIndex() {
  const types = listObjectTypes();
  return (
    <div className="px-6 py-6">
      <div className="mb-5">
        <h1 className="font-serif text-2xl text-coffee-900">Object Explorer</h1>
        <p className="text-sm text-slate-500">Browse every type in the ontology. Each object links to its related rows so you can walk the data graph manually.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {types.map((t) => (
          <Link key={t.key} href={`/objects/${t.key}`} className="block group">
            <div className="bg-white border border-slate-200 rounded-md px-4 py-3 hover:border-coffee-400 hover:shadow-sm transition">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xl">{t.emoji}</span>
                <h2 className="font-medium text-slate-900 group-hover:underline">{t.plural}</h2>
                <span className="ml-auto text-[12px] tabular-nums text-slate-500">{t.count().toLocaleString()}</span>
              </div>
              <p className="text-[12px] text-slate-600 leading-relaxed">{t.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
