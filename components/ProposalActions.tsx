"use client";

import { useState, useTransition } from "react";
import { approveProposal, rejectProposal } from "../app/actions.ts";

export function ProposalActions({ proposalId, status }: { proposalId: number; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending") {
    const cls = status === "approved" ? "pill-green" : status === "rejected" ? "pill-red" : "pill-slate";
    return <span className={`pill ${cls} capitalize`}>{status.replace("_", " ")}</span>;
  }

  const handle = (fn: (id: number) => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn(proposalId);
      if (!r.ok) setError(r.error ?? "Unknown error");
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          disabled={pending}
          onClick={() => handle(approveProposal)}
          className="px-3 py-1 rounded bg-emerald-600 text-white text-[12px] font-medium hover:bg-emerald-700 disabled:opacity-50"
        >Approve</button>
        <button
          disabled={pending}
          onClick={() => handle(rejectProposal)}
          className="px-3 py-1 rounded border border-slate-300 text-slate-700 text-[12px] font-medium hover:bg-slate-50 disabled:opacity-50"
        >Reject</button>
      </div>
      {error && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 max-w-md text-right">
          {error}
        </div>
      )}
    </div>
  );
}
