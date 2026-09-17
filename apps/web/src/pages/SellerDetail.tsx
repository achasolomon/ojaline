import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSellerById, type Seller } from '../lib/api';
import { SellerStorefrontView } from '../components/seller/SellerStorefrontView';

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
      <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
        <div className="h-5 w-40 animate-pulse rounded bg-surface" />
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white">
          <div className="h-24 animate-pulse bg-surface" />
          <div className="px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 animate-pulse rounded-full bg-surface" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-48 animate-pulse rounded bg-surface" />
                <div className="h-3 w-24 animate-pulse rounded bg-surface" />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-surface" />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 h-5 w-52 animate-pulse rounded bg-surface" />
        <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
        <p className="text-sm text-textSecondary">Seller not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
      {/* Breadcrumb */}
      <div className="mb-5 flex items-center gap-2 text-xs text-textSecondary">
        <span className="cursor-pointer hover:text-primary" onClick={() => navigate('/')}>Home</span>
        <span>/</span>
        <span className="text-text font-medium">{seller.full_name}</span>
      </div>

      <SellerStorefrontView
        seller={seller}
        onOpenProduct={(o) => navigate(`/offers/${o.id}`)}
        onOpenMarket={(marketId) => navigate(`/market-days/${marketId}`)}
      />
    </div>
  );
}