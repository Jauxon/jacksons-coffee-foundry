"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page error]", error);
  }, [error]);

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <div className="bg-white border border-rose-300 rounded-md px-5 py-4 shadow-sm">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-rose-700">⚠</span>
          <h1 className="font-serif text-lg text-coffee-900">Page hit a snag</h1>
        </div>
        <p className="text-[13px] text-slate-700 leading-relaxed mb-3">
          The render threw before this page could finish loading. The simulation state on the
          server is intact — you can retry, or use{" "}
          <strong>Reset to Day 1</strong> in the top bar if it persists.
        </p>
        {error.digest && (
          <div className="text-[11px] text-slate-500 font-mono mb-3">digest: {error.digest}</div>
        )}
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="px-3 py-1 rounded border border-coffee-600 bg-coffee-600 text-white hover:bg-coffee-800 text-[12px]"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-3 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-[12px]"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
