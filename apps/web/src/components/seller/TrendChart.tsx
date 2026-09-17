import { naira } from '@ojaline/design';

export type TrendMetric = 'sales_cents' | 'released_cents' | 'orders';

export interface TrendPoint {
  date: string;
  orders: number;
  sales_cents: number;
  released_cents: number;
}

const BAR_COLORS: Record<TrendMetric, string> = {
  sales_cents: 'bg-primary/75 group-hover:bg-primary',
  released_cents: 'bg-[#2A4BD7]/70 group-hover:bg-[#2A4BD7]',
  orders: 'bg-secondary/75 group-hover:bg-secondary',
};

const fmtNaira = (cents: number) => naira.format(cents / 100);

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function valueOf(p: TrendPoint, metric: TrendMetric): number {
  return metric === 'orders' ? p.orders : metric === 'sales_cents' ? p.sales_cents : p.released_cents;
}

/**
 * Lightweight responsive bar chart for the seller dashboard. No chart
 * dependency: a full-height flex column per day, hover tooltip, sparse axis.
 */
export function TrendChart({
  points,
  metric,
  color = BAR_COLORS[metric],
}: {
  points: TrendPoint[];
  metric: TrendMetric;
  color?: string;
}) {
  const max = Math.max(...points.map((p) => valueOf(p, metric)), 0);
  const fmt = metric === 'orders' ? (v: number) => `${v} order${v === 1 ? '' : 's'}` : fmtNaira;
  const step = Math.max(1, Math.ceil(points.length / 8));

  if (max === 0) {
    return (
      <div className="grid h-44 place-items-center rounded-xl bg-surface/60 text-xs text-textSecondary">
        No activity yet in this period — new sales will show up here.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold text-textSecondary">Peak</span>
        <span className="text-[11px] font-black text-text">{fmt(max)}</span>
      </div>
      <div className="flex h-40 items-end gap-[2px] border-b border-border/60">
        {points.map((p) => {
          const v = valueOf(p, metric);
          const pct = v > 0 ? Math.max((v / max) * 100, 2) : 0;
          return (
            <div key={p.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${shortDate(p.date)} · ${fmt(v)}`}>
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-semibold text-white shadow-md group-hover:block">
                {shortDate(p.date)} · {fmt(v)}
              </div>
              <div className={`w-full rounded-t-[3px] transition-colors ${color}`} style={{ height: `${pct}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] font-medium text-textSecondary">
        {points.map((p, i) =>
          i % step === 0 || i === points.length - 1 ? <span key={p.date}>{shortDate(p.date)}</span> : <span key={p.date} />,
        )}
      </div>
    </div>
  );
}