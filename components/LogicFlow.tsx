// Static visual representation of a Logic Function's decision flow.
// Mimics the look of the Foundry editor screenshot: nested blocks with
// connector lines, ontology references on the right.

import type { ReactNode } from "react";

export interface FlowStep {
  type: "input" | "search" | "filter" | "decision" | "transform" | "output";
  label: string;
  detail?: string;
  ontology?: string; // referenced ontology object/field
  nested?: FlowStep[];
  branchYes?: FlowStep[];
  branchNo?: FlowStep[];
}

const TYPE_META: Record<FlowStep["type"], { color: string; bg: string; icon: string; pillClass: string }> = {
  input:     { color: "border-blue-300",    bg: "bg-blue-50",    icon: "↳", pillClass: "pill-slate" },
  search:    { color: "border-violet-300",  bg: "bg-violet-50",  icon: "⌕", pillClass: "pill-slate" },
  filter:    { color: "border-amber-300",   bg: "bg-amber-50",   icon: "⛗", pillClass: "pill-amber" },
  decision:  { color: "border-rose-300",    bg: "bg-rose-50",    icon: "◇", pillClass: "pill-red" },
  transform: { color: "border-slate-300",   bg: "bg-slate-50",   icon: "ƒ", pillClass: "pill-slate" },
  output:    { color: "border-emerald-300", bg: "bg-emerald-50", icon: "→", pillClass: "pill-green" },
};

export function LogicFlow({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <FlowNode key={i} step={s} />
      ))}
    </div>
  );
}

function FlowNode({ step }: { step: FlowStep }) {
  const meta = TYPE_META[step.type];
  return (
    <div>
      <div className={`border ${meta.color} ${meta.bg} rounded-md px-4 py-3`}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-slate-500 font-mono text-[14px] w-5 inline-block text-center">{meta.icon}</span>
          <span className={`pill ${meta.pillClass} uppercase text-[10px]`}>{step.type}</span>
          <h3 className="font-medium text-slate-900 text-[13px]">{step.label}</h3>
          {step.ontology && (
            <span className="ml-auto font-mono text-[11px] text-slate-500">{step.ontology}</span>
          )}
        </div>
        {step.detail && <p className="text-[12px] text-slate-700 leading-relaxed pl-7 whitespace-pre-line">{step.detail}</p>}
        {step.nested && step.nested.length > 0 && (
          <div className="mt-3 ml-4 pl-4 border-l-2 border-slate-300 space-y-2">
            {step.nested.map((c, i) => <FlowNode key={i} step={c} />)}
          </div>
        )}
        {step.branchYes && step.branchYes.length > 0 && (
          <div className="mt-3 space-y-2 pl-7">
            <Branch label="if true" steps={step.branchYes} className="border-emerald-300 bg-emerald-50/40" />
            <Branch label="else" steps={step.branchNo ?? []} className="border-rose-300 bg-rose-50/40" />
          </div>
        )}
      </div>
      {/* connector line */}
      <div className="h-3 ml-7 border-l-2 border-slate-200" />
    </div>
  );
}

function Branch({ label, steps, className }: { label: string; steps: FlowStep[]; className: string }) {
  return (
    <div className={`border ${className} rounded p-2`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{label}</div>
      <div className="space-y-2">
        {steps.length === 0 ? (
          <div className="text-[12px] text-slate-400 italic">(skip / continue)</div>
        ) : steps.map((s, i) => <FlowNode key={i} step={s} />)}
      </div>
    </div>
  );
}
