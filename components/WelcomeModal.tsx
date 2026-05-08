"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "coffee-cup-welcome-v1";

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setOpen(true);
    // Re-open via the global trigger (the "About" link in the top chrome).
    const handler = () => setOpen(true);
    window.addEventListener("coffee-cup:show-welcome", handler);
    return () => window.removeEventListener("coffee-cup:show-welcome", handler);
  }, []);

  if (!mounted || !open) return null;

  const close = () => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-8 border border-cream-300"
      >
        <h2 className="font-serif text-2xl text-coffee-900 mb-4">Welcome to Jackson's Coffee Foundry</h2>
        <div className="text-slate-700 leading-relaxed space-y-3 text-[14px]">
          <p>
            A simulation inspired by The Palantir Coffee Cup. Simulates the UI of Palantir Foundry where the
            goal is to maximize profit for your coffee store located in Times Square.
          </p>
          <p>
            <strong>Forward Deployed Cafe</strong> is the user's team, and is competing against 4 agents with
            differing strategies: <em>Stockpiling</em>, <em>Lean Operations</em>, <em>Premium Price / Experience</em>, and{" "}
            <em>Volume Maximizing</em>.
          </p>
          <p>
            Forward Deployed Cafe has an agent that recommends changes in price, restock orders, etc. — but the
            control lies in your fingertips. The other tabs represent other features in the Foundry suite.
          </p>
          <p className="text-coffee-800 font-medium pt-1">Get to roasting.</p>
        </div>
        <div className="mt-6 flex items-center justify-end">
          <button
            onClick={close}
            className="px-4 py-2 rounded bg-coffee-600 text-white hover:bg-coffee-800 text-[13px] font-medium"
          >
            Get started →
          </button>
        </div>
      </div>
    </div>
  );
}
