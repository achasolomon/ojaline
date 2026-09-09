import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthShell, AuthField, AuthButton } from '../components/auth/AuthShell';

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
    <AuthShell
      title="Create New Password"
      subtitle="Your new password must be different from previous passwords."
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <AuthField
          id="new-password"
          label="New password"
          leading="lock"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <AuthField
          id="confirm-password"
          label="Re-enter password"
          leading="lock"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <AuthButton type="submit" disabled={submitting}>
          {submitting ? 'Resetting...' : 'Reset Password'}
        </AuthButton>
      </form>
    </AuthShell>
  );
}