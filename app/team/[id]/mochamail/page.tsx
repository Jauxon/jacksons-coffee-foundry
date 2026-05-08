import { notFound } from "next/navigation";
import { getShop, getEmailThreads, getEmailThread, fmtUSD } from "../../../../lib/data.ts";

export const dynamic = "force-dynamic";

export default async function TeamMochaMail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ thread?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const shopId = Number(id);
  const shop = getShop(shopId);
  if (!shop) notFound();
  const threads = getEmailThreads(shopId);
  const selectedId = sp.thread ? Number(sp.thread) : threads[0]?.threadId ?? null;
  const open = selectedId ? getEmailThread(selectedId) : null;
  // Guard: if the user crafted a thread URL for a different team, ignore it.
  const safeOpen = open && open.thread.shopId === shopId ? open : null;

  return (
    <div className="px-6 py-6">
      <div className="grid grid-cols-12 bg-white border border-slate-200 rounded-md overflow-hidden min-h-[600px]">
        <aside className="col-span-4 border-r border-slate-200 bg-slate-50/50">
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="flex items-center gap-2 text-slate-600">
              <span>📥</span><span className="font-medium text-slate-800">Threads</span>
              <span className="ml-auto text-[11px] text-slate-500">{threads.length}</span>
            </div>
          </div>
          <ul>
            {threads.length === 0 && <li className="px-4 py-6 text-sm text-slate-500 italic">Inbox empty — fire the agent and approve a proposal.</li>}
            {threads.map((t) => {
              const active = t.threadId === selectedId;
              return (
                <li key={t.threadId} className={`border-b border-slate-100 ${active ? "bg-cream-100" : "hover:bg-slate-50"}`}>
                  <a href={`/team/${shopId}/mochamail?thread=${t.threadId}`} className="block px-4 py-3">
                    <div className="flex items-baseline justify-between">
                      <div className="text-[13px] font-medium text-slate-800 truncate">{t.subject}</div>
                      <div className="text-[10px] text-slate-500 ml-2 shrink-0">{t.lastSentSegment} · D{t.lastSentDay}</div>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{t.vendorName ?? "—"} · {t.messageCount} msg</div>
                    <div className="text-[12px] text-slate-600 mt-1 line-clamp-2">{t.lastMessage.split("\n")[2] ?? t.lastMessage.slice(0, 80)}</div>
                  </a>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="col-span-8 p-6">
          {!safeOpen && <div className="text-sm text-slate-500 italic">Select a thread.</div>}
          {safeOpen && (
            <article>
              <h2 className="font-serif text-xl text-coffee-900 mb-1">{safeOpen.thread.subject}</h2>
              <div className="text-[12px] text-slate-500 mb-5">
                {safeOpen.thread.vendorName} · {safeOpen.messages.length} message{safeOpen.messages.length === 1 ? "" : "s"}
              </div>
              <div className="space-y-5">
                {safeOpen.messages.map((m) => (
                  <div key={m.id} className="border border-slate-200 rounded-md overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="text-[12px]">
                        <span className="text-slate-700"><span className="text-slate-500">From:</span> {m.fromAddr}</span>
                        <span className="ml-3 text-slate-700"><span className="text-slate-500">To:</span> {m.toAddr}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">Day {m.sentDay} · {m.sentSegment}</div>
                    </div>
                    <div className="px-4 py-3">
                      <pre className="whitespace-pre-wrap font-sans text-[13px] text-slate-800 leading-relaxed">{m.body}</pre>
                    </div>
                    {m.attachedPurchaseOrderId && (
                      <div className="border-t border-slate-200 bg-cream-100/50 px-4 py-3 flex items-center gap-3 text-[12px]">
                        <span className="grid place-items-center h-7 w-7 rounded bg-cream-200 text-coffee-700">📎</span>
                        <div>
                          <div className="font-mono text-slate-700">PURCHASE Order #{m.attachedPurchaseOrderId}</div>
                          <div className="text-slate-600">{m.attachedPurchaseOrderQty?.toLocaleString()} {m.attachedPurchaseOrderUnit} {m.attachedPurchaseOrderIngredient}</div>
                        </div>
                        <div className="ml-auto text-right">
                          <div className="text-[11px] text-slate-500">Total</div>
                          <div className="font-semibold tabular-nums">{m.attachedPurchaseOrderTotal != null ? fmtUSD(m.attachedPurchaseOrderTotal) : "—"}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
