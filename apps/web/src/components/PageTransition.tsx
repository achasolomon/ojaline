import { useLayoutEffect, useRef, type ReactNode } from 'react';

interface PageTransitionProps {
  locationKey: string;
  children: ReactNode;
}

/**
 * Remounts routed content whenever the route key changes so the incoming
 * page starts fresh, and resets scroll before paint. No enter/exit
 * animation — motion was removed because it produced visible flicker.
 */
export function PageTransition({ locationKey, children }: PageTransitionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // Mobile: the inner <main> is the scroll container.
    const scroller = ref.current?.closest('main');
    if (scroller) scroller.scrollTop = 0;
    // Desktop: the document scrolls (header/nav sit outside <main>), so the
    // window keeps the old deep scroll position and the viewport lands on a
    // blank area of the incoming (shorter) page. Reset it before paint.
    window.scrollTo(0, 0);
  }, [locationKey]);

  return (
    <div key={locationKey} ref={ref} className="app-page min-h-full">
      {children}
    </div>
  );
}
