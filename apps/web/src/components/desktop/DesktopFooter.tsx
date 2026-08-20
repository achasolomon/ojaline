export function DesktopFooter() {
  return (
    <footer className="bg-[#10351f] text-[#c6d8cc] mt-8 hidden lg:block">
      <div className="max-w-[1480px] mx-auto px-[32px] pt-[34px] pb-[18px]">
        <div className="grid gap-[25px]" style={{ gridTemplateColumns: '2fr repeat(4,1fr)' }}>
          {/* Brand */}
          <div>
            <div className="text-[20px] text-white font-black">OJALINE</div>
            <p className="text-[9px] leading-[1.6] max-w-[250px] mt-2 text-[#adc1b4]">
              From farm to you. Discover trusted local sellers, fresh produce and better market prices.
            </p>
          </div>

          {/* Shop */}
          <div>
            <h3 className="text-[10px] text-white font-black mb-0">SHOP</h3>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mt-2 mb-2 hover:text-white transition">Categories</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Fresh Produce</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Market Day</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Deals</a>
          </div>

          {/* Sell */}
          <div>
            <h3 className="text-[10px] text-white font-black mb-0">SELL ON OJALINE</h3>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mt-2 mb-2 hover:text-white transition">Become a Seller</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Seller Dashboard</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Seller Policies</a>
          </div>

          {/* Help */}
          <div>
            <h3 className="text-[10px] text-white font-black mb-0">HELP</h3>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mt-2 mb-2 hover:text-white transition">Support</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">FAQs</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Delivery</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Returns</a>
          </div>

          {/* Company & Legal */}
          <div>
            <h3 className="text-[10px] text-white font-black mb-0">COMPANY & LEGAL</h3>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mt-2 mb-2 hover:text-white transition">About Ojaline</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Contact</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Terms</a>
            <a href="#" className="block text-[9px] text-[#adc1b4] no-underline mb-2 hover:text-white transition">Privacy</a>
          </div>
        </div>

        <div className="max-w-[1480px] mx-auto mt-[22px] pt-[13px] border-t border-[#2a4e38] text-[8px]">
          © 2026 Ojaline. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
