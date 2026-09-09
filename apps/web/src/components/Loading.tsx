/**
 * Animated branded splash shown for a short moment on first app load,
 * giving the launch a polished entrance after the bundle downloads.
 */
export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-white">
      <div className="relative animate-scale-in">
        <img src="/images/icon.png" alt="Kika" className="w-[68px] h-[68px] object-contain drop-shadow-sm" />
        <span className="absolute inset-0 rounded-full ring-4 ring-primary/20 animate-ping" />
      </div>
      <div className="mt-4 text-text-secondary text-[11px] font-medium">Fresh produce from local markets</div>
      <div className="mt-6 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-primary animate-fade-up"
            style={{ animationDelay: `${i * 140}ms`, animationIterationCount: 'infinite', animationDirection: 'alternate' }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Deterministic skeletons that replace static blank areas while data loads,
 * so the page reads as "loading" instead of empty white space.
 */
export function ProductSkeletonGrid({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-5 gap-[11px]">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-border rounded-[11px] overflow-hidden animate-pulse-soft">
          <div className="h-[145px] shimmer" />
          <div className="p-[11px] space-y-2">
            <div className="h-3 bg-surface rounded w-3/4" />
            <div className="h-2 bg-surface rounded w-1/2" />
            <div className="h-4 bg-surface rounded w-2/5" />
            <div className="h-6 bg-surface rounded w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Horizontal skeleton row used by mobile home sections while data loads. */
export function MobileProductSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex gap-3 px-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-[150px] shrink-0 bg-white border border-border rounded-xl overflow-hidden animate-pulse-soft">
          <div className="h-[110px] shimmer" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-surface rounded w-3/4" />
            <div className="h-6 bg-surface rounded w-2/5" />
            <div className="h-3 bg-surface rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
