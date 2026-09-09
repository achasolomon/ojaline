import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/icons';

const HELP_TOPICS: { icon: IconName; title: string; body: string; to?: string }[] = [
  {
    icon: 'cart',
    title: 'Ordering on Kika',
    body: 'Browse fresh produce by category or market day, then add items to your cart. Min order and unit show on every product card.',
  },
  {
    icon: 'store',
    title: 'Selling on Kika',
    body: 'Create a listing in minutes from the Sell option. Set your price, units, quantity and how you want to fulfil orders.',
    to: '/offers/new',
  },
  {
    icon: 'truck',
    title: 'Delivery & pickup',
    body: 'Choose instant delivery, scheduled delivery, or market-day pickup at checkout. Delivery fees always appear before you pay.',
  },
  {
    icon: 'shield',
    title: 'Buyer protection',
    body: 'Only pay through Kika to stay covered. Orders paid outside the platform forfeit refunds, disputes and delivery tracking.',
  },
  {
    icon: 'card',
    title: 'Payments',
    body: 'We accept bank transfer, USSD and cards via Paystack. You only pay for what is confirmed available.',
  },
  {
    icon: 'message',
    title: 'Chat with sellers',
    body: 'Message sellers before you buy to confirm availability, haggle, or arrange pickup. Conversations are logged for your protection.',
  },
];

const FAQS = [
  {
    q: 'How fresh is the produce?',
    a: 'Everything on Kika is sourced the same day by sellers who work directly in their local markets. Perishable items are flagged on each product so you know what to use first.',
  },
  {
    q: 'Do you deliver to my area?',
    a: 'We currently deliver across Lagos, Abuja, Ibadan, Port Harcourt and Kano. Pickup is always available at the seller\u2019s market stall if your area isn\u2019t covered yet.',
  },
  {
    q: 'What happens if an item arrives damaged?',
    a: 'If you paid through Kika, raise a dispute from the order within 48 hours of delivery and we\\u2019ll arrange a refund or replacement after review.',
  },
  {
    q: 'Can I order in bulk?',
    a: 'Yes. Market-day listings often unlock better wholesale pricing. Filter by \u201cWholesale\u201d or check the Market Day picks on the home page.',
  },
  {
    q: 'How do I sell on Kika?',
    a: 'Use the Sell button in the header to create your first listing. You\\u2019ll set your product, price, units and fulfilment mode, then go live immediately.',
  },
];

export default function Help() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-primary-light text-primary flex items-center justify-center mx-auto mb-4">
          <Icon name="help" size={32} />
        </div>
        <h1 className="text-2xl font-black text-text mb-2">How can we help?</h1>
        <p className="text-sm text-textSecondary max-w-[480px] mx-auto">
          Everything you need to shop, sell and get your produce delivered on Kika.
        </p>
      </div>

      {/* Topics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-10">
        {HELP_TOPICS.map((t) => (
          <button
            key={t.title}
            type="button"
            onClick={() => t.to && navigate(t.to)}
            className={`text-left bg-white border border-border rounded-xl p-5 transition hover:shadow-md hover:-translate-y-0.5 ${t.to ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span className="w-10 h-10 rounded-lg bg-primary-light text-primary flex items-center justify-center mb-3">
              <Icon name={t.icon} size={20} />
            </span>
            <h3 className="text-sm font-bold text-text mb-1">{t.title}</h3>
            <p className="text-xs text-textSecondary leading-relaxed">{t.body}</p>
          </button>
        ))}
      </div>

      {/* FAQ */}
      <h2 className="mx-auto max-w-[720px] text-lg font-black text-text mb-4">Frequently asked questions</h2>
      <div className="mx-auto max-w-[720px] bg-white border border-border rounded-xl divide-y divide-border mb-10 overflow-hidden">
        {FAQS.map((f, i) => (
          <div key={f.q}>
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-transparent border-none cursor-pointer text-left"
            >
              <span className="text-sm font-semibold text-text">{f.q}</span>
              <Icon name="chevronRight" size={16} className={`text-textSecondary shrink-0 transition-transform ${open === i ? 'rotate-90' : ''}`} />
            </button>
            {open === i && (
              <p className="px-5 pb-4 text-xs text-textSecondary leading-relaxed">{f.a}</p>
            )}
          </div>
        ))}
      </div>

      {/* Contact CTA */}
      <div className="bg-primary-light rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <span className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
            <Icon name="phone" size={20} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-text">Still stuck?</h3>
            <p className="text-xs text-textSecondary">Mon{'\u2013'}Sat, 7am{'\u2013'}8pm WAT {'\u00b7'} Our local markets team replies fast.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="bg-primary text-white text-sm font-semibold rounded-xl px-5 py-3 border-none cursor-pointer hover:bg-primary-dark transition"
        >
          Chat with support
        </button>
      </div>
    </div>
  );
}