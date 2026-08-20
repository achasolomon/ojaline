import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      alert('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      navigate('/login');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="p-1">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-2">
        <h1 className="mb-1.5 text-[24px] font-bold">Create New Password</h1>
        <p className="mb-6 text-sm leading-relaxed text-neutral-500">
          Your new password must be different from previous passwords.
        </p>

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <input
            type="password"
            placeholder="Min. 8 characters"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border px-3.5 py-3 text-base outline-none transition focus:border-primary"
          />
          <input
            type="password"
            placeholder="Re-enter password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-border px-3.5 py-3 text-base outline-none transition focus:border-primary"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary py-3.5 text-[15px] font-semibold text-white transition disabled:opacity-50"
          >
            {submitting ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
