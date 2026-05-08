// Tiny inline SVG sparkline. Renders a values series as a polyline +
// optional dot at the latest point. Pure server component — no JS.
export function Sparkline({
  values,
  width = 80,
  height = 24,
  positive,
}: {
  values: number[];
  width?: number;
  height?: number;
  positive?: boolean | null; // colors line green / red / slate
}) {
  if (values.length < 2) {
    return <div className="text-[10px] text-slate-400">no history</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = positive == null ? "#64748B" : positive ? "#059669" : "#DC2626";
  const lastPoint = points[points.length - 1].split(",").map(Number);
  return (
    <svg width={width} height={height} className="inline-block align-middle" aria-hidden>
      <polyline fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" points={points.join(" ")} />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r={2} fill={stroke} />
    </svg>
  );
}
