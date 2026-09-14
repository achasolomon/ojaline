import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  subscribeAddresses,
  getSavedAddresses,
  activeAddress,
  addressShortLabel,
  addressSummary,
  setActiveAddress,
  type SavedAddress,
} from '../lib/addresses';
import { getUser } from '../lib/session';
import { Icon } from './icons';

export function roleLabel(): string {
  return getUser()?.seller_type ? 'Pickup from' : 'Deliver to';
}

export function AddressSwitcher({
  variant,
  onClose,
}: {
  variant: 'dropdown' | 'sheet';
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [list, setList] = useState<SavedAddress[]>(() => getSavedAddresses());
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const off = subscribeAddresses(setList);
    return off;
  }, []);

  const go = (hash: boolean) => {
    onClose();
    navigate(hash ? '/account#addresses' : '/account');
  };

  const panel = (
    <div
      className={`bg-white ${
        variant === 'dropdown'
          ? 'w-[320px] rounded-2xl border border-border shadow-xl'
          : 'w-full rounded-t-2xl border-t border-border pb-[env(safe-area-inset-bottom)]'
      }`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-[13px] font-bold text-text">{roleLabel()}</p>
        {variant === 'sheet' && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full bg-surface text-textSecondary cursor-pointer border-none"
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      <div className="max-h-[300px] overflow-y-auto p-2">
        {list.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-surface text-textSecondary">
              <Icon name="pin" size={18} />
            </span>
            <p className="mt-2 text-[12px] font-bold text-text">You no set address yet</p>
            <p className="mt-0.5 text-[11px] text-textSecondary">
              Add a known address so {getUser()?.seller_type ? 'pickup' : 'delivery'} go straight.
            </p>
          </div>
        ) : (
          list.map((a) => {
            const active = activeAddress()?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                disabled={switching}
                onClick={() => {
                  setSwitching(true);
                  setActiveAddress(a.id)
                    .catch(() => {})
                    .finally(() => setSwitching(false));
                  onClose();
                }}
                className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left cursor-pointer border border-transparent transition ${
                  active ? 'border-primary bg-primary-light' : 'hover:bg-surface'
                }`}
              >
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                    active ? 'bg-primary text-white' : 'bg-surface text-textSecondary'
                  }`}
                >
                  <Icon name="pin" size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-bold text-text">{addressShortLabel(a)}</span>
                    {a.is_default && (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[8px] font-bold text-primary">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-textSecondary">{addressSummary(a)}</span>
                </span>
                {active && <Icon name="check" size={14} className="mt-1 shrink-0 text-primary" />}
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={() => go(list.length === 0)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-surface/60 px-3 py-2.5 text-[12px] font-bold text-primary cursor-pointer border-none hover:bg-surface transition"
        >
          <Icon name="pin" size={14} />
          {list.length === 0 ? 'Set your address' : 'Manage addresses'}
        </button>
      </div>
    </div>
  );

  if (variant === 'sheet') {
    return (
      <div className="fixed inset-0 z-[90] flex items-end">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative w-full">{panel}</div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 top-full z-[80] mt-2">
      <div className="fixed inset-0 z-[-1]" onClick={onClose} />
      {panel}
    </div>
  );
}