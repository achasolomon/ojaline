const BENEFITS = [
  { icon: '⚡', title: 'Instant Delivery', sub: 'As fast as 30 mins' },
  { icon: '◷', title: 'Scheduled Delivery', sub: 'Choose your time' },
  { icon: '⌁', title: 'Direct from Farm', sub: 'Farm fresh produce' },
  { icon: '↻', title: 'Easy Returns', sub: 'Hassle-free returns' },
];

export function ServiceBenefits() {
  return (
    <section className="max-w-[1480px] mx-auto px-6 mt-3.5">
      <div className="bg-white border border-border rounded-[10px] grid grid-cols-4 p-2">
        {BENEFITS.map((b, i) => (
          <div key={b.title} className={`flex gap-2.5 items-center px-5 py-2 ${i < 3 ? 'border-r border-border' : ''}`}>
            <div className="w-[33px] h-[33px] rounded-full bg-primary-light text-primary grid place-items-center text-sm shrink-0">
              {b.icon}
            </div>
            <div>
              <strong className="block text-[11px] text-text">{b.title}</strong>
              <span className="text-[9px] text-text-secondary">{b.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
