import { Link } from 'react-router-dom';

export function DesktopFooter() {
  return (
    <footer className="bg-[#10351f] text-[#c6d8cc] mt-8 hidden lg:block">
      <div className="max-w-[1200px] mx-auto px-[32px] pt-[34px] pb-[18px]">
        <div className="grid gap-[25px]" style={{ gridTemplateColumns: '2fr repeat(4,1fr)' }}>
          {/* Brand */}
          <div>
            <img src="/images/logo_white.png" alt="Kika" className="h-[30px] w-auto object-contain mb-2" />
            <p className="text-[9px] leading-[1.6] max-w-[250px] mt-1 text-[#adc1b4]">
              From farm to you. Discover trusted local sellers, fresh produce and better market prices.
            </p>
          </div>

          {/* Shop */}
          <div>
            <h3 className="text-[10px] text-white font-black mb-0">SHOP</h3>
            <Link to="/categories" className="block text-[9px] text-[#adc1b4] no-underline mt-2 mb-2 hover:text-white transition">Categories</Link>
            <Link to="/offers" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Fresh Produce</Link>
            <Link to="/market-days" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Market Day</Link>
            <Link to="/offers?sort=popular" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Deals</Link>
          </div>

          {/* Sell */}
          <div>
            <h3 className="text-[10px] text-white font-black mb-0">SELL ON KIKA</h3>
            <Link to="/register" className="block text-[9px] text-[#adc1b4] no-underline mt-2 mb-2 hover:text-white transition">Become a Seller</Link>
            <Link to="/seller/dashboard" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Seller Dashboard</Link>
            <Link to="/help" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Seller Policies</Link>
          </div>

          {/* Help */}
          <div>
            <h3 className="text-[10px] text-white font-black mb-0">HELP</h3>
            <Link to="/help" className="block text-[9px] text-[#adc1b4] no-underline mt-2 mb-2 hover:text-white transition">Support</Link>
            <Link to="/help" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">FAQs</Link>
            <Link to="/help" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Delivery</Link>
            <Link to="/returns" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Returns</Link>
          </div>

          {/* Company & Legal */}
          <div>
            <h3 className="text-[10px] text-white font-black mb-0">COMPANY & LEGAL</h3>
            <Link to="/help" className="block text-[9px] text-[#adc1b4] no-underline mt-2 mb-2 hover:text-white transition">About Kika</Link>
            <Link to="/help" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Contact</Link>
            <Link to="/help" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Terms</Link>
            <Link to="/help" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Privacy</Link>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto mt-[22px] pt-[13px] border-t border-[#2a4e38] text-[8px]">
          © 2026 Kika. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
