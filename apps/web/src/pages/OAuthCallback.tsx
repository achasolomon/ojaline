import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../lib/api';
import { saveSession } from '../lib/session';
import { AuthShell, AuthButton } from '../components/auth/AuthShell';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('token');
    const err = hash.get('error');

    if (err) {
      setError(err);
      setStatus('error');
      return;
    }
    if (!token) {
      setError('Your login did not complete. Please try again.');
      setStatus('error');
      return;
    }

    (async () => {
      try {
        const user = await getMe(token);
        if (cancelled) return;
        saveSession({ token, user });
        navigate('/', { replace: true });
      } catch {
        if (cancelled) return;
        setError('We could not verify your session. Please try again.');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <AuthShell title={status === 'loading' ? 'Signing you in…' : 'Sign-in failed'}>
      {status === 'loading' ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-textSecondary">We&apos;re linking your account…</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="rounded-2xl bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>
          <AuthButton type="button" onClick={() => navigate('/login', { replace: true })}>
            Back to Log In
          </AuthButton>
        </div>
      )}
    </AuthShell>
  );
}