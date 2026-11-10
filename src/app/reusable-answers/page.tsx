'use client';

import React, { useState, useEffect } from 'react';

interface ReusableAnswer {
  id: string;
  questionKey: string;
  questionPatterns: string[];
  answer: unknown;
  scope: { atsTypes?: string[]; companyIds?: string[] };
  category: string;
  coreCategoryConfirmed: boolean;
  authorizedAt: string;
  authorizedNote?: string;
  lastUsedAt?: string;
  useCount: number;
  disabled: boolean;
}

const CORE_CATEGORIES = [
  'legal',
  'consent',
  'bond',
  'work_auth',
  'salary',
  'notice',
  'relocation',
  'background',
  'sensitive',
  'eeo',
];

export default function ReusableAnswersPage() {
  const [answers, setAnswers] = useState<ReusableAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [questionKey, setQuestionKey] = useState('');
  const [patterns, setPatterns] = useState('');
  const [answerValue, setAnswerValue] = useState('');
  const [category, setCategory] = useState('work_auth');
  const [coreCategoryConfirmed, setCoreCategoryConfirmed] = useState(true);
  const [authorizedNote, setAuthorizedNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAnswers();
  }, []);

  async function loadAnswers() {
    setLoading(true);
    try {
      const res = await fetch('/api/reusable-answers?includeDisabled=true');
      if (res.ok) setAnswers(await res.json());
    } catch {
      setMessage({ type: 'error', text: 'Failed to load reusable answers.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!questionKey || !patterns || !answerValue) return;

    const patternList = patterns
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);

    if (patternList.length === 0) {
      setMessage({ type: 'error', text: 'At least one pattern/keyword is required.' });
      return;
    }

    const isCore = CORE_CATEGORIES.includes(category);
    if (isCore && !coreCategoryConfirmed) {
      setMessage({ type: 'error', text: 'Core and EEO category questions require explicit user confirmation.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      let parsedAnswer: unknown = answerValue;
      try {
        parsedAnswer = JSON.parse(answerValue);
      } catch {
        parsedAnswer = { text: answerValue };
      }

      const res = await fetch('/api/reusable-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionKey,
          questionPatterns: patternList,
          answer: parsedAnswer,
          category,
          coreCategoryConfirmed,
          authorizedNote: authorizedNote || 'User authorized pre-verified answer',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to create answer');
      }

      setMessage({ type: 'success', text: 'Reusable answer added successfully.' });
      setQuestionKey('');
      setPatterns('');
      setAnswerValue('');
      setAuthorizedNote('');
      loadAnswers();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/reusable-answers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Reusable answer deleted.' });
        loadAnswers();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete answer.' });
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading Reusable Q&A...</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Reusable Application Answers</h1>
        <p style={{ color: '#64748b', fontSize: '0.925rem', marginTop: '0.25rem' }}>
          Pre-approved, deterministic answers to recurring portal questions (e.g. work authorization, notice period, links).
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

      {/* CREATE NEW ANSWER FORM */}
      <form
        onSubmit={handleCreate}
        style={{
          background: '#ffffff',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>+ Authorize New Reusable Answer</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>
              Unique Question Key *
            </label>
            <input
              type="text"
              placeholder="e.g. work_auth_india"
              value={questionKey}
              onChange={(e) => setQuestionKey(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
            >
              <option value="work_auth">Work Authorization</option>
              <option value="salary">Salary / Compensation</option>
              <option value="notice">Notice Period</option>
              <option value="relocation">Relocation</option>
              <option value="legal">Legal Declarations</option>
              <option value="consent">Consent & Terms</option>
              <option value="eeo">EEO / Demographics</option>
              <option value="technical">Technical / Experience</option>
              <option value="general">General / Other</option>
            </select>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>
            Question Patterns & Keywords (one regex/string per line) *
          </label>
          <textarea
            rows={2}
            placeholder={'authorized to work in India\nlegal right to work in India\ncitizen of India'}
            value={patterns}
            onChange={(e) => setPatterns(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>
            Pre-approved Answer (Text or JSON) *
          </label>
          <textarea
            rows={2}
            placeholder={'Yes'}
            value={answerValue}
            onChange={(e) => setAnswerValue(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
            required
          />
        </div>

        {CORE_CATEGORIES.includes(category) && (
          <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem', color: '#0f172a', fontWeight: '500', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={coreCategoryConfirmed}
                onChange={(e) => setCoreCategoryConfirmed(e.target.checked)}
              />
              I explicitly verify and authorize this answer for core category: <strong>{category}</strong>.
            </label>
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '0.5rem 1.25rem',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Authorizing...' : 'Save Authorized Answer'}
          </button>
        </div>
      </form>

      {/* EXISTING REUSABLE ANSWERS LIST */}
      <div>
        <h3 style={{ fontSize: '1rem', color: '#0f172a', marginBottom: '1rem' }}>
          Configured Answers ({answers.length})
        </h3>

        {answers.length === 0 ? (
          <div style={{ background: '#ffffff', padding: '2rem', textAlign: 'center', color: '#64748b', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
            No reusable answers configured yet. Add common questions above to speed up application review.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {answers.map((item) => (
              <div
                key={item.id}
                style={{
                  background: '#ffffff',
                  padding: '1.25rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{item.questionKey}</strong>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: '600',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '0.2rem',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        textTransform: 'uppercase',
                      }}
                    >
                      {item.category}
                    </span>
                    {item.coreCategoryConfirmed && (
                      <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '600' }}>✓ Verified</span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
                    <strong>Matches:</strong> {(item.questionPatterns as string[]).join(' | ')}
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.85rem',
                      color: '#1e293b',
                      border: '1px solid #e2e8f0',
                      fontFamily: 'monospace',
                    }}
                  >
                    {typeof item.answer === 'object' ? JSON.stringify(item.answer) : String(item.answer)}
                  </div>

                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                    Used {item.useCount} times {item.lastUsedAt && `• Last used ${new Date(item.lastUsedAt).toLocaleDateString()}`}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(item.id)}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: '#ef4444',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    padding: '0.25rem 0.5rem',
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
