import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function DesktopHeader() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(`/offers?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <header>
      <div className="h-1 bg-primary" />
      <div className="bg-white border-b border-border">
        <div className="max-w-[1480px] mx-auto h-[74px] grid items-center px-[30px]" style={{ gridTemplateColumns: '205px 190px minmax(300px,1fr) auto', gap: '18px' }}>
          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-[38px] h-[38px] rounded-full bg-primary text-white grid place-items-center font-black text-lg shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            </div>
            <div>
              <span className="text-[22px] font-black text-primary tracking-tight leading-none">OJALINE</span>
              <span className="block text-[8px] font-semibold text-text-secondary tracking-wide">From Farm to You</span>
            </div>
          </a>

          {/* Location */}
          <div className="text-[11px] text-text-secondary">
            <span className="text-primary text-[20px] float-left mr-2 leading-none">⌖</span>
            Deliver to
            <b className="block text-[13px] text-text mt-0.5 font-semibold">Sabo, Yaba, Lagos</b>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="h-[46px] border border-[#dfe5e1] rounded-[9px] flex overflow-hidden bg-[#fafbfa]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for produce, sellers, categories..."
              className="flex-1 border-none outline-none px-4 bg-transparent text-[13px] text-text"
            />
            <button type="submit" className="border-none bg-primary text-white px-[23px] font-extrabold text-[13px] cursor-pointer hover:bg-primary-dark transition">
              Search
            </button>
          </form>

          {/* Actions */}
          <div className="flex gap-4 items-center">
            <button type="button" onClick={() => navigate('/offers/new')} className="text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition">
              <span className="text-[19px] mr-1">♧</span>Sell
            </button>
            <button type="button" className="text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition">
              <span className="text-[19px] mr-1">?</span>Help
            </button>
            <button type="button" className="relative text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition">
              <span className="text-[19px] mr-1">♧</span>Notifications<sup className="absolute -top-1 -right-1 bg-[#df3535] text-white rounded-full px-1 py-px text-[8px] leading-none not-italic">3</sup>
            </button>
            <button type="button" className="text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition">
              <span className="text-[19px] mr-1">▢</span>Messages
            </button>
            <button type="button" className="relative text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition">
              <span className="text-[19px] mr-1">🛒</span>Cart<sup className="absolute -top-1 -right-1 bg-[#df3535] text-white rounded-full px-1 py-px text-[8px] leading-none not-italic">2</sup>
            </button>
            <button type="button" className="text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition">
              <span className="text-[19px] mr-1">♙</span>Account▾
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
