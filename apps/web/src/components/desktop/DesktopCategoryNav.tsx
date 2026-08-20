import { useNavigate } from 'react-router-dom';

const CATEGORIES = [
  { name: 'Fresh Produce' },
  { name: 'Meat & Poultry' },
  { name: 'Fish & Seafood' },
  { name: 'Grains & Cereals' },
  { name: 'Tubers' },
  { name: 'Fruits' },
  { name: 'Vegetables' },
  { name: 'Spices & Herbs' },
  { name: 'Oils & Sauces' },
];

export function DesktopCategoryNav() {
  const navigate = useNavigate();

  return (
    <nav className="bg-white border-t border-[#f3f4f3] hidden lg:flex h-[48px] items-center gap-0.5 px-[30px] overflow-x-auto scrollbar-none">
      <button
        type="button"
        onClick={() => {
          const el = document.getElementById('filter');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        className="bg-primary text-white rounded-[7px] font-extrabold text-[11px] px-[17px] py-[10px] border-none cursor-pointer hover:bg-primary-dark transition shrink-0"
      >
        ☰ &nbsp;All Categories
      </button>
      {CATEGORIES.map((cat) => (
        <button
          key={cat.name}
          type="button"
          onClick={() => navigate('/offers')}
          className="bg-white border-none text-text text-[11px] px-3 py-[13px] cursor-pointer hover:text-primary transition whitespace-nowrap shrink-0"
        >
          {cat.name}
        </button>
      ))}
      <span className="flex-1" />
      <button type="button" className="bg-white border-none text-text text-[11px] px-3 py-[13px] cursor-pointer hover:text-primary transition whitespace-nowrap shrink-0">
        ▣ Market Day
      </button>
      <button type="button" className="bg-white border-none text-[#e23b31] font-extrabold text-[11px] px-3 py-[13px] cursor-pointer hover:opacity-80 transition whitespace-nowrap shrink-0">
        ⌁ Deals
      </button>
      <button type="button" className="bg-white border-none text-text text-[11px] px-3 py-[13px] cursor-pointer hover:text-primary transition whitespace-nowrap shrink-0">
        More▾
      </button>
    </nav>
  );
}
