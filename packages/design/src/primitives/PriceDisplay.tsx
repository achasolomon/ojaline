import { naira } from '../format';

export interface PriceDisplayProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeStyles: Record<NonNullable<PriceDisplayProps['size']>, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl font-bold',
};

export function PriceDisplay({ amount, size = 'md', className = '' }: PriceDisplayProps) {
  return (
    <span className={`text-primary ${sizeStyles[size]} ${className}`}>
      {naira.format(amount)}
    </span>
  );
}
