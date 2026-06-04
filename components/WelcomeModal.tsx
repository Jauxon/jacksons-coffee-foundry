"use client";

import { useEffect, useState } from "react";

// Bumped key so the reframed narrative shows once even to prior visitors.
const STORAGE_KEY = "operator-welcome-v2";

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setOpen(true);
    const handler = () => setOpen(true);
    window.addEventListener("operator:show-welcome", handler);
    return () => window.removeEventListener("operator:show-welcome", handler);
  }, []);

  if (!mounted || !open) return null;

  const close = () => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-8 border border-cream-300"
      >
        <div className="text-[11px] uppercase tracking-wider text-coffee-600 mb-1">CS 153 · One-Person Frontier Lab</div>
        <h2 className="font-serif text-2xl text-coffee-900 mb-4">Operator — an AI-native ops manager</h2>
        <div className="text-slate-700 leading-relaxed space-y-3 text-[14px]">
          <p>
            A small business runs on a stream of decisions a large company would hire a whole team for:
            what to restock, when, and from which vendor; how to price; how to staff. <strong>Operator</strong> is
            an AI agent that makes those calls and hands each one to a human for approval.
          </p>
          <p>
            This is the working prototype — five storefronts competing on Times Square, each under a different
            strategy. Four run autonomously; one is yours. For your shop the agent drafts every move (restock
            orders, price changes, even the vendor email) and you approve or reject.
          </p>
          <p>
            Built solo as a one-person frontier lab on the same Claude Opus model and agent patterns the
            frontier labs ship. The <strong>Inference</strong> tab opens the hood: the tokens, latency, cost,
            and prompt-caching behind every decision.
          </p>
          <p className="text-coffee-800 font-medium pt-1">Step in and run a shop.</p>
        </div>
        <div className="mt-6 flex items-center justify-end">
          <button
            onClick={close}
            className="px-4 py-2 rounded bg-coffee-600 text-white hover:bg-coffee-800 text-[13px] font-medium"
          >
            Step in →
          </button>
        </div>
      </div>
    </div>
  );
}
