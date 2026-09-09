export type DeliveryWindow = 'Morning' | 'Afternoon' | 'Evening';

export interface DeliveryDateOption {
  date: string;
  label: string;
  day: string;
  full: string;
}

export const DELIVERY_WINDOWS: Array<{ slot: DeliveryWindow; label: string; hours: string }> = [
  { slot: 'Morning', label: 'Morning', hours: '8a - 12p' },
  { slot: 'Afternoon', label: 'Afternoon', hours: '12p - 4p' },
  { slot: 'Evening', label: 'Evening', hours: '4p - 8p' },
];

export function nextDeliveryDates(count = 5): DeliveryDateOption[] {
  const out: DeliveryDateOption[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const week = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const dayNum = d.getDate();
    const month = d.toLocaleDateString('en-GB', { month: 'short' });
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(dayNum).padStart(2, '0');
    out.push({
      date: `${y}-${m}-${dd}`,
      label: i === 1 ? 'Tomorrow' : week,
      day: String(dayNum),
      full: `${i === 1 ? 'Tomorrow' : week}, ${dayNum} ${month}`,
    });
  }
  return out;
}

export function formatDeliveryWindow(date: string | null, window: string | null): string | null {
  if (!date) return null;
  const opt = nextDeliveryDates(5).find((d) => d.date === date);
  const base = opt ? opt.full : date;
  return window ? `${base} · ${window}` : base;
}