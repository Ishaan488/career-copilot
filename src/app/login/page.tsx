'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        setSetupRequired(data.setupRequired);
        if (data.authenticated) {
          router.push('/');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const endpoint = setupRequired ? '/api/auth/setup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Authentication failed');
        return;
      }

      if (setupRequired) {
        // After setup, automatically login
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode }),
        });
        if (loginRes.ok) {
          router.push('/');
          return;
        }
      }

      router.push('/');
    } catch {
      setError('Network error during authentication');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <p style={{ color: '#64748b' }}>Checking authentication status...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem', background: '#ffffff', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.5rem 0' }}>
        {setupRequired ? 'Set Up Career Copilot Passcode' : 'Unlock Career Copilot'}
      </h1>
      <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 0 1.5rem 0' }}>
        {setupRequired
          ? 'Configure a master passcode (minimum 12 characters) to protect your profile, credentials, and automation workflows.'
          : 'Enter your master passcode to access your dashboard and active workflows.'}
      </p>

      {error && (
        <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.375rem', color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '500', color: '#334155', marginBottom: '0.375rem' }}>
            {setupRequired ? 'New Master Passcode (12+ characters)' : 'Passcode'}
          </label>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            required
            minLength={setupRequired ? 12 : 1}
            autoFocus
            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.875rem', boxSizing: 'border-box' }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || (setupRequired && passcode.length < 12)}
          style={{
            padding: '0.625rem',
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting || (setupRequired && passcode.length < 12) ? 0.6 : 1,
          }}
        >
          {submitting ? 'Please wait...' : setupRequired ? 'Save Passcode & Continue' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
