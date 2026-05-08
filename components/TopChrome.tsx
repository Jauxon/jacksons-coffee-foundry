import Link from "next/link";
import { AboutButton } from "./AboutButton.tsx";

// Foundry-style top chrome.
// Per-team navigation lives inside the team layout; this is the build-space header.
export function TopChrome() {
  return (
    <header className="sticky top-0 z-30 h-11 border-b border-slate-200 bg-white/95 backdrop-blur flex items-center px-4 text-[13px]">
      <div className="flex items-center gap-2 text-slate-600">
        <span className="inline-block h-5 w-5 rounded bg-coffee-600 text-white grid place-items-center text-[11px] font-bold">JC</span>
      </div>
      <nav className="ml-3 flex items-center gap-3 text-slate-700">
        <Link href="/" className="hover:underline">Dashboard</Link>
        <span className="text-slate-300">·</span>
        <Link href="/workshop" className="hover:underline">Workshop</Link>
        <span className="text-slate-300">·</span>
        <Link href="/objects" className="hover:underline">Objects</Link>
        <span className="text-slate-300">·</span>
        <Link href="/ontology" className="hover:underline">Ontology</Link>
        <span className="text-slate-300">·</span>
        <Link href="/agents" className="hover:underline">Logic Functions</Link>
        <span className="text-slate-300">·</span>
        <Link href="/vendors" className="hover:underline">Vendors</Link>
        <span className="text-slate-300">·</span>
        <Link href="/audit" className="hover:underline">Audit</Link>
      </nav>
      <div className="ml-auto flex items-center gap-3 text-slate-600">
        <AboutButton />
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-slate-50">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="4" r="2" fill="#16A34A"/><circle cx="4" cy="12" r="2" fill="#94A3B8"/><circle cx="12" cy="8" r="2" fill="#94A3B8"/><path d="M4 6v4M6 4h6M6 12h6" stroke="currentColor" strokeWidth="1.2"/></svg>
          Main
          <span className="text-slate-400">▾</span>
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Saved
        </span>
      </div>
    </header>
  );
}
