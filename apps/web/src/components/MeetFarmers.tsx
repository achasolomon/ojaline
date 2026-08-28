import { useNavigate } from 'react-router-dom';
import type { TopSeller } from '../lib/api';

const SELLER_STORIES = [
  {
    name: 'Adebola Akinwale',
    role: 'Farmer',
    location: 'Oyo State',
    quote: 'I wake up 4am every market day. Fresh tatashe must reach Yaba before sunrise.',
    emoji: '🌾',
  },
  {
    name: 'Bisi Olatunji',
    role: 'Market Woman',
    location: 'Mile 12, Lagos',
    quote: 'My crayfish dey come from the finest fishermen for the south-south. Quality no dey lie.',
    emoji: '🧺',
  },
  {
    name: 'Chidi Eze',
    role: 'Store Owner',
    location: 'Ikeja, Lagos',
    quote: 'I stock okporoko, iru and garri — everything my customers need for authentic soup.',
    emoji: '🏪',
  },
];

interface MeetFarmersProps {
  sellers?: TopSeller[];
}

export function MeetFarmers({ sellers = [] }: MeetFarmersProps) {
  const navigate = useNavigate();

  return (
    <div className="pb-5">
      <div className="flex justify-between items-center px-4 pb-3">
        <div>
          <h3 className="text-base font-semibold">Meet Our Sellers</h3>
          <p className="text-[11px] text-textSecondary mt-0.5">Real people behind every product</p>
        </div>
      </div>
      <div className="flex gap-3 px-4 overflow-x-auto scrollbar-none">
        {SELLER_STORIES.map((story, i) => {
          const seller = sellers[i];
          return (
            <button
              key={story.name}
              type="button"
              onClick={() => seller && navigate(`/sellers/${seller.id}`)}
              className="min-w-[220px] max-w-[240px] bg-white border border-border rounded-xl p-3.5 cursor-pointer shrink-0 text-left transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="w-11 h-11 rounded-full bg-primary-light flex items-center justify-center text-xl">
                  {story.emoji}
                </div>
                <div>
                  <div className="text-[12px] font-bold text-text">{story.name}</div>
                  <div className="text-[10px] text-textSecondary">{story.role} · {story.location}</div>
                </div>
              </div>
              <p className="text-[11px] text-textSecondary italic leading-relaxed">"{story.quote}"</p>
              {seller && (
                <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
                  <span className="text-[10px] text-[#d48d09]">★ {Number(seller.avg_rating).toFixed(1)}</span>
                  <span className="text-[9px] text-textSecondary">· {seller.review_count} reviews</span>
                  {seller.market_name && (
                    <span className="text-[9px] text-textSecondary">· {seller.market_name}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
