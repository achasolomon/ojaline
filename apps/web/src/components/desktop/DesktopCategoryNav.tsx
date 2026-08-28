import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCategories, type Category } from '../../lib/api';

export function DesktopCategoryNav() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  return (
    <nav className="bg-white border-t border-[#f3f4f3] hidden lg:flex h-[64px] items-center gap-2 px-[30px] overflow-x-auto scrollbar-none">
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
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => navigate(`/offers?category_id=${cat.id}`)}
          className="flex items-center gap-1.5 bg-white border-none text-text text-[11px] px-2 py-1.5 cursor-pointer hover:text-primary transition whitespace-nowrap shrink-0 rounded-lg hover:bg-surface"
        >
          {cat.image_url ? (
            <img
              src={`/api/media/${cat.image_url}`}
              alt={cat.name}
              className="w-7 h-7 rounded-md object-cover"
            />
          ) : (
            <span className="w-7 h-7 rounded-md bg-surface flex items-center justify-center text-sm">📦</span>
          )}
          {cat.name}
        </button>
      ))}
      <span className="flex-1" />
      <button type="button" onClick={() => navigate('/market-days')} className="bg-white border-none text-text text-[11px] px-3 py-[13px] cursor-pointer hover:text-primary transition whitespace-nowrap shrink-0">
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
