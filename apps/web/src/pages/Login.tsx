import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../lib/api';
import { saveSession } from '../lib/session';
import { AuthShell, AuthField, AuthButton, AuthDivider, GoogleAuthButton, FacebookAuthButton } from '../components/auth/AuthShell';
import { Icon } from '../components/icons';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const qs = new URLSearchParams(window.location.search);
  const from = (location.state as { from?: string } | null)?.from ?? qs.get('from') ?? '/';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(
    qs.get('reason') === 'session-expired' ? 'Your session expired — please log in again.' : '',
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Enter your phone/email and password');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const session = await login(identifier.trim(), password);
      saveSession(session);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to shop fresh from the market"
      footer={
        <p>
          Don&apos;t have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="font-bold text-primary hover:underline"
          >
            Create Account
          </button>
        </p>
      }
    >
      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl bg-danger/5 px-4 py-3 text-sm text-danger">
          <Icon name="help" size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField
          id="identifier"
          label="Phone number or email"
          leading="user"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />

        <AuthField
          id="password"
          label="Password"
          leading="lock"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-textSecondary transition hover:bg-black/5 hover:text-text"
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          }
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/forgot')}
            className="text-[13px] font-semibold text-primary hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <AuthButton type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log In'}
        </AuthButton>
      </form>

      <AuthDivider />

      <GoogleAuthButton />
      <FacebookAuthButton />
    </AuthShell>
  );
}

function Eye() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}