import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from './icons';

/** A compact, app-like page header used on buyer and seller task screens. */
export function PageTopBar({ title, action }: { title: string; action?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-3 lg:hidden">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="grid h-9 w-9 place-items-center rounded-full bg-transparent text-text transition hover:bg-surface"
        aria-label="Go back"
      >
        <Icon name="arrowRight" size={19} className="rotate-180" />
      </button>
      <h1 className="flex-1 text-center text-[15px] font-extrabold text-text">{title}</h1>
      <span className="flex h-9 min-w-9 items-center justify-end">{action}</span>
    </header>
  );
}
