import Link from "next/link";
import { notFound } from "next/navigation";
import { getShop, STRATEGY_META, fmtUSD } from "../../../lib/data.ts";
import { SimControls } from "../../../components/SimControls.tsx";
import { getLLMUsage } from "../../../sim/llm-agent.ts";
import type { ReactNode } from "react";

export default async function TeamLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shopId = Number(id);
  const shop = getShop(shopId);
  if (!shop) notFound();
  const meta = STRATEGY_META[shop.agentStrategy] ?? { label: shop.agentStrategy, emoji: "•", blurb: "" };
  const isHuman = shop.agentStrategy === "human";

  return (
    <div>
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 py-4 flex flex-wrap items-center gap-4">
          <Link href="/" className="text-[12px] text-slate-500 hover:text-slate-800 hover:underline">← All teams</Link>
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: shop.colorHex }} />
            <h1 className="font-serif text-xl text-coffee-900">{shop.name}</h1>
            <span className="text-[11px] tracking-wide text-coffee-700 bg-cream-100 border border-cream-300 px-2 py-0.5 rounded">{meta.emoji} {meta.label}</span>
            {shop.autoApprove && <span className="pill pill-amber">auto-approve</span>}
          </div>
          <div className="ml-auto">
            <SimControls day={shop.day} segment={shop.segment} shopId={shop.id} isHuman={isHuman} llmRemaining={getLLMUsage().remaining} />
          </div>
        </div>
        <div className="px-6 pb-3 text-[12px] text-slate-600 italic">{meta.blurb}</div>
        <nav className="px-6 flex items-center gap-1 border-t border-slate-100">
          <SubNav href={`/team/${shop.id}`} label="Brew" />
          <SubNav href={`/team/${shop.id}/performance`} label="Performance" />
          <SubNav href={`/team/${shop.id}/menuccino`} label="Menuccino" />
          <SubNav href={`/team/${shop.id}/mochamail`} label="MochaMail" />
          <SubNav href={`/team/${shop.id}/proposals`} label="Proposals" badge={shop.pendingProposals} />
        </nav>
      </div>
      {children}
    </div>
  );
}

function SubNav({ href, label, badge }: { href: string; label: string; badge?: number }) {
  return (
    <Link href={href} className="px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 hover:text-coffee-800 border-b-2 border-transparent hover:border-coffee-400 inline-flex items-center gap-1.5">
      {label}
      {badge != null && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-100 text-amber-900 text-[10px] font-semibold">{badge}</span>
      )}
    </Link>
  );
}
