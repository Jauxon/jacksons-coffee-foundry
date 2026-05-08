"use client";

import { useState, useTransition } from "react";
import { toggleProductAvailability, updateProductPrice } from "../app/actions.ts";

export function PriceEditor({ productId, priceCents, isAvailable }: { productId: number; priceCents: number; isAvailable: boolean }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState((priceCents / 100).toFixed(2));

  return (
    <div className="flex items-center gap-1">
      <span className="text-slate-500 text-[12px]">$</span>
      <input
        type="number"
        step="0.05"
        min="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const cents = Math.round(Number(draft) * 100);
          if (Number.isFinite(cents) && cents !== priceCents) {
            startTransition(() => updateProductPrice(productId, cents));
          }
        }}
        className="w-20 px-2 py-1 border border-slate-300 rounded text-right tabular-nums text-[12px] focus:outline-none focus:ring-2 focus:ring-coffee-400"
      />
      <button
        onClick={() => startTransition(() => toggleProductAvailability(productId))}
        disabled={pending}
        className={`ml-2 text-[11px] px-2 py-1 rounded border ${isAvailable ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-slate-100 border-slate-200 text-slate-500"}`}
      >
        {isAvailable ? "On" : "Off"}
      </button>
    </div>
  );
}
