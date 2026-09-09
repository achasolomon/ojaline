import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthShell, AuthField, AuthButton } from '../components/auth/AuthShell';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setSubmitting(true);
    // TODO: call API to send reset code
    navigate('/reset');
  };

  return (
    <AuthShell
      title="Forgot Password?"
      subtitle="Enter your phone number or email and we'll help you reset your password."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField
          id="identifier"
          label="Phone number or email"
          leading="phone"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />

        <AuthButton type="submit" disabled={submitting || !identifier.trim()}>
          {submitting ? 'Sending...' : 'Send Reset Code'}
        </AuthButton>
      </form>
    </AuthShell>
  );
}