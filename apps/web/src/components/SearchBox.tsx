import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchSuggestions, type SearchSuggestion } from '../lib/api';
import { Icon } from './icons';

const DEBOUNCE_MS = 220;

const searchSvg = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const GROUP_LABEL: Record<SearchSuggestion['kind'], string> = {
  OFFER: 'Products',
  SELLER: 'Sellers',
  CATEGORY: 'Categories',
};

function SuggestRow({ s, onPick }: { s: SearchSuggestion; onPick: (href: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(s.href)}
      className="flex w-full items-center gap-3 border-none bg-transparent px-4 py-2.5 text-left transition hover:bg-surface"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary-light text-primary">
        {s.imageUrl ? (
          <img src={s.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : s.kind === 'OFFER' ? (
          <Icon name="box" size={14} />
        ) : s.kind === 'CATEGORY' ? (
          <Icon name="grid" size={14} />
        ) : (
          <Icon name="store" size={14} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-bold text-text">{s.label}</span>
        {s.sub && <span className="block truncate text-[10px] text-textSecondary">{s.sub}</span>}
      </span>
      <Icon name="arrowRight" size={12} className="shrink-0 text-textSecondary" />
    </button>
  );
}

/**
 * Header search with live suggestions. Press Enter (or the Search button) to
 * jump to the full filtered offers page; pick a row to go straight to the
 * product, seller or category. Works from every page via the shared header.
 */
export function SearchBox({ variant = 'desktop', className = '' }: { variant?: 'desktop' | 'mobile'; className?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [suggest, setSuggest] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setSuggest([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      searchSuggestions(query)
        .then((list) => {
          setSuggest(list);
          setOpen(true);
        })
        .catch(() => setSuggest([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const runSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setOpen(false);
    setQ('');
    navigate(`/offers?q=${encodeURIComponent(trimmed)}`);
  };

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    navigate(href);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(q);
  };

  const groups: { key: SearchSuggestion['kind']; label: string }[] = [
    { key: 'OFFER', label: 'Products' },
    { key: 'SELLER', label: 'Sellers' },
    { key: 'CATEGORY', label: 'Categories' },
  ];

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <form
        onSubmit={submit}
        className={`flex h-[46px] items-center overflow-hidden border border-[#dfe5e1] bg-[#fafbfa] ${
          variant === 'mobile' ? 'h-[42px] rounded-xl border-border bg-surface' : 'rounded-[9px]'
        }`}
      >
        <span className="pl-3.5 text-textSecondary">{searchSvg}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={(e) => {
            if (e.target.value.trim()) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Search for produce, sellers, categories..."
          className="min-w-0 flex-1 border-none bg-transparent px-2.5 text-[13px] text-text outline-none placeholder:text-[#9CA3AF]"
        />
        {variant === 'desktop' ? (
          <button
            type="submit"
            className="h-full cursor-pointer border-none bg-primary px-[23px] font-extrabold text-[13px] text-white transition hover:bg-primary-dark"
          >
            Search
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Search"
            className="grid h-full w-10 cursor-pointer place-items-center border-none bg-primary text-white"
          >
            {searchSvg}
          </button>
        )}
      </form>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border bg-white shadow-[0_16px_40px_rgba(0,0,0,0.14)]">
          {loading && suggest.length === 0 ? (
            <p className="px-4 py-3 text-[12px] text-textSecondary">Searching…</p>
          ) : suggest.length === 0 ? (
            <p className="px-4 py-3 text-[12px] text-textSecondary">No results for “{q.trim()}”</p>
          ) : (
            groups.map((g) => {
              const rows = suggest.filter((s) => s.kind === g.key);
              if (rows.length === 0) return null;
              return (
                <div key={g.key}>
                  <p className="px-4 pb-1 pt-3 text-[9px] font-extrabold uppercase tracking-wider text-textSecondary">
                    {GROUP_LABEL[g.key]}
                  </p>
                  {rows.map((s) => (
                    <SuggestRow key={`${s.kind}:${s.id}`} s={s} onPick={go} />
                  ))}
                </div>
              );
            })
          )}
          <button
            type="button"
            onClick={() => runSearch(q)}
            className="w-full cursor-pointer border-t border-border bg-surface/60 px-4 py-2.5 text-left text-[11px] font-bold text-primary transition hover:bg-surface"
          >
            See all results for “{q.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}