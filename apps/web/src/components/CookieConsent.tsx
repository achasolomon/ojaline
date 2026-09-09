import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const CONSENT_KEY = 'kika_cookie_consent';

export type CookieConsentChoice = 'accepted' | 'rejected';

export function getCookieConsent(): CookieConsentChoice | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw === 'accepted' || raw === 'rejected' ? raw : null;
  } catch {
    return null;
  }
}

export function setCookieConsent(choice: CookieConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch { /* ignore */ }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true);
  }, []);

  if (!visible) return null;

  const choose = (choice: CookieConsentChoice) => {
    setCookieConsent(choice);
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 animate-fade-up">
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-white shadow-lg px-5 py-4 flex flex-col sm:flex-row items-start gap-3 justify-between">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-semibold text-text">We use cookies</span> to keep you signed in, remember your
          location and preferences, and show you the best market-day deals nearest you.{' '}
          <Link to="/help" className="text-primary font-medium hover:underline">
            Learn more
          </Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => choose('rejected')}
            className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-medium text-text cursor-pointer hover:bg-surface transition"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white cursor-pointer hover:bg-primary-dark transition"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}