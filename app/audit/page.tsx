import Link from "next/link";
import { db, schema as s } from "../../db/client.ts";
import { desc } from "drizzle-orm";
import { fmtUSD } from "../../lib/data.ts";

export const dynamic = "force-dynamic";

interface AuditEvent {
  ts: number; // sim "time" — we use day*4 + segment as a sortable index
  day: number;
  segment: string;
  kind: "proposal_created" | "proposal_approved" | "proposal_rejected" | "po_placed" | "email_sent" | "day_closed";
  shopId: number;
  shopName: string;
  summary: string;
  href: string;
  detail?: string;
}

function segOrd(seg: string) {
  return ["morning", "midday", "evening", "night"].indexOf(seg);
}

function gatherEvents(): AuditEvent[] {
  const events: AuditEvent[] = [];
  const shops = new Map(db.select().from(s.shop).all().map((sh) => [sh.id, sh]));

  // Agent proposals — created event
  for (const p of db.select().from(s.agentProposal).all()) {
    const sh = shops.get(p.shopId)!;
    const summary = p.kind === "purchase_order"
      ? `${p.agentName} agent proposed a reorder`
      : `${p.agentName} agent proposed a price change`;
    events.push({
      ts: p.createdDay * 4 + segOrd(p.createdSegment),
      day: p.createdDay,
      segment: p.createdSegment,
      kind: "proposal_created",
      shopId: sh.id,
      shopName: sh.name,
      summary,
      href: `/objects/agent-proposal/${p.id}`,
      detail: p.rationale,
    });
    // Decision events (approved/rejected) — we don't store ts, use createdDay+1 as approximation
    if (p.status === "approved" || p.status === "rejected" || p.status === "auto_executed") {
      events.push({
        ts: p.createdDay * 4 + segOrd(p.createdSegment) + 0.5,
        day: p.createdDay,
        segment: p.createdSegment,
        kind: p.status === "rejected" ? "proposal_rejected" : "proposal_approved",
        shopId: sh.id,
        shopName: sh.name,
        summary: `Proposal #${p.id} ${p.status === "rejected" ? "rejected" : "approved"}`,
        href: `/objects/agent-proposal/${p.id}`,
      });
    }
  }

  // Purchase orders placed
  for (const po of db.select().from(s.purchaseOrder).all()) {
    const sh = shops.get(po.shopId)!;
    const ven = db.select().from(s.vendor).where((s.vendor.id as any).$eq?.(po.vendorId) ?? undefined).get?.();
    const ing = db.select().from(s.ingredient).all().find((i) => i.id === po.ingredientId);
    const venRow = db.select().from(s.vendor).all().find((v) => v.id === po.vendorId);
    events.push({
      ts: po.placedDay * 4 + 0.7,
      day: po.placedDay,
      segment: "—",
      kind: "po_placed",
      shopId: sh.id,
      shopName: sh.name,
      summary: `PO #${po.id} placed → ${venRow?.name ?? "?"}`,
      href: `/objects/purchase-order/${po.id}`,
      detail: `${po.qty.toLocaleString()} ${ing?.unit ?? ""} ${ing?.name ?? "?"} · ${fmtUSD(po.totalCents)}`,
    });
  }

  // Emails
  for (const e of db.select().from(s.email).all()) {
    const t = db.select().from(s.emailThread).all().find((t) => t.id === e.threadId);
    const sh = t ? shops.get(t.shopId) : null;
    if (!sh) continue;
    events.push({
      ts: e.sentDay * 4 + segOrd(e.sentSegment) + 0.8,
      day: e.sentDay,
      segment: e.sentSegment,
      kind: "email_sent",
      shopId: sh.id,
      shopName: sh.name,
      summary: `Email sent → ${e.toAddr}`,
      href: `/objects/email/${e.id}`,
      detail: t?.subject,
    });
  }

  // Daily snapshots — day-close events
  for (const ds of db.select().from(s.dailySnapshot).all()) {
    const sh = shops.get(ds.shopId)!;
    const sign = ds.netCents >= 0 ? "+" : "";
    events.push({
      ts: ds.day * 4 + 3.9,
      day: ds.day,
      segment: "night",
      kind: "day_closed",
      shopId: sh.id,
      shopName: sh.name,
      summary: `Day ${ds.day} closed`,
      href: `/team/${sh.id}/performance`,
      detail: `Net ${sign}${fmtUSD(ds.netCents)} · fulfillment ${Math.round(ds.fulfillmentRate * 100)}% · cash ${fmtUSD(ds.cashCents)}`,
    });
  }

  return events.sort((a, b) => b.ts - a.ts).slice(0, 200);
}

const KIND_META: Record<AuditEvent["kind"], { icon: string; label: string; pill: string }> = {
  proposal_created:  { icon: "🤖", label: "proposal",         pill: "pill-slate" },
  proposal_approved: { icon: "✓", label: "approved",          pill: "pill-green" },
  proposal_rejected: { icon: "✕", label: "rejected",          pill: "pill-red" },
  po_placed:         { icon: "🧾", label: "PO placed",        pill: "pill-amber" },
  email_sent:        { icon: "✉️", label: "email sent",       pill: "pill-slate" },
  day_closed:        { icon: "🌙", label: "day closed",       pill: "pill-slate" },
};

export default function Audit() {
  const events = gatherEvents();

  return (
    <div className="px-6 py-6">
      <div className="mb-5">
        <h1 className="font-serif text-2xl text-coffee-900">Action history</h1>
        <p className="text-sm text-slate-500">Chronological audit log of every agent proposal, approval, purchase order, vendor email, and day-close across all shops. Newest first.</p>
      </div>

      {events.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-md px-4 py-12 text-center text-slate-500">
          No activity yet. Click <strong>Tick</strong> on the leaderboard to start.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
          {events.map((e, i) => {
            const meta = KIND_META[e.kind];
            return (
              <Link key={i} href={e.href} className="block px-4 py-3 hover:bg-slate-50">
                <div className="flex items-baseline gap-3 text-[13px]">
                  <span className="text-base">{meta.icon}</span>
                  <span className={`pill ${meta.pill} w-24 justify-center`}>{meta.label}</span>
                  <span className="text-slate-700">{e.summary}</span>
                  {e.detail && <span className="text-slate-500 text-[12px] truncate">— {e.detail}</span>}
                  <span className="ml-auto text-[11px] text-slate-500 shrink-0 font-mono">
                    {e.shopName} · D{e.day}{e.segment !== "—" ? ` ${e.segment}` : ""}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
