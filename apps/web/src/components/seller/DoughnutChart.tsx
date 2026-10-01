export interface DoughnutSegment {
  label: string;
  value: number;
  color: string;
}

interface DoughnutChartProps {
  segments: DoughnutSegment[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}

export function DoughnutChart({ segments, centerLabel, centerValue, size = 176 }: DoughnutChartProps) {
  const stroke = 20;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const CIRC = 2 * Math.PI * r;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let acc = 0;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#F3F4F6" strokeWidth={stroke} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s, i) => {
              const frac = s.value / total;
              const el = (
                <circle
                  key={i}
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${frac * CIRC} ${CIRC - frac * CIRC}`}
                  strokeDashoffset={-acc * CIRC}
                  transform={`rotate(-90 ${c} ${c})`}
                  style={{ transition: 'stroke-dasharray 0.4s ease' }}
                />
              );
              acc += frac;
              return el;
            })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && <span className="text-lg font-black text-gray-900">{centerValue}</span>}
          {centerLabel && <span className="mt-0.5 text-[11px] font-semibold text-gray-500">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}