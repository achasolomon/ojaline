import { useNavigate } from 'react-router-dom';

export function DesktopHero() {
  const navigate = useNavigate();

  return (
    <section className="max-w-[1480px] mx-auto px-6 py-4">
      <div className="grid gap-[17px]" style={{ gridTemplateColumns: 'minmax(0,1fr) 290px' }}>
        {/* Hero Banner */}
        <div className="h-[325px] rounded-[14px] overflow-hidden relative bg-gradient-to-br from-[#056e31] via-[#07883f] to-[#79aa76] text-white">
          <div className="relative z-[3] w-[52%] p-[43px]">
            <div className="text-[11px] font-extrabold uppercase tracking-[1px]">Trusted local marketplace</div>
            <h1 className="text-[41px] leading-[1.03] mt-2 mb-3.5">Fresh from<br/>Farm to You</h1>
            <p className="text-[14px] leading-[1.55] text-[#e9f7ed] max-w-[460px]">
              Buy directly from trusted farmers and sellers and get quality produce at fair prices.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('products');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="border-0 rounded-[7px] px-[17px] py-[11px] text-[11px] font-extrabold bg-white text-[#07883f] cursor-pointer hover:shadow-md transition"
              >
                Shop Now
              </button>
              <button
                type="button"
                onClick={() => navigate('/offers?channel=WHOLESALE')}
                className="border-0 rounded-[7px] px-[17px] py-[11px] text-[11px] font-extrabold bg-transparent text-white border border-white ml-[7px] cursor-pointer hover:bg-white/10 transition"
              >
                Explore Market Day
              </button>
            </div>
          </div>

          {/* Decorative produce visual */}
          <div className="absolute right-[3%] bottom-[-15px] w-[44%] h-[85%]"
            style={{
              background: 'radial-gradient(circle at 30% 62%, #e65337 0 8%, transparent 8.5%), radial-gradient(circle at 48% 68%, #f1a722 0 10%, transparent 10.5%), radial-gradient(circle at 67% 55%, #8eb947 0 14%, transparent 14.5%), radial-gradient(circle at 78% 70%, #5f9d3d 0 13%, transparent 13.5%), radial-gradient(circle at 48% 35%, #4b9b3d 0 18%, transparent 18.5%)'
            }}
          >
            <div className="absolute inset-[28%_18%_0] bg-[#b36d39]" style={{ clipPath: 'polygon(4% 15%, 96% 15%, 83% 100%, 17% 100%)' }} />
          </div>

          {/* Trust card overlay */}
          <div className="absolute z-[4] right-[18px] top-[28px] bg-white text-text w-[205px] rounded-[11px] p-3.5 shadow-[0_10px_25px_rgba(0,0,0,0.02)]">
            {[
              { icon: '✓', label: 'Verified Sellers', sub: 'All sellers are verified' },
              { icon: '⚡', label: 'Fast Delivery', sub: 'From 30 mins' },
              { icon: '▣', label: 'Secure Payments', sub: 'Protected checkout' },
              { icon: '✓', label: 'Buyer Protection', sub: 'Shop with confidence' },
            ].map((item, i) => (
              <div key={item.label} className={`flex gap-2.5 py-2 ${i < 3 ? 'border-b border-border' : ''}`}>
                <span className="text-primary font-black text-xs shrink-0">{item.icon}</span>
                <div>
                  <strong className="block text-[10px] text-text">{item.label}</strong>
                  <span className="text-[9px] text-text-secondary">{item.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Market Day Sidebar */}
        <aside className="bg-white border border-border rounded-[14px] overflow-hidden hidden xl:flex flex-col">
          <div className="p-5">
            <div className="text-[10px] text-text-secondary font-extrabold uppercase tracking-wide">MARKET DAY</div>
            <h2 className="mt-1 mb-0 text-primary text-[24px] leading-tight">Wholesale<br/>Prices</h2>
            <p className="text-[11px] text-text-secondary leading-[1.5] mt-1.5">
              Save more when you buy in bulk from trusted market sellers.
            </p>
            <button
              type="button"
              onClick={() => navigate('/offers?channel=WHOLESALE')}
              className="mt-4 bg-primary text-white text-[11px] font-extrabold rounded-[7px] px-[17px] py-[11px] border-none cursor-pointer hover:bg-primary-dark transition"
            >
              Shop Market Day
            </button>
          </div>
          {/* Market image placeholder */}
          <div
            className="h-[145px]"
            style={{
              background: 'radial-gradient(circle at 25% 58%, #e34d32 0 12%, transparent 12.5%), radial-gradient(circle at 45% 68%, #efa821 0 13%, transparent 13.5%), radial-gradient(circle at 63% 48%, #70a63e 0 17%, transparent 17.5%), linear-gradient(145deg, #eff6e5, #dce9c7)'
            }}
          />
          <div className="flex justify-between px-4 py-3 border-t border-border text-[10px]">
            <span className="text-text-secondary">▣ Next Market Day</span>
            <b className="text-text">Sat, 24 May</b>
          </div>
        </aside>
      </div>
    </section>
  );
}
