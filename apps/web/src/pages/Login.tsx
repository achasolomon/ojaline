import { Button, Card, FormField, Input } from '@ojaline/design';
import { useState } from 'react';
import { login } from '../lib/api';

export function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await login(identifier, password);
      console.log('auth placeholder — logged in as', result.user_id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <Card title="Sign in">
        <form onSubmit={onSubmit}>
          <FormField label="Phone or email">
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
          </FormField>
          <FormField label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </FormField>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
