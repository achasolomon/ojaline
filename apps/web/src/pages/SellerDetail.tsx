import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSellerById, type Seller } from '../lib/api';
import { naira } from '@ojaline/design';

const SELLER_TYPE_LABELS: Record<string, string> = {
  FARMER: 'Farmer',
  MARKET_WOMAN: 'Market Woman',
  STORE: 'Store',
  PROCESSOR: 'Processor',
};

const SELLER_TYPE_ICONS: Record<string, string> = {
  FARMER: '🌾',
  MARKET_WOMAN: '🧺',
  STORE: '🏪',
  PROCESSOR: '⚙️',
};

const PRODUCT_PLACEHOLDER_BG = 'radial-gradient(circle at 30% 45%,#e34e32 0 12%,transparent 12.5%),radial-gradient(circle at 58% 62%,#d8442f 0 13%,transparent 13.5%),radial-gradient(circle at 72% 33%,#f0a21f 0 9%,transparent 9.5%),radial-gradient(circle at 45% 25%,#69a03b 0 12%,transparent 12.5%),linear-gradient(145deg,#f4f7ef,#dfead8)';

export default function SellerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSellerById(id)
      .then(setSeller)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-[1480px] mx-auto px-6 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-surface rounded w-48" />
          <div className="h-8 bg-surface rounded w-64" />
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 bg-surface rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="max-w-[1480px] mx-auto px-6 py-6">
        <p className="text-sm text-text-secondary">Seller not found.</p>
      </div>
    );
  }

  const type = seller.seller_type || seller.profile_type || '';

  return (
    <div className="max-w-[1480px] mx-auto px-6 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-secondary mb-4">
        <span className="cursor-pointer hover:text-primary" onClick={() => navigate('/')}>Home</span>
        <span>/</span>
        <span className="text-text font-medium">{seller.full_name}</span>
      </div>

      {/* Seller profile */}
      <div className="bg-white border border-border rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center text-2xl shrink-0">
            {SELLER_TYPE_ICONS[type] || '👤'}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-black text-text">{seller.full_name}</h1>
            <p className="text-sm text-primary font-semibold">{SELLER_TYPE_LABELS[type] || type || 'Seller'}</p>
            {seller.bio && (
              <p className="text-sm text-text-secondary mt-2">{seller.bio}</p>
            )}
            {/* Markets */}
            {seller.markets.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {seller.markets.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(`/market-days/${m.id}`); }}
                    className="text-[10px] font-semibold bg-surface text-text-secondary rounded-full px-3 py-1 border border-border cursor-pointer hover:bg-primary-light hover:text-primary transition"
                  >
                    🏪 {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Products */}
      <h2 className="text-lg font-black text-text mb-4">
        Products by {seller.full_name}
        <span className="text-sm font-normal text-text-secondary ml-2">({seller.products.length})</span>
      </h2>

      {seller.products.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <p className="text-sm text-text-secondary">No products listed yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {seller.products.map((product) => (
            <article
              key={product.id}
              className="bg-white border border-border rounded-xl overflow-hidden relative group hover:shadow-md transition"
            >
              <div className="h-36 bg-cover bg-center">
                {product.primary_image?.storage_key ? (
                  <img
                    src={`/api/media/${product.primary_image.storage_key}`}
                    alt={product.product_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full" style={{ background: PRODUCT_PLACEHOLDER_BG }} />
                )}
              </div>
              <div className="p-3">
                <div className="text-xs font-bold text-text">{product.product_name}</div>
                <div className="text-[11px] text-text-secondary">{product.physical_ref}</div>
                {product.price_cents != null && (
                  <div className="text-sm font-black text-text mt-1.5">
                    {naira.format(product.price_cents / 100)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/offers/${product.id}`)}
                  className="w-full mt-2 h-8 border border-primary rounded-lg bg-white text-primary text-xs font-bold cursor-pointer hover:bg-primary-light transition"
                >
                  View Details
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
