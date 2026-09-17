import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, FormField } from '@ojaline/design';
import {
  createOffer,
  getMe,
  getSellerStatus,
  registerSeller,
  submitSellerKyc,
  getCategories,
  getStates as getClusterStates,
  getLgas,
  getClusters,
  getMarkets,
  mediaUrl,
  type Channel,
  type Perishability,
  type FulfilmentMode,
  type SellerType,
  type SellerStatus,
  type KycStatus,
  type Category,
  type Cluster,
  type Market,
  type StateLocation,
  type LgaLocation,
} from '../lib/api';
import { getStates } from '../lib/addresses';
import { getSession, saveSession, type SessionSnapshot } from '../lib/session';
import { MediaPicker, type MediaEntry } from '../components/seller/MediaPicker';
import { Icon } from '../components/icons';

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'RETAILER', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'DIRECT', label: 'Direct' },
  { value: 'OPEN', label: 'Open' },
];

const UNIT_OPTIONS: string[] = [
  'kg', 'g', 'tonne', 'bag', 'basket', 'crate', 'bunch', 'piece', 'dozen',
  'bottle', 'litre', 'carton', 'tin', 'mudu', 'pile', 'bowl', 'wrap', 'bundle', 'pack', 'sachet',
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

const inputCls =
  'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-primary';

const fmtNaira = (cents: number) => `₦${(cents / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

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
      <PageShell title="List a Product" subtitle="Sell your produce or products on Ojaline">
        <p className="text-sm text-danger">{error}</p>
        <div className="mt-4">
          <Button onClick={load}>Retry</Button>
        </div>
      </PageShell>
    );
  }

  if (!status) {
    return (
      <PageShell title="List a Product" subtitle="Sell your produce or products on Ojaline">
        <p className="text-sm text-textSecondary">Checking your seller status…</p>
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
      <OfferWizard session={session} navigate={navigate} />
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

  return (
    <PageShell title="Become a Seller" subtitle="It only takes a minute — verification comes later">
      <div className="rounded-2xl border border-primary bg-primaryLight p-4 lg:p-5">
        <h2 className="text-sm font-semibold text-primary">Tell us about your business</h2>
        <p className="mt-1 text-xs text-textSecondary">
          You can start listing offers with just your account details and a few facts about where you operate.
          A full identity check is optional until you need payouts, the Verified badge or promotions.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-5 flex flex-col gap-4 lg:gap-5 lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:p-6"
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

  return (
    <PageShell title="Verify Your Identity" subtitle="One short step, then you unlock everything">
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline lg:hidden">
        ← Back to offer
      </button>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 lg:gap-5 lg:max-w-[700px] lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:p-6"
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
      <div className="max-w-md rounded-xl border border-border p-5 text-center lg:rounded-2xl lg:bg-white lg:p-8">
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
      <div className="max-w-md rounded-xl border border-danger p-5 lg:rounded-2xl lg:bg-white lg:p-8">
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
    </PageShell>
  );
}

/* ── The offer wizard (BASIC tier and up) ── */

const STEPS = ['Describe', 'Price & location', 'Review'];

function OfferWizard({ session, navigate }: { session: SessionSnapshot; navigate: ReturnType<typeof useNavigate> }) {
  const { user } = session;

  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 1 — the product itself.
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [productName, setProductName] = useState('');
  const [physicalRef, setPhysicalRef] = useState('');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<MediaEntry[]>([]);

  // Step 2 — pricing, stock & location.
  const [unit, setUnit] = useState('kg');
  const [otherUnit, setOtherUnit] = useState('');
  const [priceNaira, setPriceNaira] = useState('');
  const [availableQty, setAvailableQty] = useState('');
  const [minOrderQty, setMinOrderQty] = useState('1');
  const [channel, setChannel] = useState<Channel>('RETAILER');
  const [perishability, setPerishability] = useState<Perishability>('SHELF_GT_7D');
  const [perishOverridden, setPerishOverridden] = useState(false);
  const [fulfilmentModes, setFulfilmentModes] = useState<FulfilmentMode[]>(['INSTANT']);

  const [states, setStates] = useState<StateLocation[]>([]);
  const [stateName, setStateName] = useState('');
  const [lgas, setLgas] = useState<LgaLocation[]>([]);
  const [lga, setLga] = useState('');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterId, setClusterId] = useState('');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketId, setMarketId] = useState('');

  useEffect(() => {
    void getCategories().then(setCategories, () => {});
    void getClusterStates().then(setStates, () => {});
  }, []);

  useEffect(() => {
    if (!stateName) return setLgas([]);
    void getLgas(stateName).then(setLgas, () => setLgas([]));
  }, [stateName]);

  useEffect(() => {
    if (!stateName || !lga) return setClusters([]);
    void getClusters(stateName, lga).then(setClusters, () => setClusters([]));
  }, [stateName, lga]);

  useEffect(() => {
    if (!clusterId) return setMarkets([]);
    void getMarkets(clusterId).then(setMarkets, () => setMarkets([]));
  }, [clusterId]);

  const categoryOptions = useMemo(() => {
    const out: { id: string; label: string; defaultPerish: Perishability }[] = [];
    for (const top of categories) {
      out.push({ id: top.id, label: top.name, defaultPerish: top.perishability_default });
      for (const child of top.children ?? []) {
        out.push({ id: child.id, label: `${top.name} · ${child.name}`, defaultPerish: child.perishability_default });
      }
    }
    return out;
  }, [categories]);

  const selectedCategory = categoryOptions.find((c) => c.id === categoryId);

  const handleCategory = (id: string) => {
    setCategoryId(id);
    const cat = categoryOptions.find((c) => c.id === id);
    if (cat && !perishOverridden) setPerishability(cat.defaultPerish);
  };

  const handleState = (value: string) => {
    setStateName(value);
    setLga('');
    setClusterId('');
    setMarketId('');
  };
  const handleLga = (value: string) => {
    setLga(value);
    setClusterId('');
    setMarketId('');
  };
  const handleCluster = (value: string) => {
    setClusterId(value);
    setMarketId('');
  };

  const toggleFulfilment = (mode: FulfilmentMode) => {
    setFulfilmentModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const effectiveUnit = unit === 'OTHER' ? otherUnit.trim() : unit;
  const selectedCluster = clusters.find((c) => c.id === clusterId);
  const selectedMarket = markets.find((m) => m.id === marketId);
  const needsMarket = fulfilmentModes.includes('MARKET_DAY');

  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!categoryId) return 'Choose a category first';
      if (!productName.trim()) return 'Give your product a name';
      if (!physicalRef.trim()) return 'Add a short grade or quality detail (e.g. "Grade A, freshly harvested")';
      if (!description.trim()) return 'Add a short description — buyers trust listings that explain the product';
      if (media.length < 2) return `Add at least ${2 - media.length} more photo${2 - media.length === 1 ? '' : 's'}`;
      return null;
    }
    const price = Math.round(parseFloat(priceNaira) * 100);
    if (isNaN(price) || price <= 0) return 'Price must be a positive number';
    const qty = parseInt(availableQty, 10);
    if (isNaN(qty) || qty <= 0) return 'Available quantity must be a positive number';
    const minQty = parseInt(minOrderQty, 10);
    if (isNaN(minQty) || minQty <= 0) return 'Min order quantity must be a positive number';
    if (!effectiveUnit) return 'Choose a unit or type your own';
    if (fulfilmentModes.length === 0) return 'Select at least one fulfilment mode';
    if (!clusterId) return 'Choose where you sell from';
    if (needsMarket && !marketId) return 'Market Day needs a market — pick the one you sell at';
    return null;
  };

  const next = () => {
    const err = validateStep(step);
    setStepError(err);
    if (err) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    const err = validateStep(2);
    setSubmitError(err);
    if (err) return;
    setSubmitting(true);
    try {
      await createOffer({
        seller_id: user.id,
        product_name: productName.trim(),
        physical_ref: physicalRef.trim(),
        description: description.trim(),
        channel,
        available_qty: parseInt(availableQty, 10),
        min_order_qty: parseInt(minOrderQty, 10),
        perishability,
        fulfilment_modes: fulfilmentModes,
        cluster_id: clusterId,
        price_cents: Math.round(parseFloat(priceNaira) * 100),
        unit: effectiveUnit,
        category_id: categoryId,
        market_id: marketId || undefined,
        media_keys: media.map((m) => m.storage_key),
      });
      navigate('/seller/products', { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create the listing. Please try again.');
      setSubmitting(false);
    }
  };

  const displayError = step === STEPS.length - 1 ? submitError : stepError;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-2 md:px-6 md:pb-12 md:pt-4">
      <StepBar current={step} />

      {step === 0 && (
        <section className="mt-5 flex flex-col gap-4 lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:p-6">
          <div>
            <h2 className="text-sm font-black text-text">What are you selling?</h2>
            <p className="mt-0.5 text-xs text-textSecondary">Start with the basics — you can fine-tune location and delivery next.</p>
          </div>

          <FormField label="Category">
            <select className={inputCls} value={categoryId} onChange={(e) => handleCategory(e.target.value)}>
              <option value="">Choose a category…</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Product Name">
            <Input
              placeholder="e.g. Fresh Tomatoes"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </FormField>

          <FormField label="Grade / Quality">
            <Input
              placeholder="e.g. Grade A, freshly harvested"
              value={physicalRef}
              onChange={(e) => setPhysicalRef(e.target.value)}
            />
          </FormField>

          <FormField label="About this product">
            <textarea
              className="min-h-[96px] w-full resize-y rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-primary"
              placeholder="Where it's grown, what it's good for, how fresh it is…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>

          <FormField label="Photos">
            <MediaPicker value={media} onChange={setMedia} min={2} max={8} />
          </FormField>
        </section>
      )}

      {step === 1 && (
        <section className="mt-5 flex flex-col gap-4 lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:p-6">
          <div>
            <h2 className="text-sm font-black text-text">Price, stock &amp; location</h2>
            <p className="mt-0.5 text-xs text-textSecondary">How it's sold, and where buyers can pick it up.</p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
            <FormField label="Unit" className="sm:flex-1">
              <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
                <option value="OTHER">Other…</option>
              </select>
            </FormField>
            <FormField label="Price (Naira per unit)" className="sm:flex-[1.4]">
              <Input
                type="number"
                min="1"
                step="0.01"
                placeholder="e.g. 1200"
                value={priceNaira}
                onChange={(e) => setPriceNaira(e.target.value)}
              />
            </FormField>
          </div>
          {unit === 'OTHER' && (
            <FormField label="Your unit name">
              <Input
                placeholder="e.g. trailer, basin, serving"
                value={otherUnit}
                onChange={(e) => setOtherUnit(e.target.value)}
              />
            </FormField>
          )}

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
                    onChange={() => {
                      setPerishOverridden(true);
                      setPerishability(opt.value);
                    }}
                    className="w-4 h-4 text-primary"
                  />
                  <div>
                    <span className="text-sm font-medium">{opt.label}</span>
                    <p className="text-xs text-textSecondary">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-textSecondary">
              {selectedCategory && !perishOverridden
                ? `Suggested for ${selectedCategory.label} — you can change it.`
                : 'Used to time reminders and quality guarantees.'}
            </p>
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

          <FormField label="Where you sell from">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select className={inputCls} value={stateName} onChange={(e) => handleState(e.target.value)}>
                  <option value="">State…</option>
                  {states.map((s) => (
                    <option key={s.state} value={s.state}>{s.state}</option>
                  ))}
                </select>
                <select className={inputCls} value={lga} onChange={(e) => handleLga(e.target.value)} disabled={!stateName}>
                  <option value="">Local government…</option>
                  {lgas.map((l) => (
                    <option key={l.lga} value={l.lga}>{l.lga}</option>
                  ))}
                </select>
              </div>
              <select className={inputCls} value={clusterId} onChange={(e) => handleCluster(e.target.value)} disabled={!lga}>
                <option value="">Nearest market area…</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.lga !== lga ? ` (${c.lga})` : ''}</option>
                ))}
              </select>
              <select className={inputCls} value={marketId} onChange={(e) => setMarketId(e.target.value)} disabled={!clusterId}>
                <option value="">{needsMarket ? 'Market (required for Market Day)…' : 'Attach a market (optional)…'}</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.is_open_today ? ' · open today' : m.next_date ? ` · next ${new Date(m.next_date).toLocaleDateString('en-NG', { weekday: 'short' })}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-textSecondary">
              Listings bind to a market area so buyers near you can find them on the map.
            </p>
          </FormField>
        </section>
      )}

      {step === 2 && (
        <section className="mt-5 lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:p-6">
          <h2 className="text-sm font-black text-text">Review your listing</h2>
          <p className="mt-0.5 text-xs text-textSecondary">Nothing goes live until you hit Create.</p>
          <ReviewCard
            session={session}
            productName={productName}
            physicalRef={physicalRef}
            description={description}
            media={media}
            categoryLabel={selectedCategory?.label ?? ''}
            priceCents={Math.round(parseFloat(priceNaira || '0') * 100)}
            unit={effectiveUnit}
            qty={parseInt(availableQty, 10) || 0}
            minQty={parseInt(minOrderQty, 10) || 1}
            perishability={perishability}
            channel={channel}
            modes={fulfilmentModes}
            cluster={selectedCluster}
            market={selectedMarket}
          />
        </section>
      )}

      {displayError && <p className="mt-4 text-sm text-danger">{displayError}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={back} disabled={step === 0 || submitting}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>Continue</Button>
        ) : (
          <Button onClick={() => void handleSubmit()} loading={submitting} disabled={submitting}>
            Create Listing
          </Button>
        )}
      </div>
    </div>
  );
}

function StepBar({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className={`flex items-center gap-2 ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition ${
                done ? 'bg-primary text-white' : active ? 'bg-primaryLight text-primary' : 'bg-surface text-textSecondary'
              }`}
            >
              {done ? <Icon name="check" size={12} /> : i + 1}
            </span>
            <span className={`text-xs font-semibold ${active || done ? 'text-text' : 'text-textSecondary'}`}>{label}</span>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 ${done ? 'bg-primary' : 'bg-border'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function ReviewCard({
  session,
  productName,
  physicalRef,
  description,
  media,
  categoryLabel,
  priceCents,
  unit,
  qty,
  minQty,
  perishability,
  channel,
  modes,
  cluster,
  market,
}: {
  session: SessionSnapshot;
  productName: string;
  physicalRef: string;
  description: string;
  media: MediaEntry[];
  categoryLabel: string;
  priceCents: number;
  unit: string;
  qty: number;
  minQty: number;
  perishability: Perishability;
  channel: Channel;
  modes: FulfilmentMode[];
  cluster?: Cluster;
  market?: Market;
}) {
  const cover = media.find((m) => m.is_primary) ?? media[0];
  const perishLabel = PERISHABILITY_OPTIONS.find((p) => p.value === perishability)?.label ?? perishability;
  const channelLabel = CHANNELS.find((c) => c.value === channel)?.label ?? channel;

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-surface sm:aspect-auto sm:min-h-[200px]">
        {cover ? (
          <img src={mediaUrl(cover.storage_key) ?? undefined} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-textSecondary">No photo</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{categoryLabel}</p>
            <h3 className="mt-0.5 text-base font-bold leading-snug text-text">{productName}</h3>
            <p className="text-xs text-textSecondary">{physicalRef}</p>
          </div>
          <p className="shrink-0 text-lg font-black text-text">{fmtNaira(Math.max(priceCents, 0))}<span className="text-xs font-medium text-textSecondary"> / {unit}</span></p>
        </div>

        {description && <p className="mt-2 line-clamp-3 text-sm text-textSecondary">{description}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-textSecondary">{qty} available · min {minQty}</span>
          <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-textSecondary">{perishLabel}</span>
          <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-textSecondary">{channelLabel}</span>
          {modes.map((m) => (
            <span key={m} className="rounded-full bg-primaryLight px-2.5 py-1 text-[11px] font-medium text-primary">
              {FULFILMENT_MODES.find((f) => f.value === m)?.label ?? m}
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-1 rounded-xl border border-border bg-surface/40 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold text-text">
            <Icon name="pin" size={13} /> {cluster ? `${cluster.name}, ${cluster.lga}, ${cluster.state}` : 'Location not set'}
          </p>
          <p className="flex items-center gap-1.5 text-textSecondary">
            <Icon name="store" size={13} /> {market ? `${market.name}${market.is_open_today ? ' · open today' : ''}` : 'No market attached'}
          </p>
        </div>

        <p className="mt-3 text-[11px] text-textSecondary">Selling as <span className="font-semibold text-text">{session.user.full_name}</span> · {media.length} photo{media.length === 1 ? '' : 's'}</p>
      </div>
    </div>
  );
}

/* ── Shared page chrome (renders inside the Seller Portal layout) ── */

function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 md:py-8">
      <h1 className="text-xl font-black tracking-tight text-text md:text-2xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-textSecondary">{subtitle}</p>}
      <div className="mt-5 md:mt-6">{children}</div>
    </div>
  );
}