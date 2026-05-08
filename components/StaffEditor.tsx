"use client";

import { useState, useTransition } from "react";
import { updateStaffCount } from "../app/actions.ts";

export function StaffEditor({ shopId, staffCount }: { shopId: number; staffCount: number }) {
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState(staffCount);
  const apply = (next: number) => {
    setCount(next);
    startTransition(() => updateStaffCount(shopId, next));
  };

  return (
    <div className="mt-1 flex items-center gap-2">
      <button
        onClick={() => apply(Math.max(0, count - 1))}
        disabled={pending || count === 0}
        className="h-7 w-7 rounded border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-40"
      >−</button>
      <div className="text-2xl font-semibold tabular-nums">{count}</div>
      <button
        onClick={() => apply(Math.min(10, count + 1))}
        disabled={pending || count === 10}
        className="h-7 w-7 rounded border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-40"
      >+</button>
      <span className="text-[11px] text-slate-500 ml-1">$72/seg ea</span>
    </div>
  );
}
