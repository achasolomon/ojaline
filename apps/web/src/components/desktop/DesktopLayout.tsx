import type { ReactNode } from 'react';
import { DesktopHeader } from './DesktopHeader';
import { DesktopCategoryNav } from './DesktopCategoryNav';
import { DesktopFooter } from './DesktopFooter';

export function DesktopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <DesktopHeader />
      <DesktopCategoryNav />
      <div className="flex-1">{children}</div>
      <DesktopFooter />
    </div>
  );
}
