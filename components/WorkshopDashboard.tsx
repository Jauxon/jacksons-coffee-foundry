"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { WorkshopData } from "../lib/workshop-aggregations.ts";
import { SortableTable } from "./SortableTable.tsx";

const fmtUSD = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const fmtUSD0 = (cents: number) => `$${(cents / 100).toFixed(0)}`;

type Metric = "net" | "revenue" | "cash" | "fulfillmentRate";

const METRIC_META: Record<Metric, { label: string; format: (n: number) => string; pickDay: (p: any) => number }> = {
  net:             { label: "Daily net",       format: fmtUSD0, pickDay: (p) => p.netCents },
  revenue:         { label: "Daily revenue",   format: fmtUSD0, pickDay: (p) => p.revenueCents },
  cash:            { label: "Cash close",      format: fmtUSD0, pickDay: (p) => p.cashCents },
  fulfillmentRate: { label: "Fulfillment %",   format: (n) => `${(n * 100).toFixed(0)}%`, pickDay: (p) => p.fulfillmentRate },
};

const OUTCOME_COLORS: Record<string, string> = {
  fulfilled: "#059669",
  stockout: "#DC2626",
  balkedPrice: "#D97706",
  balkedWait: "#0EA5E9",
  productOff: "#94A3B8",
};

export function WorkshopDashboard({ data }: { data: WorkshopData }) {
  const [enabledTeams, setEnabledTeams] = useState<Set<number>>(new Set(data.teams.map((t) => t.shopId)));
  const [metric, setMetric] = useState<Metric>("net");
  const [hover, setHover] = useState<{ x: number; y: number; lines: { color: string; label: string; value: string }[] } | null>(null);

  const visibleTeams = data.teams.filter((t) => enabledTeams.has(t.shopId));
  const visibleSeries = data.series.filter((s) => enabledTeams.has(s.shopId));

  const toggleTeam = (id: number) => {
    setEnabledTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (enabledTeams.size === data.teams.length) setEnabledTeams(new Set());
    else setEnabledTeams(new Set(data.teams.map((t) => t.shopId)));
  };

  return (
    <div>
      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-md mb-4 px-4 py-3">
        <div className="flex items-center flex-wrap gap-3 text-[12px]">
          <div className="text-slate-600 font-medium">Teams:</div>
          {data.teams.map((t) => {
            const on = enabledTeams.has(t.shopId);
            return (
              <button
                key={t.shopId}
                onClick={() => toggleTeam(t.shopId)}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border transition ${on ? "bg-white border-slate-300 text-slate-800" : "bg-slate-100 border-slate-200 text-slate-400"}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: on ? t.colorHex : "#CBD5E1" }} />
                <span>{t.name}</span>
              </button>
            );
          })}
          <button onClick={toggleAll} className="text-[11px] text-coffee-700 hover:underline ml-2">
            {enabledTeams.size === data.teams.length ? "Hide all" : "Show all"}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <div className="text-slate-600 font-medium">Metric:</div>
            {(Object.keys(METRIC_META) as Metric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-2 py-1 rounded border text-[12px] ${metric === m ? "bg-coffee-600 text-white border-coffee-600" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}
              >
                {METRIC_META[m].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 items-start">
        {/* Comparison bar charts — three KPIs */}
        <Card title="Cash on hand" subtitle="Click a bar to open that team's page. Bankrupt teams clamp at $0.">
          <Bars
            rows={visibleTeams
              .slice()
              .sort((a, b) => b.cashCents - a.cashCents)
              .map((t) => ({
                id: t.shopId,
                label: t.isBankrupt ? `${t.name} · BANKRUPT` : t.name,
                value: t.displayCashCents,
                color: t.isBankrupt ? "#94A3B8" : t.colorHex,
                formatted: t.isBankrupt ? "BANKRUPT" : fmtUSD(t.displayCashCents),
                href: `/team/${t.shopId}`,
              }))}
          />
        </Card>
        <Card title="Cumulative net" subtitle="Revenue − COGS − wages, lifetime.">
          <Bars
            rows={visibleTeams
              .slice()
              .sort((a, b) => b.totalNetCents - a.totalNetCents)
              .map((t) => ({
                id: t.shopId, label: t.name, value: t.totalNetCents,
                color: t.totalNetCents >= 0 ? "#059669" : "#DC2626",
                formatted: `${t.totalNetCents >= 0 ? "+" : ""}${fmtUSD(t.totalNetCents)}`,
                href: `/team/${t.shopId}`,
              }))}
          />
        </Card>
        <Card title="Fulfillment rate" subtitle="Successfully served / total arrivals.">
          <Bars
            rows={visibleTeams
              .slice()
              .sort((a, b) => b.fulfillmentRate - a.fulfillmentRate)
              .map((t) => ({
                id: t.shopId, label: t.name, value: t.fulfillmentRate * 100, color: t.colorHex,
                formatted: `${(t.fulfillmentRate * 100).toFixed(0)}%`,
                href: `/team/${t.shopId}`,
              }))}
            domainMax={100}
          />
        </Card>

        {/* Multi-line time series — switchable metric */}
        <Card span={3} title={`${METRIC_META[metric].label} by day`} subtitle="Hover any point for exact values across visible teams.">
          <MultiLineChart
            days={data.days}
            series={visibleSeries.map((s) => ({
              shopId: s.shopId,
              label: s.name,
              color: s.colorHex,
              values: s.byDay.map(METRIC_META[metric].pickDay),
            }))}
            formatValue={METRIC_META[metric].format}
            onHover={setHover}
            hover={hover}
          />
        </Card>

        {/* Outcomes stacked bar */}
        <Card span={2} title="Customer outcomes" subtitle="Where every arrival ended up. Hover any segment.">
          <StackedRows
            rows={data.outcomes
              .filter((o) => enabledTeams.has(o.shopId))
              .map((o) => {
                const team = data.teams.find((t) => t.shopId === o.shopId)!;
                return {
                  label: team.name,
                  segments: [
                    { label: "fulfilled",        value: o.fulfilled,    color: OUTCOME_COLORS.fulfilled },
                    { label: "stockout",         value: o.stockout,     color: OUTCOME_COLORS.stockout },
                    { label: "balked on price",  value: o.balkedPrice,  color: OUTCOME_COLORS.balkedPrice },
                    { label: "balked on wait",   value: o.balkedWait,   color: OUTCOME_COLORS.balkedWait },
                    { label: "product off",      value: o.productOff,   color: OUTCOME_COLORS.productOff },
                  ],
                };
              })}
          />
        </Card>

        {/* Vendor spend donut — click to filter */}
        <Card title="Vendor spend (delivered POs)" subtitle="Total across visible teams.">
          <DonutChart
            data={data.vendorSpend.map((v, i) => ({
              label: v.vendorName,
              value: v.byTeam.filter((t) => enabledTeams.has(t.shopId)).reduce((a, t) => a + t.totalCents, 0),
              color: PALETTE[i % PALETTE.length],
            }))}
          />
        </Card>

        {/* Product mix — bar chart of fulfilled drinks */}
        <Card title="Product mix" subtitle="Fulfilled drinks per product, visible teams.">
          <Bars
            rows={data.productMix.map((p, i) => {
              const count = p.byTeam.filter((t) => enabledTeams.has(t.shopId)).reduce((a, t) => a + t.count, 0);
              return { id: i, label: p.productName, value: count, color: PALETTE[i % PALETTE.length], formatted: count.toLocaleString() };
            })}
          />
        </Card>

        {/* Stockout heatmap */}
        <Card title="Stockout pressure" subtitle="Stockouts attributed to the limiting ingredient. Hover any cell.">
          <Heatmap
            ingredients={data.stockoutHeatmap.ingredients}
            rows={data.stockoutHeatmap.rows
              .filter((r) => enabledTeams.has(r.shopId))
              .map((r) => ({ name: data.teams.find((t) => t.shopId === r.shopId)!.name, counts: r.counts }))}
          />
        </Card>

        {/* Storage utilization */}
        <Card title="Storage utilization" subtitle="Inventory volume vs. shop capacity. Tight teams have less headroom for reorders.">
          <Bars
            rows={visibleTeams.map((t) => {
              const pct = (t.storageUsedUnits / Math.max(t.storageCapacityUnits, 1)) * 100;
              const color = pct > 90 ? "#DC2626" : pct > 75 ? "#D97706" : "#059669";
              return {
                id: t.shopId,
                label: t.name,
                value: pct,
                color,
                formatted: `${Math.round(t.storageUsedUnits).toLocaleString()} / ${t.storageCapacityUnits.toLocaleString()}`,
              };
            })}
            domainMax={100}
          />
        </Card>

        {/* Scorecard */}
        <Card span={3} title="Team scorecard" subtitle="Click any column to sort. Click a row to open the team page.">
          <SortableTable
            columns={[
              { key: "name", label: "Team", sortable: true },
              { key: "strategy", label: "Strategy", sortable: true, className: "text-slate-600" },
              { key: "cash", label: "Cash", align: "right", sortable: true, className: "tabular-nums" },
              { key: "rev", label: "Lifetime revenue", align: "right", sortable: true, className: "tabular-nums text-slate-700" },
              { key: "net", label: "Lifetime net", align: "right", sortable: true, className: "tabular-nums" },
              { key: "ful", label: "Fulfilled", align: "right", sortable: true, className: "tabular-nums text-emerald-700" },
              { key: "fail", label: "Failed", align: "right", sortable: true, className: "tabular-nums text-rose-700" },
              { key: "fulRate", label: "Fulfillment", align: "right", sortable: true, className: "tabular-nums" },
              { key: "rating", label: "Avg ★", align: "right", sortable: true, className: "tabular-nums" },
            ]}
            defaultSortKey="net"
            defaultSortDir="desc"
            rows={visibleTeams.map((t) => {
              const netCls = t.totalNetCents >= 0 ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold";
              return {
                id: t.shopId,
                href: `/team/${t.shopId}`,
                sortValues: {
                  name: t.name,
                  strategy: t.agentStrategy,
                  cash: t.cashCents,
                  rev: t.totalRevenueCents,
                  net: t.totalNetCents,
                  ful: t.fulfilled,
                  fail: t.failed,
                  fulRate: t.fulfillmentRate,
                  rating: t.avgRating,
                },
                cells: {
                  name: (
                    <span>
                      <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ backgroundColor: t.colorHex }} />
                      {t.name}
                      {t.isBankrupt && <span className="ml-2 text-[10px] uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-300 px-1.5 py-0.5 rounded font-semibold">Bankrupt</span>}
                    </span>
                  ),
                  strategy: <span className="capitalize">{t.agentStrategy.replace("_", " ")}</span>,
                  cash: t.isBankrupt ? <span className="text-rose-700">{fmtUSD(t.displayCashCents)}</span> : fmtUSD(t.displayCashCents),
                  rev: fmtUSD(t.totalRevenueCents),
                  net: <span className={netCls}>{t.totalNetCents >= 0 ? "+" : ""}{fmtUSD(t.totalNetCents)}</span>,
                  ful: t.fulfilled.toLocaleString(),
                  fail: t.failed.toLocaleString(),
                  fulRate: `${(t.fulfillmentRate * 100).toFixed(0)}%`,
                  rating: t.avgRating == null ? "—" : t.avgRating.toFixed(2),
                },
              };
            })}
          />
        </Card>
      </div>
    </div>
  );
}

const PALETTE = ["#8B6F47", "#DC2626", "#2563EB", "#D97706", "#059669", "#7C3AED", "#0EA5E9", "#A78BFA", "#F97316", "#14B8A6"];

function Card({ title, subtitle, children, span = 1 }: { title: string; subtitle?: string; children: React.ReactNode; span?: 1 | 2 | 3 }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-md ${span === 2 ? "col-span-2" : span === 3 ? "col-span-3" : ""}`}>
      <div className="px-4 py-3 border-b border-slate-200">
        <h3 className="font-medium text-slate-800 text-[14px]">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Bars — horizontal bar chart in HTML (no SVG stretch). Click-through.
// ----------------------------------------------------------------------------

function Bars({
  rows, domainMax,
}: {
  rows: { id: number; label: string; value: number; color: string; formatted: string; href?: string }[];
  domainMax?: number;
}) {
  if (rows.length === 0) return <div className="text-[12px] text-slate-500 italic px-4 py-8">No data.</div>;
  const max = domainMax ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const pct = (Math.abs(r.value) / max) * 100;
        const inner = (
          <>
            <div className="text-slate-700 text-right truncate text-[13px]">{r.label}</div>
            <div className="h-5 bg-slate-100 rounded overflow-hidden" title={`${r.label}: ${r.formatted}`}>
              <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: r.color }} />
            </div>
            <div className="text-slate-800 tabular-nums font-mono text-right text-[13px]">{r.formatted}</div>
          </>
        );
        const className = "grid grid-cols-[150px_1fr_90px] items-center gap-3 px-2 py-0.5 rounded";
        return r.href ? (
          <a key={r.id} href={r.href} className={`${className} hover:bg-slate-50 cursor-pointer`}>{inner}</a>
        ) : (
          <div key={r.id} className={className}>{inner}</div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Multi-line chart with hover crosshair + tooltip.
// ----------------------------------------------------------------------------

function MultiLineChart({
  days, series, formatValue, onHover, hover,
}: {
  days: number[];
  series: { shopId: number; label: string; color: string; values: number[] }[];
  formatValue: (n: number) => string;
  onHover: (h: { x: number; y: number; lines: { color: string; label: string; value: string }[] } | null) => void;
  hover: { x: number; y: number; lines: { color: string; label: string; value: string }[] } | null;
}) {
  if (series.length === 0 || days.length === 0) {
    return <div className="text-[12px] text-slate-500 italic px-4 py-8">No data — tick the sim to generate snapshots.</div>;
  }
  const W = 800, H = 280;
  const padL = 56, padR = 110, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 1);
  const range = max - min || 1;
  const stepX = days.length > 1 ? innerW / (days.length - 1) : 0;
  const yScale = (v: number) => padT + innerH - ((v - min) / range) * innerH;
  const yTicks = Array.from({ length: 5 }, (_, i) => min + (range * i) / 4);

  const xToDayIndex = (x: number) => {
    const local = x - padL;
    return Math.max(0, Math.min(days.length - 1, Math.round(local / stepX)));
  };

  return (
    <div className="relative" style={{ aspectRatio: `${W} / ${H}`, width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: "block" }}
        onMouseMove={(ev) => {
          const rect = (ev.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ev.clientX - rect.left;
          const py = ev.clientY - rect.top;
          // Convert client px to viewBox coords
          const vx = (px / rect.width) * W;
          const vy = (py / rect.height) * H;
          if (vx < padL || vx > W - padR) { onHover(null); return; }
          const idx = xToDayIndex(vx);
          onHover({
            x: vx,
            y: vy,
            lines: series.map((s) => ({
              color: s.color,
              label: s.label,
              value: formatValue(s.values[idx] ?? 0),
            })),
          });
        }}
        onMouseLeave={() => onHover(null)}
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={yScale(t)} x2={W - padR} y2={yScale(t)} stroke="#E2E8F0" strokeDasharray="2 3" />
            <text x={padL - 8} y={yScale(t) + 3} textAnchor="end" fontSize="10" fill="#94A3B8">{formatValue(t)}</text>
          </g>
        ))}
        {days.map((d, i) => (
          <text key={i} x={padL + i * stepX} y={H - padB + 14} textAnchor="middle" fontSize="10" fill="#64748B">D{d}</text>
        ))}

        {/* Hover crosshair */}
        {hover && (
          <line
            x1={padL + xToDayIndex(hover.x) * stepX}
            y1={padT}
            x2={padL + xToDayIndex(hover.x) * stepX}
            y2={H - padB}
            stroke="#94A3B8" strokeDasharray="2 3"
          />
        )}

        {series.map((s) => {
          const points = s.values.map((v, i) => `${padL + i * stepX},${yScale(v)}`).join(" ");
          return (
            <g key={s.shopId}>
              <polyline points={points} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={padL + i * stepX} cy={yScale(v)} r="2.5" fill={s.color} />
              ))}
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${W - padR + 8}, ${padT})`}>
          {series.map((s, i) => (
            <g key={s.shopId} transform={`translate(0, ${i * 16})`}>
              <line x1="0" y1="6" x2="14" y2="6" stroke={s.color} strokeWidth="2" />
              <text x="20" y="10" fontSize="10" fill="#1F2937">{s.label}</text>
            </g>
          ))}
        </g>
      </svg>

      {/* Tooltip */}
      {hover && (
        <div
          className="absolute pointer-events-none bg-white border border-slate-200 rounded shadow px-3 py-2 text-[11px]"
          style={{
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: "translate(12px, -50%)",
            minWidth: 140,
          }}
        >
          <div className="text-slate-500 mb-1">Day {days[Math.max(0, Math.min(days.length - 1, Math.round((hover.x - 56) / (((800 - 56 - 110)) / Math.max(1, days.length - 1)))))]}</div>
          {hover.lines.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5">
              <span className="h-1.5 w-3 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-slate-700 flex-1">{l.label}</span>
              <span className="font-mono tabular-nums text-slate-800">{l.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Stacked horizontal bars (outcomes).
// ----------------------------------------------------------------------------

function StackedRows({
  rows,
}: {
  rows: { label: string; segments: { label: string; value: number; color: string }[] }[];
}) {
  if (rows.length === 0) return <div className="text-[12px] text-slate-500 italic px-4 py-8">No data.</div>;
  const totalAll = rows.reduce((a, r) => a + r.segments.reduce((b, s) => b + s.value, 0), 0);
  if (totalAll === 0) {
    return <div className="text-[12px] text-slate-500 italic px-4 py-6 text-center">No customer arrivals yet — click <strong>Tick day</strong> in the top bar to populate.</div>;
  }
  const totals = rows.map((r) => r.segments.reduce((a, s) => a + s.value, 0));
  const max = Math.max(...totals, 1);

  const legend = new Map<string, string>();
  rows.forEach((r) => r.segments.forEach((s) => legend.set(s.label, s.color)));

  return (
    <div>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const total = totals[i];
          const widthPct = (total / max) * 100;
          return (
            <div key={i} className="grid grid-cols-[180px_1fr_70px] items-center gap-3 text-[13px]">
              <div className="text-slate-700 text-right truncate">{r.label}</div>
              <div className="h-6 bg-slate-100 rounded overflow-hidden">
                <div className="h-full flex" style={{ width: `${widthPct}%` }}>
                  {r.segments.map((s, j) => {
                    const segPct = total === 0 ? 0 : (s.value / total) * 100;
                    if (segPct === 0) return null;
                    return (
                      <div
                        key={j}
                        style={{ width: `${segPct}%`, backgroundColor: s.color }}
                        title={`${s.label}: ${s.value.toLocaleString()} (${segPct.toFixed(0)}%)`}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="text-slate-800 tabular-nums font-mono text-right">{total.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] pl-[183px]">
        {Array.from(legend.entries()).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
            <span className="text-slate-700">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Donut chart with hover.
// ----------------------------------------------------------------------------

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((a, d) => a + d.value, 0);
  if (total === 0) return <div className="text-[12px] text-slate-500 italic px-4 py-8">No spend yet.</div>;
  const size = 180;
  const r = size / 2;
  const inner = r * 0.55;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`-${r} -${r} ${size} ${size}`}>
        {filtered.map((d, i) => {
          const startAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
          acc += d.value;
          const endAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
          const x1 = Math.cos(startAngle) * r;
          const y1 = Math.sin(startAngle) * r;
          const x2 = Math.cos(endAngle) * r;
          const y2 = Math.sin(endAngle) * r;
          const ix1 = Math.cos(endAngle) * inner;
          const iy1 = Math.sin(endAngle) * inner;
          const ix2 = Math.cos(startAngle) * inner;
          const iy2 = Math.sin(startAngle) * inner;
          const large = endAngle - startAngle > Math.PI ? 1 : 0;
          const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`;
          return (
            <path key={i} d={path} fill={d.color}>
              <title>{`${d.label}: ${fmtUSD(d.value)} (${((d.value / total) * 100).toFixed(0)}%)`}</title>
            </path>
          );
        })}
        <text textAnchor="middle" dy="4" fontSize="11" fill="#64748B">{fmtUSD(total)}</text>
      </svg>
      <ul className="text-[12px] space-y-1">
        {filtered.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-sm inline-block" style={{ backgroundColor: d.color }} />
            <span className="text-slate-700 flex-1 truncate">{d.label}</span>
            <span className="text-slate-500 font-mono tabular-nums">{((d.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Heatmap with native tooltips.
// ----------------------------------------------------------------------------

function Heatmap({ ingredients, rows }: { ingredients: string[]; rows: { name: string; counts: number[] }[] }) {
  if (ingredients.length === 0 || rows.length === 0) {
    return <div className="text-[12px] text-slate-500 italic px-4 py-8">No data.</div>;
  }
  const all = rows.flatMap((r) => r.counts);
  const total = all.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <div className="text-[12px] text-slate-500 italic px-4 py-6 text-center">No stockouts recorded yet — every team is fulfilling on inventory.</div>;
  }
  const max = Math.max(...all, 1);

  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] border-collapse">
        <thead>
          <tr>
            <th className="text-left text-slate-500 font-medium pr-3 py-1"></th>
            {rows.map((r) => (
              <th key={r.name} className="text-left text-slate-700 font-medium px-2 py-1">{r.name.split(" ")[0]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ingredients.map((ing, i) => (
            <tr key={ing}>
              <td className="text-right pr-3 text-slate-700 font-mono">{ing}</td>
              {rows.map((r) => {
                const v = r.counts[i] ?? 0;
                const intensity = v / max;
                const bg = `rgba(220, 38, 38, ${0.05 + intensity * 0.85})`;
                const tcolor = intensity > 0.4 ? "white" : "#1F2937";
                return (
                  <td key={r.name} className="text-center px-2 py-1 tabular-nums" style={{ backgroundColor: bg, color: tcolor, minWidth: 60 }}
                    title={`${r.name} · ${ing}: ${v.toLocaleString()} stockouts`}
                  >
                    {v > 0 ? v : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
