import { Button, Card } from '@ojaline/design';

export function Landing() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Card title="Ojaline">
        <p>Farm-to-market escrow marketplace. Sellers post offers; buyers hold, pay and receive via verified agents.</p>
        <p>Phase 1 skeleton — buyer/seller/farmer web and Ops dashboard land in Sprint 1.</p>
      </Card>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
        <a href="/offers"><Button>Browse offers</Button></a>
        <a href="/login"><Button variant="ghost">Sign in</Button></a>
      </div>
    </div>
  );
}
