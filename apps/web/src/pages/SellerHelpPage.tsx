import { useNavigate } from 'react-router-dom';
import { getUser } from '../lib/session';
import { Icon, type IconName } from '../components/icons';

const QUICK_LINKS = [
  { to: '/seller/products', icon: 'basket', label: 'Add & manage products' },
  { to: '/seller/negotiations', icon: 'handshake', label: 'Handle bargaining' },
  { to: '/seller/payouts', icon: 'card', label: 'Payouts & bank details' },
  { to: '/seller/storefront', icon: 'store', label: 'My storefront' },
  { to: '/seller/messages', icon: 'message', label: 'Message customers' },
  { to: '/seller/ads', icon: 'megaphone', label: 'Run an ad' },
] as const;

const FAQS = [
  {
    icon: 'lock' as IconName,
    q: 'How do I get verified?',
    a: 'Complete your KYC to FULL tier from your seller account. Verified storefronts show a badge and get more buyer trust.',
  },
  {
    icon: 'cart' as IconName,
    q: 'How do I take an order?',
    a: 'Orders arrive from the market. Keep your offers active and quantities updated so customers always see what is available.',
  },
  {
    icon: 'handshake' as IconName,
    q: 'Buyers are bargaining with me. What do I do?',
    a: 'Open the Bargaining tab, accept a fair offer or counter. A confirmed bargain books the sale automatically.',
  },
  {
    icon: 'card' as IconName,
    q: 'When do I get paid?',
    a: 'Payouts go out after orders are completed and confirmed. Add your bank details under Payouts to receive them.',
  },
];

/** Seller help & support, fully inside the portal. */
export default function SellerHelpPage() {
  const nav = useNavigate();
  const user = getUser();

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6">
      <div>
        <h1 className="text-lg font-black text-gray-900">Help & support</h1>
        <p className="text-xs text-gray-500">Get help with your Seller Centre, or reach our team directly.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => nav('/seller/messages')}
          className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-primary/30 hover:bg-primary-light/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
            <Icon name="message" size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900">Chat with us</p>
            <p className="truncate text-[11px] text-gray-500">Quickest way to reach us</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            const to = user?.email ? `mailto:${user.email}` : 'mailto:help@ojaline.com';
            window.location.href = to;
          }}
          className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-primary/30 hover:bg-primary-light/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
            <Icon name="phone" size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900">Call us</p>
            <p className="truncate text-[11px] text-gray-500">Mon–Sat, 8am–6pm</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => nav('/seller/account')}
          className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-primary/30 hover:bg-primary-light/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
            <Icon name="user" size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900">My account</p>
            <p className="truncate text-[11px] text-gray-500">Profile & KYC status</p>
          </div>
        </button>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900">Quick help</h3>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {QUICK_LINKS.map((l) => (
            <button
              key={l.to}
              type="button"
              onClick={() => nav(l.to)}
              className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left text-xs font-semibold text-gray-700 transition hover:border-primary/30 hover:bg-primary-light/40"
            >
              <Icon name={l.icon} size={15} className="text-primary" />
              {l.label}
              <Icon name="chevronRight" size={14} className="ml-auto text-gray-400" />
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900">Common questions</h3>
        <div className="mt-3 divide-y divide-gray-100">
          {FAQS.map((f) => (
            <div key={f.q} className="flex gap-3 py-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
                <Icon name={f.icon} size={13} />
              </span>
              <div>
                <p className="text-xs font-bold text-gray-900">{f.q}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{f.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}