interface LineChartPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  points: LineChartPoint[];
  color?: string;
  height?: number;
}

/**
 * Lightweight SVG line/area chart. Pure CSS-friendly, no chart library —
 * matches the app's dependency-light approach.
 */
export function LineChart({ points, color = '#088F48', height = 150 }: LineChartProps) {
  const W = 320;
  const H = height;
  const PX = 10;
  const PY = 14;
  const n = points.length;

  if (n === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 1);
  const step = (W - PX * 2) / Math.max(n - 1, 1);
  const coords = points.map((p, i) => [PX + i * step, H - PY - (p.value / max) * (H - PY * 2)] as const);
  const line = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const last = coords[n - 1];
  const first = coords[0];
  const area = `M ${first[0].toFixed(2)},${H - PY} L ${line} L ${last[0].toFixed(2)},${H - PY} Z`;
  const gridY = [0.25, 0.5, 0.75].map((f) => H - PY - f * (H - PY * 2));

  const labelIdx = n <= 7 ? [...points.keys()] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Trend chart">
      {gridY.map((y) => (
        <line key={y} x1={PX} x2={W - PX} y1={y} y2={y} stroke="#F3F4F6" strokeWidth={1} />
      ))}
      <path d={area} fill={color} opacity={0.12} />
      {coords.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={2} fill={color} />
      ))}
      <polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {labelIdx.map((i) => (
        <text
          key={i}
          x={coords[i][0]}
          y={H - 2}
          textAnchor="middle"
          className="fill-gray-400"
          style={{ fontSize: 9, fontWeight: 600 }}
        >
          {points[i].label}
        </text>
      ))}
    </svg>
  );
}