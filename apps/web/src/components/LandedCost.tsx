import { naira } from '@ojaline/design';

export interface LandedCostLine {
  label: string;
  amountKobo: number;
}

export interface LandedCostProps {
  unitPriceKobo: number;
  qty: number;
  deliveryFeeKobo: number;
  className?: string;
}

export function LandedCost({ unitPriceKobo, qty, deliveryFeeKobo, className = '' }: LandedCostProps) {
  const itemTotal = unitPriceKobo * qty;
  const landedTotal = itemTotal + deliveryFeeKobo;

  return (
    <div className={`rounded-xl border border-border bg-white p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-text">Cost Breakdown</h3>
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-textSecondary">
            {naira.format(unitPriceKobo / 100)} x {qty}
          </span>
          <span className="font-medium">{naira.format(itemTotal / 100)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-textSecondary">Delivery fee</span>
          <span className="font-medium">{naira.format(deliveryFeeKobo / 100)}</span>
        </div>
        <div className="border-t border-border pt-2 mt-1">
          <div className="flex justify-between">
            <span className="font-semibold text-text">Landed cost</span>
            <span className="font-bold text-primary">{naira.format(landedTotal / 100)}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-primaryLight p-2.5">
        <p className="text-[11px] text-primary font-medium">
          🔒 Buyer Protection applies when you pay through Ojaline. Orders paid outside the platform forfeit refunds, dispute resolution, and delivery tracking.
        </p>
      </div>
    </div>
  );
}
