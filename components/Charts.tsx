// Hand-rolled SVG charts. No external dep; consistent visual language with the
// rest of the app. All take a typed series + dimensions and render statically.

import type { ReactNode } from "react";

// ----------------------------------------------------------------------------
// Horizontal bar chart — comparing a metric across categories (e.g. teams).
// ----------------------------------------------------------------------------

export interface HBarRow {
  label: string;
  value: number;
  color?: string; // rendered bar fill
  formatted?: string; // displayed value (defaults to value.toString())
}

export function HBarChart({
  data, height = 220, valueLabel,
}: { data: HBarRow[]; height?: number; valueLabel?: string }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const rowH = (height - 16) / Math.max(data.length, 1);
  const labelW = 130;
  const valueW = 80;
  return (
    <svg width="100%" viewBox={`0 0 600 ${height}`} preserveAspectRatio="none" style={{ height }}>
      {data.map((d, i) => {
        const y = 8 + i * rowH;
        const barX = labelW;
        const trackW = 600 - labelW - valueW - 12;
        const barW = (Math.abs(d.value) / max) * trackW;
        const fill = d.color ?? "#8B6F47";
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize="12" fill="#475569">{d.label}</text>
            <rect x={barX} y={y + rowH * 0.2} width={trackW} height={rowH * 0.6} fill="#F1F5F9" rx="3" />
            <rect x={barX} y={y + rowH * 0.2} width={barW} height={rowH * 0.6} fill={fill} rx="3" />
            <text x={600 - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize="12" fill="#1F2937" fontFamily="ui-monospace, monospace">
              {d.formatted ?? d.value.toLocaleString()}
            </text>
          </g>
        );
      })}
      {valueLabel && (
        <text x={labelW + 4} y={height - 2} fontSize="10" fill="#94A3B8">{valueLabel}</text>
      )}
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Multi-series line chart — daily metric over time, multiple lines.
// ----------------------------------------------------------------------------

export interface LineSeries {
  label: string;
  color: string;
  values: number[]; // index = day
}

export function LineChart({
  series, days, height = 240, formatValue = (n) => n.toString(), title,
}: {
  series: LineSeries[]; days: number[]; height?: number;
  formatValue?: (n: number) => string; title?: string;
}) {
  if (series.length === 0 || days.length === 0) {
    return <div className="text-[12px] text-slate-500 italic px-4 py-8">No data yet.</div>;
  }
  const W = 600;
  const padL = 50, padR = 60, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;
  const allValues = series.flatMap((s) => s.values);
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 1);
  const range = max - min || 1;
  const stepX = days.length > 1 ? innerW / (days.length - 1) : 0;
  const yScale = (v: number) => padT + innerH - ((v - min) / range) * innerH;

  // Y-axis ticks (5 lines)
  const yTicks = Array.from({ length: 5 }, (_, i) => min + (range * i) / 4);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ height }}>
      {title && <text x={padL} y={padT - 2} fontSize="11" fill="#64748B">{title}</text>}
      {/* Grid */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={yScale(t)} x2={W - padR} y2={yScale(t)} stroke="#E2E8F0" strokeDasharray="2 2" />
          <text x={padL - 6} y={yScale(t) + 3} textAnchor="end" fontSize="10" fill="#94A3B8">{formatValue(t)}</text>
        </g>
      ))}
      {/* X-axis labels */}
      {days.map((d, i) => (
        <text key={i} x={padL + i * stepX} y={height - padB + 14} textAnchor="middle" fontSize="10" fill="#64748B">D{d}</text>
      ))}
      {/* Series */}
      {series.map((s) => {
        const points = s.values.map((v, i) => `${padL + i * stepX},${yScale(v)}`).join(" ");
        return (
          <g key={s.label}>
            <polyline points={points} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) => (
              <circle key={i} cx={padL + i * stepX} cy={yScale(v)} r="2.5" fill={s.color} />
            ))}
          </g>
        );
      })}
      {/* Legend */}
      <g transform={`translate(${W - padR + 6}, ${padT})`}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(0, ${i * 16})`}>
            <line x1="0" y1="6" x2="12" y2="6" stroke={s.color} strokeWidth="2" />
            <text x="16" y="10" fontSize="10" fill="#1F2937">{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Stacked bar chart — categories on x-axis, multiple sub-segments.
// ----------------------------------------------------------------------------

export interface StackedRow {
  label: string;
  segments: { label: string; value: number; color: string }[];
}

export function StackedBar({
  rows, height = 240, formatValue = (n) => n.toString(),
}: { rows: StackedRow[]; height?: number; formatValue?: (n: number) => string }) {
  if (rows.length === 0) return <div className="text-[12px] text-slate-500 italic px-4 py-8">No data yet.</div>;
  const W = 600;
  const padL = 110, padR = 16, padT = 8, padB = 28;
  const innerW = W - padL - padR;
  const totals = rows.map((r) => r.segments.reduce((a, s) => a + s.value, 0));
  const max = Math.max(...totals, 1);
  const rowH = (height - padT - padB) / rows.length;

  // Collect distinct legend
  const legend = new Map<string, string>();
  rows.forEach((r) => r.segments.forEach((s) => legend.set(s.label, s.color)));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ height }}>
      {rows.map((r, i) => {
        const y = padT + i * rowH;
        let cumX = 0;
        const total = totals[i];
        return (
          <g key={i}>
            <text x={padL - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize="12" fill="#475569">{r.label}</text>
            {r.segments.map((s, j) => {
              const w = (s.value / max) * innerW;
              const x = padL + cumX;
              cumX += w;
              return <rect key={j} x={x} y={y + rowH * 0.2} width={w} height={rowH * 0.6} fill={s.color} />;
            })}
            <text x={padL + (total / max) * innerW + 6} y={y + rowH / 2 + 4} fontSize="11" fill="#475569" fontFamily="ui-monospace, monospace">
              {formatValue(total)}
            </text>
          </g>
        );
      })}
      {/* Legend */}
      <g transform={`translate(${padL}, ${height - padB + 14})`}>
        {Array.from(legend.entries()).map(([label, color], i) => (
          <g key={label} transform={`translate(${i * 110}, 0)`}>
            <rect x="0" y="-9" width="10" height="10" fill={color} rx="1" />
            <text x="14" y="0" fontSize="10" fill="#1F2937">{label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Donut chart — proportions (e.g. spend by vendor)
// ----------------------------------------------------------------------------

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function Donut({ data, size = 180, formatValue }: { data: DonutSlice[]; size?: number; formatValue?: (n: number) => string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) return <div className="text-[12px] text-slate-500 italic px-4 py-8">No data yet.</div>;
  const r = size / 2;
  const inner = r * 0.55;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`-${r} -${r} ${size} ${size}`}>
        {data.map((d, i) => {
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
          return <path key={i} d={path} fill={d.color} />;
        })}
        <text textAnchor="middle" dy="4" fontSize="11" fill="#64748B">{formatValue ? formatValue(total) : total.toLocaleString()}</text>
      </svg>
      <ul className="text-[12px] space-y-1">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-sm inline-block" style={{ backgroundColor: d.color }} />
            <span className="text-slate-700">{d.label}</span>
            <span className="ml-auto text-slate-500 font-mono tabular-nums">{((d.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Common color palette to keep cards visually consistent.
export const PALETTE = ["#8B6F47", "#DC2626", "#2563EB", "#D97706", "#059669", "#7C3AED", "#0EA5E9", "#A78BFA", "#F97316", "#14B8A6"];

// Card wrapper used by every workshop widget.
export function ChartCard({ title, subtitle, children, span = 1 }: { title: string; subtitle?: string; children: ReactNode; span?: 1 | 2 | 3 }) {
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
