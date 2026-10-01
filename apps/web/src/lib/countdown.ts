import { useEffect, useState } from 'react';

/** Seconds/HH:MM:SS remaining until the end of today (deals reset daily). */
export function timeToMidnight(): string {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const diff = Math.max(0, end.getTime() - now.getTime());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Live "Ends in HH:MM:SS" countdown that ticks every second. */
export function useCountdownToMidnight(): string {
  const [value, setValue] = useState(timeToMidnight);
  useEffect(() => {
    const id = window.setInterval(() => setValue(timeToMidnight()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return value;
}

/**
 * ms remaining until `targetTs`, ticking every second. Returns 0 once
 * expired and `null` when no deadline is set.
 */
export function useCountdownUntil(targetTs: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (targetTs == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetTs]);
  if (targetTs == null) return null;
  return Math.max(0, targetTs - now);
}

/** Compact "2h 05m" / "4m 12s" / "9s" clock for deadlines. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1_000);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}