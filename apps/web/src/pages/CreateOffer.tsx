import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, FormField } from '@ojaline/design';
import {
  createOffer,
  getMe,
  getSellerStatus,
  registerSeller,
  submitSellerKyc,
  type Channel,
  type Perishability,
  type FulfilmentMode,
  type SellerType,
  type SellerStatus,
  type KycStatus,
} from '../lib/api';
import { getStates } from '../lib/addresses';
import { getSession, saveSession, type SessionSnapshot } from '../lib/session';

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'RETAILER', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'DIRECT', label: 'Direct' },
  { value: 'OPEN', label: 'Open' },
];

const CLUSTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'd1000000-0000-4000-8000-000000000001', label: 'Yaba' },
  { value: 'd1000000-0000-4000-8000-000000000002', label: 'Surulere' },
  { value: 'd1000000-0000-4000-8000-000000000003', label: 'Ikeja' },
];

const PERISHABILITY_OPTIONS: { value: Perishability; label: string; description: string }[] = [
  { value: 'SHELF_GT_7D', label: 'Shelf 7+ days', description: 'Grains, tubers, dried goods' },
  { value: 'SHELF_LT_7D', label: 'Perishable (< 7 days)', description: 'Fresh produce, vegetables' },
];

const FULFILMENT_MODES: { value: FulfilmentMode; label: string }[] = [
  { value: 'INSTANT', label: 'Instant (2-3h)' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'MARKET_DAY', label: 'Market Day' },
];

const SELLER_TYPE_OPTIONS: { value: SellerType; label: string; description: string }[] = [
  { value: 'FARMER', label: 'Farmer', description: 'I grow what I sell' },
  { value: 'MARKET_WOMAN', label: 'Market Woman / Trader', description: 'I buy and resell at the market' },
  { value: 'STORE', label: 'Store Owner', description: 'I run a shop or stall' },
  { value: 'PROCESSOR', label: 'Processor', description: 'I process raw goods (rice, oil, flour…) into sellable form' },
];

const ID_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'NIN', label: 'National ID (NIN)' },
  { value: 'BVN', label: 'Bank Verification Number (BVN)' },
  { value: 'DRIVERS_LICENCE', label: "Driver's Licence" },
  { value: 'PASSPORT', label: 'International Passport' },
  { value: 'VOTERS_CARD', label: "Voter's Card" },
];

export default function CreateOffer() {
  const session = useMemo(() => getSession(), []);
  const navigate = useNavigate();

  if (!session) return null; // RequireAuth owns the redirect for anonymous users.

  return <CreateOfferGate key={`${session.user.id}:${session.token}`} session={session} navigate={navigate} />;
}

/* ── Gate: is this user a seller? New sellers register a BASIC profile here. ── */

function CreateOfferGate({ session, navigate }: { session: SessionSnapshot; navigate: ReturnType<typeof useNavigate> }) {
  const { token } = session;
  const [status, setStatus] = useState<SellerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): Promise<SellerStatus | null> => {
    setError(null);
    return getSellerStatus(token).then(
      (s) => {
        setStatus(s);
        return s;
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not check your seller status');
        return null;
      },
    );
  };
  useEffect(() => {
    void load();
  }, [token]);

  if (error) {
    return (
      <PageShell title="Create Offer" subtitle="Sell your produce or products on Ojaline">
        <div className="flex-1 px-4 py-5 lg:px-0 lg:py-8">
          <p className="text-sm text-danger">{error}</p>
          <div className="mt-4">
            <Button onClick={load}>Retry</Button>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!status) {
    return (
      <PageShell title="Create Offer" subtitle="Sell your produce or products on Ojaline">
        <div className="flex-1 px-4 py-5 lg:px-0 lg:py-8">
          <p className="text-sm text-textSecondary">Checking your seller status…</p>
        </div>
      </PageShell>
    );
  }

  if (!status.seller_type) {
    return <SellerRegisterForm session={session} onRegistered={setStatus} />;
  }

  return <SellerArea session={session} status={status} onRefresh={load} navigate={navigate} />;
}

/* ── Seller: offer form + optional identity (FULL tier) step ── */

function SellerArea({
  session,
  status: initialStatus,
  onRefresh: reloadStatus,
  navigate,
}: {
  session: SessionSnapshot;
  status: SellerStatus;
  onRefresh: () => Promise<SellerStatus | null>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [status, setStatus] = useState<SellerStatus>(initialStatus);
  const [view, setView] = useState<'offer' | 'kyc' | 'form'>('offer');
  const identityStatus: KycStatus | null = status.kyc?.status ?? null;

  const refresh = () =>
    reloadStatus().then((s) => {
      if (s) {
        setStatus(s);
        if (s.kyc?.status === 'APPROVED') setView('offer');
      }
    });

  const done = (next: SellerStatus) => {
    setStatus(next);
    setView('offer');
  };

  if (view === 'kyc') {
    if (identityStatus === 'PENDING') {
      return <KycPendingView session={session} onRefresh={refresh} onBack={() => setView('offer')} />;
    }
    if (identityStatus === 'REJECTED') {
      return (
        <KycRejectedView
          session={session}
          reviewNote={status.kyc?.review_note ?? null}
          onResubmit={() => setView('form')}
          onBack={() => setView('offer')}
        />
      );
    }
    // No submission yet — collect identity.
    return <KycForm session={session} onSubmitted={done} onBack={() => setView('offer')} />;
  }

  if (view === 'form') {
    // Resubmitting after a rejection — collect identity again.
    return <KycForm session={session} onSubmitted={done} onBack={() => setView('offer')} />;
  }

  return (
    <div>
      <IdentityBanner kyc={status.kyc} onStartKyc={() => setView('kyc')} />
      <OfferForm session={session} navigate={navigate} />
    </div>
  );
}

function IdentityBanner({
  kyc,
  onStartKyc,
}: {
  kyc: { status: KycStatus; review_note: string | null } | null;
  onStartKyc: () => void;
}) {
  const approved = kyc?.status === 'APPROVED';

  if (approved) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 pt-4 lg:px-6">
        <div className="flex items-center gap-3 rounded-xl border border-primary bg-primaryLight px-4 py-3">
          <span className="text-sm font-semibold text-primary">Verified seller</span>
          <p className="text-xs text-textSecondary">Identity approved — you're eligible for payouts and promotions.</p>
        </div>
      </div>
    );
  }

  const pending = kyc?.status === 'PENDING';
  const rejected = kyc?.status === 'REJECTED';
  const title = rejected ? 'Identity verification was not approved' : pending ? 'Identity verification in review' : 'Finish verification to unlock more as a seller';
  const body = rejected
    ? (kyc?.review_note ?? 'Review the reason and resubmit. You can keep selling while you sort it out.')
    : pending
      ? 'Your documents are with our team — usually approved in under a day.'
      : 'You can list offers now. Add your government ID to get the Verified badge, receive payouts and use Ad Studio.';
  const tone = rejected ? 'border-danger bg-danger/5 text-danger' : 'border-border bg-white';

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-4 lg:px-6">
      <div className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center ${tone}`}>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${rejected ? 'text-danger' : 'text-text'}`}>{title}</p>
          <p className="text-xs text-textSecondary">{body}</p>
        </div>
        <Button size="sm" variant={rejected ? 'danger' : 'secondary'} onClick={onStartKyc}>
          {pending ? 'Check status' : rejected ? 'Fix & resubmit' : 'Complete verification'}
        </Button>
      </div>
    </div>
  );
}

/* ── Tier 1: basic seller registration (no documents) ── */

function SellerRegisterForm({
  session,
  onRegistered,
}: {
  session: SessionSnapshot;
  onRegistered: (s: SellerStatus) => void;
}) {
  const { token } = session;
  const [sellerType, setSellerType] = useState<SellerType>('FARMER');
  const [businessName, setBusinessName] = useState('');
  const [marketName, setMarketName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Lagos');
  const [lga, setLga] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!city.trim()) return setError('Tell us which city you sell from');
    if (!state) return setError('Select your state');

    setSubmitting(true);
    try {
      const result = await registerSeller(token, {
        seller_type: sellerType,
        business_name: businessName.trim() || undefined,
        market_name: marketName.trim() || undefined,
        city: city.trim(),
        state,
        lga: lga.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      // Keep the session user in sync so headers/account switch to pickup mode.
      const fresh = await getMe(token);
      if (fresh.id === session.user.id) saveSession({ token, user: fresh });
      onRegistered(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-primary';

  return (
    <PageShell title="Become a Seller" subtitle="It only takes a minute — verification comes later">
      <div className="flex-1 px-4 py-5 lg:px-6 lg:py-8">
        <div className="lg:mx-auto lg:w-full lg:max-w-[780px]">
          <div className="mb-5 rounded-xl border border-primary bg-primaryLight p-4 lg:mb-6 lg:p-5">
            <h2 className="text-sm font-semibold text-primary">Tell us about your business</h2>
            <p className="mt-1 text-xs text-textSecondary">
              You can start listing offers with just your account details and a few facts about where you operate.
              A full identity check is optional until you need payouts, the Verified badge or promotions.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 lg:gap-5 lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:p-6"
          >
            <FormField label="What best describes you?">
              <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
                {SELLER_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition ${
                      sellerType === opt.value ? 'border-primary bg-primaryLight' : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      name="seller_type"
                      checked={sellerType === opt.value}
                      onChange={() => setSellerType(opt.value)}
                      className="w-4 h-4 text-primary"
                    />
                    <div>
                      <span className="text-sm font-medium">{opt.label}</span>
                      <p className="text-xs text-textSecondary">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </FormField>

            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-3">
              <FormField label="Business Name (optional)">
                <Input
                  placeholder="e.g. Adebola Fresh Farms"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </FormField>
              <FormField label="Market / Stall (optional)">
                <Input
                  placeholder="e.g. Mile 12, Stall 45"
                  value={marketName}
                  onChange={(e) => setMarketName(e.target.value)}
                />
              </FormField>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
              <FormField label="City" className="sm:flex-1">
                <Input
                  placeholder="e.g. Ikeja"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </FormField>
              <FormField label="State" className="sm:flex-1">
                <select className={inputCls} value={state} onChange={(e) => setState(e.target.value)}>
                  {getStates().map((s) => (
                    <option key={s.state} value={s.state}>{s.state}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="Local Government Area (optional)">
              <Input
                placeholder="e.g. Ikeja"
                value={lga}
                onChange={(e) => setLga(e.target.value)}
              />
            </FormField>

            <FormField label="Short Bio (optional)">
              <Input
                placeholder="What makes you a great seller?"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </FormField>

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button type="submit" size="lg" loading={submitting} disabled={submitting}>
              Start Selling
            </Button>
            <p className="text-center text-xs text-textSecondary">
              You can add your identity document (for payouts & the Verified badge) later.
            </p>
          </form>
        </div>
      </div>
    </PageShell>
  );
}

/* ── Tier 2: full identity (KYC) submission ── */

function KycForm({
  session,
  onSubmitted,
  onBack,
}: {
  session: SessionSnapshot;
  onSubmitted: (s: SellerStatus) => void;
  onBack: () => void;
}) {
  const { token } = session;
  const [idType, setIdType] = useState('NIN');
  const [idNumber, setIdNumber] = useState('');
  const [dob, setDob] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Lagos');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!idNumber.trim()) return setError('Your ID number is required');
    if (!dob) return setError('Your date of birth is required');
    if (!addressLine1.trim() || !city.trim()) return setError('Your registered address is required');

    setSubmitting(true);
    try {
      const result = await submitSellerKyc(token, {
        id_type: idType,
        id_number: idNumber.trim(),
        date_of_birth: dob,
        address_line1: addressLine1.trim(),
        city: city.trim(),
        state,
      });
      onSubmitted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-primary';

  return (
    <PageShell title="Verify Your Identity" subtitle="One short step, then you unlock everything">
      <div className="flex-1 px-4 py-5 lg:px-6 lg:py-8">
        <div className="lg:mx-auto lg:w-full lg:max-w-[700px]">
          <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline lg:hidden">
            ← Back to offer
          </button>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 lg:gap-5 lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:p-6"
          >
            <FormField label="Your Identity Document">
              <select className={inputCls} value={idType} onChange={(e) => setIdType(e.target.value)}>
                {ID_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FormField>

            <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
              <FormField label="ID Number" className="sm:flex-1">
                <Input
                  placeholder="e.g. 12345678901"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                />
              </FormField>
              <FormField label="Date of Birth" className="sm:flex-1">
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </FormField>
            </div>

            <FormField label="Registered Address">
              <Input
                placeholder="e.g. 15 Murtala Mohammed Way"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
              />
            </FormField>

            <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
              <FormField label="City" className="sm:flex-1">
                <Input
                  placeholder="e.g. Ikeja"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </FormField>
              <FormField label="State" className="sm:flex-1">
                <select className={inputCls} value={state} onChange={(e) => setState(e.target.value)}>
                  {getStates().map((s) => (
                    <option key={s.state} value={s.state}>{s.state}</option>
                  ))}
                </select>
              </FormField>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button type="submit" size="lg" loading={submitting} disabled={submitting}>
              Submit for Verification
            </Button>
            <p className="text-center text-xs text-textSecondary">
              Our team reviews every application before it counts as verified.
            </p>
          </form>
        </div>
      </div>
    </PageShell>
  );
}

function KycPendingView({
  session,
  onRefresh,
  onBack,
}: {
  session: SessionSnapshot;
  onRefresh: () => void;
  onBack: () => void;
}) {
  return (
    <PageShell title="Verification In Progress" subtitle="A quick review, then you unlock everything">
      <div className="flex-1 px-4 py-5 lg:px-6 lg:py-10">
        <div className="lg:mx-auto lg:w-full lg:max-w-md">
          <div className="rounded-xl border border-border p-5 text-center lg:rounded-2xl lg:bg-white lg:p-8">
            <h2 className="text-base font-semibold">We're reviewing your identity, {session.user.full_name.split(' ')[0]}.</h2>
            <p className="mt-2 text-sm text-textSecondary">
              Your documents are being checked by our team — usually approved in under a day. Meanwhile you can keep
              selling: verified status mainly unlocks payouts, the Verified badge and promotions.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <Button variant="secondary" onClick={onRefresh}>
                Check Status
              </Button>
              <Button variant="ghost" onClick={onBack}>
                Back to Offer
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function KycRejectedView({
  session,
  reviewNote,
  onResubmit,
  onBack,
}: {
  session: SessionSnapshot;
  reviewNote: string | null;
  onResubmit: () => void;
  onBack: () => void;
}) {
  return (
    <PageShell title="Verification Not Approved" subtitle="Let's get this sorted">
      <div className="flex-1 px-4 py-5 lg:px-6 lg:py-10">
        <div className="lg:mx-auto lg:w-full lg:max-w-md">
          <div className="rounded-xl border border-danger p-5 lg:rounded-2xl lg:bg-white lg:p-8">
            <h2 className="text-base font-semibold text-danger">We couldn't verify your identity, {session.user.full_name.split(' ')[0]}.</h2>
            {reviewNote && <p className="mt-2 text-sm text-textSecondary">Reason: {reviewNote}</p>}
            <p className="mt-2 text-sm text-textSecondary">
              Double-check your details and resubmit — most rejections are just a typo in the ID number. You can keep
              selling in the meantime.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <Button onClick={onResubmit}>Resubmit Application</Button>
              <Button variant="ghost" onClick={onBack}>
                Back to Offer
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

/* ── The offer form itself (BASIC tier and up) ── */

function OfferForm({
  session,
  navigate,
}: {
  session: SessionSnapshot;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { user } = session;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [productName, setProductName] = useState('');
  const [physicalRef, setPhysicalRef] = useState('');
  const [unit, setUnit] = useState('');
  const [priceNaira, setPriceNaira] = useState('');
  const [channel, setChannel] = useState<Channel>('RETAILER');
  const [availableQty, setAvailableQty] = useState('');
  const [minOrderQty, setMinOrderQty] = useState('1');
  const [perishability, setPerishability] = useState<Perishability>('SHELF_GT_7D');
  const [fulfilmentModes, setFulfilmentModes] = useState<FulfilmentMode[]>(['INSTANT']);
  const [clusterId, setClusterId] = useState(CLUSTER_OPTIONS[0].value);

  const toggleFulfilment = (mode: FulfilmentMode) => {
    setFulfilmentModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!productName.trim()) return setError('Product name is required');
    if (!physicalRef.trim()) return setError('Physical reference is required');
    const price = Math.round(parseFloat(priceNaira) * 100);
    if (isNaN(price) || price <= 0) return setError('Price must be a positive number');
    const qty = parseInt(availableQty, 10);
    if (isNaN(qty) || qty <= 0) return setError('Available quantity must be positive');
    const minQty = parseInt(minOrderQty, 10);
    if (isNaN(minQty) || minQty <= 0) return setError('Min order quantity must be positive');
    if (fulfilmentModes.length === 0) return setError('Select at least one fulfilment mode');

    setSubmitting(true);
    try {
      await createOffer({
        seller_id: user.id,
        product_name: productName.trim(),
        physical_ref: physicalRef.trim(),
        channel,
        available_qty: qty,
        min_order_qty: minQty,
        perishability,
        fulfilment_modes: fulfilmentModes,
        cluster_id: clusterId,
        price_cents: price,
        unit: unit.trim() || undefined,
      });
      navigate('/offers');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create offer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title="Create Offer" subtitle="List a new offer on the marketplace">
      <div className="flex-1 px-4 py-5 lg:px-6 lg:py-8">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-[1100px] lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6"
        >
          {/* Product + logistics */}
          <div className="flex flex-col gap-4">
            <section className="lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:p-6">
              <h2 className="mb-4 hidden text-sm font-black text-text lg:block">Product details</h2>
              <div className="flex flex-col gap-4">
                <FormField label="Product Name">
                  <Input
                    placeholder="e.g. Fresh Tomatoes"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                  />
                </FormField>

                <FormField label="Physical Reference">
                  <Input
                    placeholder="e.g. Grade A, Ibadan origin"
                    value={physicalRef}
                    onChange={(e) => setPhysicalRef(e.target.value)}
                  />
                </FormField>

                <FormField label="Measurement Unit (per unit)">
                  <Input
                    placeholder="e.g. basket, trailer, crate, bag, bunch"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-textSecondary">
                    What each unit of this product is measured in, e.g. basket of yam, crate of tomatoes.
                  </p>
                </FormField>

                <FormField label="Price (Naira per unit)">
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="e.g. 1200"
                    value={priceNaira}
                    onChange={(e) => setPriceNaira(e.target.value)}
                  />
                </FormField>

                <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
                  <FormField label="Available Qty" className="sm:flex-1">
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g. 500"
                      value={availableQty}
                      onChange={(e) => setAvailableQty(e.target.value)}
                    />
                  </FormField>
                  <FormField label="Min Order Qty" className="sm:flex-1">
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g. 10"
                      value={minOrderQty}
                      onChange={(e) => setMinOrderQty(e.target.value)}
                    />
                  </FormField>
                </div>
              </div>
            </section>

            <section className="lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:p-6">
              <h2 className="mb-4 hidden text-sm font-black text-text lg:block">Delivery &amp; channel</h2>
              <div className="flex flex-col gap-4">
                <FormField label="Cluster">
                  <div className="flex flex-wrap gap-2">
                    {CLUSTER_OPTIONS.map((cl) => (
                      <button
                        key={cl.value}
                        type="button"
                        onClick={() => setClusterId(cl.value)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                          clusterId === cl.value
                            ? 'border-primary bg-primaryLight text-primary'
                            : 'border-border text-textSecondary'
                        }`}
                      >
                        {cl.label}
                      </button>
                    ))}
                  </div>
                </FormField>

                <FormField label="Channel">
                  <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
                    {CHANNELS.map((ch) => (
                      <label
                        key={ch.value}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition ${
                          channel === ch.value ? 'border-primary bg-primaryLight' : 'border-border'
                        }`}
                      >
                        <input
                          type="radio"
                          name="channel"
                          checked={channel === ch.value}
                          onChange={() => setChannel(ch.value)}
                          className="w-4 h-4 text-primary"
                        />
                        <span className="text-sm font-medium">{ch.label}</span>
                      </label>
                    ))}
                  </div>
                </FormField>

                <FormField label="Perishability">
                  <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
                    {PERISHABILITY_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition ${
                          perishability === opt.value ? 'border-primary bg-primaryLight' : 'border-border'
                        }`}
                      >
                        <input
                          type="radio"
                          name="perishability"
                          checked={perishability === opt.value}
                          onChange={() => setPerishability(opt.value)}
                          className="w-4 h-4 text-primary"
                        />
                        <div>
                          <span className="text-sm font-medium">{opt.label}</span>
                          <p className="text-xs text-textSecondary">{opt.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </FormField>

                <FormField label="Fulfilment Modes">
                  <div className="flex flex-wrap gap-2">
                    {FULFILMENT_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => toggleFulfilment(mode.value)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                          fulfilmentModes.includes(mode.value)
                            ? 'border-primary bg-primaryLight text-primary'
                            : 'border-border text-textSecondary'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </FormField>
              </div>
            </section>
          </div>

          {/* Sticky summary (desktop) */}
          <aside className="lg:sticky lg:top-[136px] lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:p-5">
            <h2 className="hidden text-sm font-black text-text lg:block">Offer summary</h2>
            <div className="mt-0 flex flex-col gap-4 lg:mt-4">
              <FormField label="Selling As">
                <div className="rounded-lg border border-border px-3 py-3">
                  <p className="text-sm font-medium">{user.full_name}</p>
                  <p className="text-xs text-textSecondary">Listed under your verified seller profile.</p>
                </div>
              </FormField>

              {error && <p className="text-sm text-danger">{error}</p>}

              <Button type="submit" size="lg" loading={submitting} disabled={submitting}>
                Create Offer
              </Button>
              <p className="text-center text-xs text-textSecondary">
                Buyers can see this offer the moment it goes live.
              </p>
            </div>
          </aside>
        </form>
      </div>
    </PageShell>
  );
}

/* ── Shared page chrome ── */

function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="flex h-full min-h-full flex-col bg-white lg:bg-surface/40">
      {/* Mobile top bar — desktop gets its chrome from DesktopLayout. */}
      <header className="flex items-center gap-3 border-b border-border bg-white/95 px-4 py-3 lg:hidden">
        <button type="button" onClick={() => navigate(-1)} className="p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </header>

      {/* Desktop heading row */}
      <div className="hidden lg:block">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 px-6 pt-8">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-black tracking-tight text-text">{title}</h1>
          {subtitle && <p className="text-sm text-textSecondary">{subtitle}</p>}
        </div>
      </div>

      {children}
    </div>
  );
}