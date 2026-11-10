'use client';

import React, { useState, useEffect } from 'react';

interface AutonomyPolicy {
  version: number;
  level: number;
  autoShortlist: boolean;
  shortlistThreshold: number;
  mayPrepareApplications: boolean;
  mayFillForms: boolean;
  allowedCompanyIds: string[];
  allowedAts: string[];
  alwaysReviewCategories: string[];
  submissionMode: string;
  maxDailyApplications: number;
}

interface PolicyHistoryItem {
  id: string;
  version: number;
  reason: string;
  createdAt: string;
}

export default function AutonomyPage() {
  const [policy, setPolicy] = useState<AutonomyPolicy | null>(null);
  const [history, setHistory] = useState<PolicyHistoryItem[]>([]);
  const [confirmElevation, setConfirmElevation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [resPol, resHist] = await Promise.all([
        fetch('/api/autonomy'),
        fetch('/api/autonomy/history'),
      ]);
      if (resPol.ok) setPolicy(await resPol.json());
      if (resHist.ok) setHistory(await resHist.json());
    } catch {
      setMessage({ type: 'error', text: 'Failed to load autonomy policy.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!policy) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/autonomy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...policy,
          confirm: confirmElevation,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to update autonomy policy');
      }

      setMessage({ type: 'success', text: 'Autonomy policy updated successfully.' });
      setConfirmElevation(false);
      loadData();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading Autonomy Policies...</div>;
  }

  if (!policy) {
    return <div style={{ padding: '2rem', color: '#ef4444' }}>Autonomy policy could not be loaded.</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '850px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Autonomy Policies & Safety Boundaries</h1>
        <p style={{ color: '#64748b', fontSize: '0.925rem', marginTop: '0.25rem' }}>
          Career Copilot operates under strict human-in-the-loop boundaries. You maintain full control over automation and submissions.
        </p>
      </div>

      {message && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1.5rem',
            background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            fontSize: '0.875rem',
          }}
        >
          {message.text}
        </div>
      )}

      {/* SAFETY INVARIANT CALLOUT */}
      <div
        style={{
          background: '#eff6ff',
          borderLeft: '4px solid #3b82f6',
          padding: '1rem 1.25rem',
          borderRadius: '0.375rem',
          marginBottom: '2rem',
        }}
      >
        <h4 style={{ margin: '0 0 0.25rem 0', color: '#1e40af', fontSize: '0.9rem' }}>Safety Guarantee</h4>
        <p style={{ margin: 0, fontSize: '0.825rem', color: '#1e3a8a', lineHeight: '1.4' }}>
          By core engineering policy, Career Copilot will <strong>never</strong> generate, rewrite, or modify your resume PDF;
          will <strong>never</strong> automate legal declarations, bond agreements, or demographic/EEO answers; and will <strong>never</strong> submit an application without your explicit per-application authorization.
        </p>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {/* SECTION 1: AUTONOMY LEVEL */}
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#0f172a' }}>Operating Autonomy Level</h3>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.825rem', color: '#64748b' }}>
            Choose the degree of assistance the system provides. Level 3 (unsupervised bulk automation) is strictly disabled in v1.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label
              style={{
                display: 'flex',
                gap: '0.75rem',
                padding: '1rem',
                border: policy.level === 1 ? '2px solid #2563eb' : '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                background: policy.level === 1 ? '#f8faff' : '#ffffff',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="level"
                checked={policy.level === 1}
                onChange={() =>
                  setPolicy({
                    ...policy,
                    level: 1,
                    mayPrepareApplications: false,
                    mayFillForms: false,
                  })
                }
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <strong style={{ display: 'block', fontSize: '0.9rem', color: '#0f172a' }}>
                  Level 1 — Discovery & Intelligence Only
                </strong>
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                  The system discovers opportunities, tracks career portals, analyzes JDs, researches employers, and scores suitability. It never initiates application preparation without your direct request.
                </span>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                gap: '0.75rem',
                padding: '1rem',
                border: policy.level === 2 ? '2px solid #2563eb' : '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                background: policy.level === 2 ? '#f8faff' : '#ffffff',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="level"
                checked={policy.level === 2}
                onChange={() =>
                  setPolicy({
                    ...policy,
                    level: 2,
                    mayPrepareApplications: true,
                    mayFillForms: true,
                  })
                }
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <strong style={{ display: 'block', fontSize: '0.9rem', color: '#0f172a' }}>
                  Level 2 — Application Preparation with Review
                </strong>
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                  For shortlisted opportunities, the system navigates to the portal, maps fields, pre-fills verified facts, and presents a comprehensive review summary for your inspection.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* SECTION 2: SUBMISSION MODE */}
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#0f172a' }}>Application Submission Mechanism</h3>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.825rem', color: '#64748b' }}>
            How prepared applications are finalized on the target ATS portal.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label
              style={{
                display: 'flex',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                border: policy.submissionMode === 'manual_handover' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                borderRadius: '0.375rem',
                background: policy.submissionMode === 'manual_handover' ? '#f8faff' : '#ffffff',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="submissionMode"
                value="manual_handover"
                checked={policy.submissionMode === 'manual_handover'}
                onChange={(e) => setPolicy({ ...policy, submissionMode: e.target.value })}
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>
                  Manual Browser Handover (Default, M11)
                </strong>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Career Copilot launches a visible headed browser session with your pre-filled form. You do the final inspection and click the submit button with your own mouse.
                </p>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                border: policy.submissionMode === 'automated_authorized' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                borderRadius: '0.375rem',
                background: policy.submissionMode === 'automated_authorized' ? '#f8faff' : '#ffffff',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="submissionMode"
                value="automated_authorized"
                checked={policy.submissionMode === 'automated_authorized'}
                onChange={(e) => setPolicy({ ...policy, submissionMode: e.target.value })}
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>
                  Automated Authorized Submission (M12)
                </strong>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  The system executes the final submit click autonomously only after you have explicitly granted authorization for that specific application and its content hash.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* SECTION 3: IMMUTABLE REVIEW CATEGORIES */}
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#0f172a' }}>Mandatory Human Review Categories</h3>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.825rem', color: '#64748b' }}>
            These critical question categories will <strong>always</strong> pause the workflow and request human confirmation. They cannot be delegated to AI.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {policy.alwaysReviewCategories.map((cat) => (
              <span
                key={cat}
                style={{
                  background: '#f1f5f9',
                  color: '#1e293b',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  padding: '0.3rem 0.65rem',
                  borderRadius: '0.25rem',
                  border: '1px solid #cbd5e1',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                🔒 {cat.replace('_', ' ')}
              </span>
            ))}
          </div>
        </div>

        {/* SECTION 4: LIMITS & ELEVATION CONFIRMATION */}
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>
              Maximum Daily Applications Limit
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={policy.maxDailyApplications}
              onChange={(e) => setPolicy({ ...policy, maxDailyApplications: Number(e.target.value) })}
              style={{ width: '120px', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
            />
          </div>

          <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#0f172a', fontWeight: '500', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={confirmElevation}
                onChange={(e) => setConfirmElevation(e.target.checked)}
              />
              I confirm and authorize changing these autonomy parameters.
            </label>
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '0.625rem 1.5rem',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Updating...' : `Save Autonomy Policy (v${policy.version})`}
          </button>
        </div>
      </form>

      {/* POLICY REVISION HISTORY */}
      {history.length > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <h3 style={{ fontSize: '1rem', color: '#0f172a', marginBottom: '0.75rem' }}>Policy Revision Log</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {history.map((item) => (
              <li
                key={item.id}
                style={{
                  background: '#ffffff',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.8rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#475569',
                }}
              >
                <span><strong>v{item.version}:</strong> {item.reason}</span>
                <span style={{ color: '#94a3b8' }}>{new Date(item.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
