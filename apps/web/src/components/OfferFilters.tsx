import { useState, type ReactNode } from 'react';
import type { Category, Channel, Perishability } from '../lib/api';
import { Icon } from './icons';

const CHANNEL_OPTIONS: { value: Channel | ''; label: string }[] = [
  { value: '', label: 'All channels' },
  { value: 'RETAILER', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'DIRECT', label: 'Direct' },
  { value: 'OPEN', label: 'Open' },
];

const SHELF_OPTIONS: { value: Perishability | ''; label: string }[] = [
  { value: '', label: 'Any' },
  { value: 'SHELF_GT_7D', label: 'Shelf 7+ days' },
  { value: 'SHELF_LT_7D', label: 'Perishable' },
];

export interface OfferFiltersProps {
  categories: Category[];
  channel: Channel | '';
  onChannelChange: (channel: Channel | '') => void;
  perishability: Perishability | '';
  onPerishabilityChange: (perishability: Perishability | '') => void;
  selectedCategoryId: string | null;
  onCategoryChange: (id: string | null) => void;
  priceMin: string;
  priceMax: string;
  onPriceMinChange: (value: string) => void;
  onPriceMaxChange: (value: string) => void;
  onClear: () => void;
  children?: ReactNode;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-textSecondary">{title}</h4>
      {children}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[7px] border px-2 py-1.5 text-left text-[11px] font-semibold transition active:scale-[0.97] ${
        active
          ? 'border-primary bg-primary-light text-primary'
          : 'border-border bg-white text-text hover:border-primary/40'
      }`}
    >
      {children}
    </button>
  );
}

export function OfferFilters({
  categories,
  channel,
  onChannelChange,
  perishability,
  onPerishabilityChange,
  selectedCategoryId,
  onCategoryChange,
  priceMin,
  priceMax,
  onPriceMinChange,
  onPriceMaxChange,
  onClear,
  children,
}: OfferFiltersProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isExpanded = (cat: Category) =>
    openIds.has(cat.id) || (cat.children ?? []).some((c) => c.id === selectedCategoryId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-black text-text">Filters</h3>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] font-bold text-primary hover:underline"
        >
          Clear all
        </button>
      </div>

      <Section title="Category">
        <div className="max-h-[280px] overflow-y-auto pr-1 scrollbar-none lg:max-h-[320px]">
          <button
            type="button"
            onClick={() => onCategoryChange(null)}
            className={`flex w-full items-center gap-1.5 rounded-[6px] px-1.5 py-1.5 text-left text-[11px] font-semibold transition ${
              !selectedCategoryId ? 'bg-primary-light text-primary' : 'text-text hover:bg-surface'
            }`}
          >
            <Icon name="grid" size={12} className="shrink-0 opacity-70" />
            All products
          </button>

          {categories.map((cat) => {
            const expanded = isExpanded(cat);
            const children = cat.children ?? [];
            return (
              <div key={cat.id}>
                <button
                  type="button"
                  onClick={() => toggle(cat.id)}
                  className="flex w-full items-center gap-1.5 rounded-[6px] px-1.5 py-1.5 text-left text-[11px] font-medium text-text transition hover:bg-surface"
                >
                  <Icon
                    name="chevronRight"
                    size={12}
                    className={`shrink-0 text-textSecondary transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{cat.name}</span>
                  <span className="shrink-0 text-[9px] font-semibold text-textSecondary">{cat.offer_count}</span>
                </button>

                {expanded && children.length > 0 && (
                  <div className="ml-[13px] mb-1 flex flex-col gap-0.5 border-l border-border pl-2.5">
                    {children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() =>
                          onCategoryChange(selectedCategoryId === child.id ? null : child.id)
                        }
                        className={`flex items-center justify-between gap-1 rounded-[6px] px-1.5 py-1 text-left text-[10px] transition ${
                          selectedCategoryId === child.id
                            ? 'font-bold text-primary'
                            : 'font-medium text-textSecondary hover:bg-surface hover:text-text'
                        }`}
                      >
                        <span className="min-w-0 truncate">{child.name}</span>
                        <span className="shrink-0 text-[9px] font-semibold text-textSecondary">
                          {child.offer_count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Channel">
        <div className="grid grid-cols-2 gap-1.5">
          {CHANNEL_OPTIONS.map((opt) => (
            <Pill key={opt.value} active={channel === opt.value} onClick={() => onChannelChange(opt.value)}>
              {opt.label}
            </Pill>
          ))}
        </div>
      </Section>

      <Section title="Shelf life">
        <div className="grid grid-cols-2 gap-1.5">
          {SHELF_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              active={perishability === opt.value}
              onClick={() => onPerishabilityChange(opt.value)}
            >
              {opt.label}
            </Pill>
          ))}
        </div>
      </Section>

      <Section title="Price range">
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Min"
            value={priceMin}
            onChange={(e) => onPriceMinChange(e.target.value)}
            className="w-full rounded-[7px] border border-border bg-white px-2 py-1.5 text-[11px] text-text outline-none transition focus:border-primary"
          />
          <input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Max"
            value={priceMax}
            onChange={(e) => onPriceMaxChange(e.target.value)}
            className="w-full rounded-[7px] border border-border bg-white px-2 py-1.5 text-[11px] text-text outline-none transition focus:border-primary"
          />
        </div>
        <p className="mt-1.5 text-[9px] text-textSecondary">Prices in naira (₦)</p>
      </Section>

      {children}
    </div>
  );
}