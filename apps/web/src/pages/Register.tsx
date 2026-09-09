import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { register as registerUser } from '../lib/api';
import { saveSession } from '../lib/session';
import { AuthShell, AuthField, AuthButton, AuthDivider, GoogleAuthButton, FacebookAuthButton } from '../components/auth/AuthShell';
import { Icon } from '../components/icons';

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !password) {
      setError('Name, phone and password are required');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const session = await registerUser({
        full_name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password,
      });
      saveSession(session);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join OJALINE and shop wholesale at your market"
      footer={
        <p>
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="font-bold text-primary hover:underline"
          >
            Log In
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
          id="name"
          label="Full name"
          leading="user"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <AuthField
          id="phone"
          label="Phone number"
          leading="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <AuthField
          id="email"
          label="Email (optional)"
          leading="message"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <AuthField
          id="password"
          label="Password"
          leading="lock"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
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

        <AuthField
          id="confirm"
          label="Re-enter password"
          leading="lock"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <AuthButton type="submit" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Create Account'}
        </AuthButton>
      </form>

      <AuthDivider />

      <GoogleAuthButton />
      <FacebookAuthButton />

      <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed text-textSecondary">
        <Icon name="shield" size={13} className="mt-0.5 shrink-0 text-primary" />
        By creating an account you agree to the Terms of Service and Privacy Policy.
      </p>
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