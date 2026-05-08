"use client";

import { useState, useTransition } from "react";
import { runAgent, runTick, resetSim } from "../app/actions.ts";

// Top-of-page action bar for advancing the sim and firing the agent.
// shopId is optional — when present, "Run agent" runs only for that team.
// On the homepage we fire "Run all AI agents" to advance every non-human team.
export function SimControls({ day, segment, shopId, isHuman, llmRemaining }: { day: number; segment: string; shopId?: number; isHuman?: boolean; llmRemaining?: number }) {
  const [pending, startTransition] = useTransition();
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (label: string, fn: () => Promise<unknown>) => {
    setError(null);
    setActivity(label);
    startTransition(async () => {
      const r = (await fn()) as { ok: boolean; error?: string } | undefined;
      if (r && r.ok === false && r.error) setError(r.error);
      setActivity(null);
    });
  };

  const llmDisabled = llmRemaining != null && llmRemaining <= 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-slate-500">Sim time:</span>
        <span className="font-mono px-2 py-1 rounded bg-slate-100 text-slate-800">Day {day} · {segment}</span>
        <Btn label="Tick" pending={pending} onClick={() => run("Advancing one segment…", () => runTick(1))} />
        <Btn label="Tick day" pending={pending} onClick={() => run("Advancing 4 segments…", () => runTick(4))} />
        <Btn label="Tick week" pending={pending} onClick={() => run("Advancing 28 segments…", () => runTick(28))} />
        {shopId && !isHuman && (
          <Btn
            label="Run agent (LLM)"
            pending={pending}
            primary
            disabled={llmDisabled}
            title={llmDisabled ? "Demo LLM budget reached for this instance" : undefined}
            onClick={() => run("Calling Claude…", () => runAgent(shopId))}
          />
        )}
        {shopId && !isHuman && (
          <Btn label="Heuristic" pending={pending} onClick={() => run("Running heuristic…", () => runAgent(shopId, { useHeuristic: true }))} />
        )}
        <Btn label="Reset to Day 1" pending={pending} variant="danger" onClick={() => {
          if (typeof window !== "undefined" && !window.confirm("Reset the simulation to Day 1? Wipes all orders, reviews, POs, batches, emails, and proposals (keeps your menu / staff / strategies).")) return;
          run("Resetting…", () => resetSim());
        }} />
        {activity && <span className="text-coffee-600 text-[11px]">{activity}</span>}
      </div>
      {error && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 max-w-xl">
          {error}
        </div>
      )}
    </div>
  );
}

function Btn({ label, pending, onClick, primary, variant, disabled, title }: { label: string; pending: boolean; onClick: () => void; primary?: boolean; variant?: "danger"; disabled?: boolean; title?: string }) {
  const base = "px-3 py-1 rounded border text-[12px] disabled:opacity-50 disabled:cursor-not-allowed transition";
  const cls = variant === "danger"
    ? "bg-white text-rose-700 border-rose-300 hover:bg-rose-50"
    : primary
    ? "bg-coffee-600 text-white border-coffee-600 hover:bg-coffee-800"
    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50";
  return (
    <button className={`${base} ${cls}`} onClick={onClick} disabled={pending || disabled} title={title}>{label}</button>
  );
}
