import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMarketById, type MarketDetail } from '../lib/api';

const SELLER_TYPE_LABELS: Record<string, string> = {
  FARMER: 'Farmers',
  MARKET_WOMAN: 'Market Women',
  STORE: 'Stores',
  PROCESSOR: 'Processors',
};

const SELLER_TYPE_ICONS: Record<string, string> = {
  FARMER: '🌾',
  MARKET_WOMAN: '🧺',
  STORE: '🏪',
  PROCESSOR: '⚙️',
};

export default function MarketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [market, setMarket] = useState<MarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('ALL');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getMarketById(id)
      .then(setMarket)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-[1480px] mx-auto px-6 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-surface rounded w-48" />
          <div className="h-8 bg-surface rounded w-64" />
          <div className="h-4 bg-surface rounded w-96" />
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="max-w-[1480px] mx-auto px-6 py-6">
        <p className="text-sm text-text-secondary">Market not found.</p>
      </div>
    );
  }

  const sellerTypes = Object.keys(market.seller_groups || {});
  const displayedSellers = activeTab === 'ALL'
    ? market.sellers
    : market.seller_groups?.[activeTab] || [];

  return (
    <div className="max-w-[1480px] mx-auto px-6 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-secondary mb-4">
        <span className="cursor-pointer hover:text-primary" onClick={() => navigate('/')}>Home</span>
        <span>/</span>
        <span className="cursor-pointer hover:text-primary" onClick={() => navigate('/market-days')}>Market Days</span>
        <span>/</span>
        <span className="text-text font-medium">{market.name}</span>
      </div>

      {/* Market header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-text">{market.name}</h1>
        <p className="text-sm text-text-secondary mt-1">
          {market.cluster_name}, {market.lga}
        </p>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-xs text-text-secondary">
            Every {market.operating_days.map((d) => d).join(', ')}
          </span>
          <span className="text-xs text-text-secondary">
            {market.sellers.length} sellers · {market.product_count} products
          </span>
        </div>
      </div>

      {/* Seller type tabs */}
      {sellerTypes.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-none pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`shrink-0 px-4 py-2 rounded-lg border text-xs font-bold transition cursor-pointer ${
              activeTab === 'ALL'
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-white text-text hover:bg-surface'
            }`}
          >
            All ({market.sellers.length})
          </button>
          {sellerTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setActiveTab(type)}
              className={`shrink-0 px-4 py-2 rounded-lg border text-xs font-bold transition cursor-pointer ${
                activeTab === type
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-white text-text hover:bg-surface'
              }`}
            >
              {SELLER_TYPE_ICONS[type]} {SELLER_TYPE_LABELS[type] || type} ({market.seller_groups[type].length})
            </button>
          ))}
        </div>
      )}

      {/* Seller cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {displayedSellers.map((seller) => (
          <article
            key={seller.id}
            className="bg-white border border-border rounded-xl p-5 hover:shadow-md transition cursor-pointer"
            onClick={() => navigate(`/sellers/${seller.id}`)}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {SELLER_TYPE_ICONS[seller.seller_type || ''] || '👤'}
              </div>
              <div>
                <h3 className="text-sm font-bold text-text">{seller.full_name}</h3>
                <p className="text-[11px] text-text-secondary">
                  {SELLER_TYPE_LABELS[seller.seller_type || ''] || seller.seller_type || 'Seller'}
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-border flex items-center justify-between">
              <span className="text-[10px] text-text-secondary">
                {market.product_count} products at this market
              </span>
              <span className="text-[10px] font-bold text-primary">View Products →</span>
            </div>
          </article>
        ))}
      </div>

      {displayedSellers.length === 0 && (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <p className="text-sm text-text-secondary">No sellers found in this category.</p>
        </div>
      )}
    </div>
  );
}
