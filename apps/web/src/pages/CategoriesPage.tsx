import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCategories, mediaUrl, type Category } from '../lib/api';
import { Icon, type IconName } from '../components/icons';

function categoryIcon(name: string): IconName {
  const n = name.toLowerCase();
  if (n.includes('fruit') || n.includes('vegetable')) return 'leaf';
  if (n.includes('grains') || n.includes('smoked') || n.includes('dried')) return 'box';
  if (n.includes('tuber') || n.includes('root') || n.includes('swallow') || n.includes('soup')) return 'basket';
  if (n.includes('oil')) return 'tag';
  if (n.includes('spice')) return 'star';
  return 'grid';
}

function CategoryTile({ cat }: { cat: Category }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(cat.image_url) ?? '';
  return (
    <span className="flex h-full w-full flex-col items-center justify-center overflow-hidden">
      {!failed && src ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <Icon name={categoryIcon(cat.name)} size={22} />
      )}
    </span>
  );
}

export default function CategoriesPage() {
  const navigate = useNavigate();
  const [cats, setCats] = useState<Category[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((list) => {
        if (!cancelled) setCats(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full border-none bg-gray-50 text-textSecondary cursor-pointer transition hover:bg-gray-100">
          <Icon name="chevronLeft" size={16} />
        </button>
        <h1 className="flex-1 text-lg font-black tracking-tight text-text">Categories</h1>
        <span className="flex items-center gap-1.5 rounded-full bg-primary-light px-2.5 py-1 text-[10px] font-bold text-primary">
          <Icon name="categories" size={12} />
          {cats == null ? '…' : cats.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cats == null ? (
          <div className="flex flex-col items-center justify-center px-6 py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-xs font-medium text-textSecondary">Loading categories…</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4">
            {cats.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => navigate(`/offers?category_id=${cat.id}`)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white p-3 pb-3 text-center transition hover:border-primary active:scale-[0.98]"
              >
                <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-primary-light text-primary">
                  <CategoryTile cat={cat} />
                </span>
                <span className="block w-full truncate text-[11px] font-semibold leading-tight text-text">
                  {cat.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}