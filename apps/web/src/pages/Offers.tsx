import { Button, Card, Price } from '@ojaline/design';

interface OfferRow {
  id: string;
  produce: string;
  farm: string;
  priceCents: number;
  qtyKg: number;
}

const placeholderOffers: OfferRow[] = [
  { id: '00000000-0000-4000-8000-000000000001', produce: 'Maize', farm: 'Sunshine Farms, Kaduna', priceCents: 145000, qtyKg: 5000 },
  { id: '00000000-0000-4000-8000-000000000002', produce: 'Soybeans', farm: 'Greenbelt Coop, Benue', priceCents: 320000, qtyKg: 3000 },
  { id: '00000000-0000-4000-8000-000000000003', produce: 'Cassava', farm: 'Riverside Estates, Ogun', priceCents: 87000, qtyKg: 8000 },
];

export function Offers() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: '1rem' }}>
      {placeholderOffers.map((offer) => (
        <Card key={offer.id} title={`${offer.produce} · ${offer.qtyKg} kg`}>
          <p>{offer.farm}</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Price value={offer.priceCents / 100} />
            <Button>Place hold</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
