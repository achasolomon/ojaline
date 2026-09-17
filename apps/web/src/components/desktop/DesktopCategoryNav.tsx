import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCategories, type Category } from '../../lib/api';
import { Icon, type IconName } from '../icons';

type DropdownOption = { label: string; href: string; icon: IconName };

interface MenuSection {
  title: string;
  items: Category[];
}

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 180;

function categoryIcon(name: string): IconName {
  const n = name.toLowerCase();
  if (n.includes('fruit') || n.includes('vegetable')) return 'leaf';
  if (n.includes('grains') || n.includes('smoked') || n.includes('dried')) return 'box';
  if (n.includes('tuber') || n.includes('root') || n.includes('swallow') || n.includes('soup')) return 'basket';
  if (n.includes('oil')) return 'tag';
  if (n.includes('spice')) return 'star';
  return 'grid';
}

// Group a category's subcategories into sections by their `menu_section` field.
function buildSections(category: Category): MenuSection[] {
  const groups = new Map<string, Category[]>();
  for (const child of category.children ?? []) {
    const key = child.menu_section || 'Shop';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(child);
  }
  return Array.from(groups.entries()).map(([title, items]) => ({ title, items }));
}

function MegaMenu({
  category,
  onNavigate,
  onEnter,
}: {
  category: Category;
  onNavigate: (href: string) => void;
  onEnter?: () => void;
}) {
  const sections = buildSections(category);
  const cols = Math.min(Math.max(sections.length, 1), 4);

  return (
    <div
      className="absolute left-0 right-0 top-full z-50"
      role="menu"
      aria-label={`${category.name} menu`}
      onMouseEnter={onEnter}
    >
      <div className="mx-auto max-w-[1200px] bg-white border border-t-0 border-border rounded-b-xl shadow-[0_24px_48px_rgba(0,0,0,0.10)]">
        <div className="flex gap-10 px-[30px] py-7">
          <div
            className="grid flex-1 gap-x-10 gap-y-7"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {sections.map((section) => (
              <div key={section.title} className="min-w-0">
                <h3 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-textSecondary mb-3">
                  {section.title}
                </h3>
                <ul className="space-y-1.5">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onNavigate(`/offers?category_id=${item.id}`)}
                        className="text-[12px] leading-snug text-text text-left cursor-pointer bg-transparent border-none p-0 hover:text-primary transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-sm"
                      >
                        {item.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <aside className="w-[210px] shrink-0 border-l border-border pl-8">
            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-textSecondary mb-3">
              Shop {category.name}
            </h3>
            <ul className="space-y-1.5">
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onNavigate(`/offers?category_id=${category.id}`)}
                  className="text-[12px] leading-snug text-text text-left cursor-pointer bg-transparent border-none p-0 hover:text-primary transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-sm"
                >
                  View all {category.name}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onNavigate('/offers?sort=cheapest')}
                  className="text-[12px] leading-snug text-text text-left cursor-pointer bg-transparent border-none p-0 hover:text-primary transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-sm"
                >
                  Lowest prices
                </button>
              </li>
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onNavigate('/offers?sort=newest')}
                  className="text-[12px] leading-snug text-text text-left cursor-pointer bg-transparent border-none p-0 hover:text-primary transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-sm"
                >
                  New arrivals
                </button>
              </li>
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onNavigate('/market-days')}
                  className="text-[12px] leading-snug text-text text-left cursor-pointer bg-transparent border-none p-0 hover:text-primary transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-sm"
                >
                  Market Day wholesale
                </button>
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}

function NavDropdown({
  label,
  options,
  className = '',
}: {
  label: string;
  options: DropdownOption[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center bg-white border-none text-text text-[11px] px-3 py-[13px] cursor-pointer hover:text-primary transition whitespace-nowrap ${className} ${open ? 'text-primary' : ''}`}
      >
        {label}
        <Icon name="chevronDown" size={12} className={`ml-1.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[210px] rounded-xl border border-border bg-white py-1.5 shadow-lg z-50">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(o.href);
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-xs text-text hover:bg-surface transition"
            >
              <Icon name={o.icon} size={14} className="text-textSecondary" />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DesktopCategoryNav() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
    return () => {
      if (openTimer.current) window.clearTimeout(openTimer.current);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const open = useCallback((id: string) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setActiveId(id), OPEN_DELAY_MS);
  }, []);

  const scheduleClose = useCallback(() => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setActiveId(null), CLOSE_DELAY_MS);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  const active = categories.find((c) => c.id === activeId) ?? null;

  const go = (href: string) => {
    navigate(href);
    setActiveId(null);
  };

  return (
    <nav
      className="hidden lg:block bg-white border-t border-[#f3f4f3]"
      onMouseLeave={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setActiveId(null);
      }}
    >
      <div className="relative mx-auto flex h-[64px] max-w-[1200px] items-center gap-2 px-[30px]">
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById('filter');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          className="bg-primary text-white rounded-[7px] font-extrabold text-[11px] px-[17px] py-[10px] border-none cursor-pointer hover:bg-primary-dark transition shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <Icon name="menu" size={13} className="shrink-0" />&nbsp;All Categories
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none py-2">
          {categories.map((cat) => {
            const isOpen = activeId === cat.id;
            return (
              <div
                key={cat.id}
                className="relative shrink-0"
                onMouseEnter={() => open(cat.id)}
                onFocus={() => open(cat.id)}
                onMouseLeave={scheduleClose}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) scheduleClose();
                }}
              >
                <button
                  type="button"
                  onClick={() => go(`/offers?category_id=${cat.id}`)}
                  aria-haspopup="true"
                  aria-expanded={isOpen}
                  className={`flex items-center gap-1.5 bg-white border-none text-text text-[11px] px-2.5 py-2 cursor-pointer transition whitespace-nowrap rounded-lg hover:bg-surface focus-visible:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                    isOpen ? 'bg-surface text-primary' : ''
                  }`}
                >
                  <Icon name={categoryIcon(cat.name)} size={14} className="text-textSecondary" />
                  {cat.name}
                  {(cat.children?.length ?? 0) > 0 && (
                    <Icon name="chevronDown" size={11} className={`text-textSecondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center">
          <button type="button" onClick={() => go('/market-days')} className="flex items-center bg-white border-none text-text text-[11px] px-3 py-[13px] cursor-pointer hover:text-primary transition whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <Icon name="map" size={14} className="mr-1.5" />Market Day
          </button>
          <NavDropdown
            label="Deals"
            className="text-[#e23b31] font-extrabold"
            options={[
              { label: 'Popular right now', href: '/offers?sort=popular', icon: 'bolt' },
              { label: 'New arrivals', href: '/offers?sort=newest', icon: 'clock' },
              { label: 'Lowest price', href: '/offers?sort=cheapest', icon: 'tag' },
              { label: 'Market Day wholesale', href: '/market-days', icon: 'map' },
            ]}
          />
          <NavDropdown
            label="More"
            options={[
              { label: 'Sell on Kika', href: '/seller/products/new', icon: 'plus' },
              { label: 'My Cart', href: '/cart', icon: 'cart' },
              { label: 'Notifications', href: '/notifications', icon: 'bell' },
              { label: 'Account', href: '/account', icon: 'user' },
              { label: 'Help Center', href: '/help', icon: 'help' },
            ]}
          />
        </div>

        {active && (
          <MegaMenu
            category={active}
            onNavigate={go}
            onEnter={cancelClose}
          />
        )}
      </div>
    </nav>
  );
}