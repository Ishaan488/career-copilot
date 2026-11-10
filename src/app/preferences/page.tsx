'use client';

import React, { useState, useEffect } from 'react';

interface JobPreferences {
  preferredRoles: string[];
  excludedRoles: string[];
  industries: string[];
  excludedIndustries: string[];
  locations: Array<{ city?: string; country: string; remoteOk: boolean }>;
  workModes: string[];
  minComp?: number | null;
  preferredComp?: number | null;
  compCurrency: string;
  compPeriod: string;
  maxNoticePeriodDays?: number | null;
  relocation?: string | null;
  scoringWeights: {
    roleFit: number;
    skillMatch: number;
    comp: number;
    location: number;
    companyReputation: number;
  };
}

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<JobPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [roleInput, setRoleInput] = useState('');
  const [excludedRoleInput, setExcludedRoleInput] = useState('');

  useEffect(() => {
    fetch('/api/preferences')
      .then((res) => res.json())
      .then((data) => {
        setPrefs({
          ...data,
          minComp: data.minComp ? Number(data.minComp) : null,
          preferredComp: data.preferredComp ? Number(data.preferredComp) : null,
        });
      })
      .catch(() => setMessage({ type: 'error', text: 'Failed to load preferences.' }))
      .finally(() => setLoading(false));
  }, []);

  const totalWeight = prefs
    ? Number(prefs.scoringWeights.roleFit) +
      Number(prefs.scoringWeights.skillMatch) +
      Number(prefs.scoringWeights.comp) +
      Number(prefs.scoringWeights.location) +
      Number(prefs.scoringWeights.companyReputation)
    : 0;

  const isWeightValid = Math.abs(totalWeight - 100) <= 0.01;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs) return;

    if (!isWeightValid) {
      setMessage({ type: 'error', text: `Scoring weights must sum to exactly 100% (currently ${totalWeight}%).` });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to update preferences');
      }

      setMessage({ type: 'success', text: 'Job preferences saved successfully.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  function addRole() {
    if (!roleInput.trim() || !prefs) return;
    if (!prefs.preferredRoles.includes(roleInput.trim())) {
      setPrefs({ ...prefs, preferredRoles: [...prefs.preferredRoles, roleInput.trim()] });
    }
    setRoleInput('');
  }

  function removeRole(role: string) {
    if (!prefs) return;
    setPrefs({ ...prefs, preferredRoles: prefs.preferredRoles.filter((r) => r !== role) });
  }

  function addExcludedRole() {
    if (!excludedRoleInput.trim() || !prefs) return;
    if (!prefs.excludedRoles.includes(excludedRoleInput.trim())) {
      setPrefs({ ...prefs, excludedRoles: [...prefs.excludedRoles, excludedRoleInput.trim()] });
    }
    setExcludedRoleInput('');
  }

  function removeExcludedRole(role: string) {
    if (!prefs) return;
    setPrefs({ ...prefs, excludedRoles: prefs.excludedRoles.filter((r) => r !== role) });
  }

  function toggleWorkMode(mode: string) {
    if (!prefs) return;
    const current = prefs.workModes;
    if (current.includes(mode)) {
      setPrefs({ ...prefs, workModes: current.filter((m) => m !== mode) });
    } else {
      setPrefs({ ...prefs, workModes: [...current, mode] });
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading Job Preferences...</div>;
  }

  if (!prefs) {
    return <div style={{ padding: '2rem', color: '#ef4444' }}>Preferences could not be loaded.</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '850px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Job Search Preferences</h1>
        <p style={{ color: '#64748b', fontSize: '0.925rem', marginTop: '0.25rem' }}>
          Define your target titles, compensation thresholds, work modes, and deterministic scoring weights.
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

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {/* SECTION 1: TARGET ROLES */}
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#0f172a' }}>Target & Excluded Job Titles</h3>
          
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#475569', marginBottom: '0.35rem' }}>
              Target Job Titles (e.g. Senior Frontend Engineer, Full Stack Developer)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                placeholder="Add role title..."
                style={{ flex: 1, padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem', fontSize: '0.875rem' }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRole(); } }}
              />
              <button type="button" onClick={addRole} style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}>
                + Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {prefs.preferredRoles.map((role) => (
                <span key={role} style={{ background: '#eff6ff', color: '#1d4ed8', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {role}
                  <button type="button" onClick={() => removeRole(role)} style={{ border: 'none', background: 'none', color: '#60a5fa', cursor: 'pointer', padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#475569', marginBottom: '0.35rem' }}>
              Excluded Roles (Never recommend or shortlist)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={excludedRoleInput}
                onChange={(e) => setExcludedRoleInput(e.target.value)}
                placeholder="e.g. Sales, DevOps, Intern"
                style={{ flex: 1, padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem', fontSize: '0.875rem' }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExcludedRole(); } }}
              />
              <button type="button" onClick={addExcludedRole} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}>
                + Exclude
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {prefs.excludedRoles.map((role) => (
                <span key={role} style={{ background: '#fef2f2', color: '#b91c1c', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {role}
                  <button type="button" onClick={() => removeExcludedRole(role)} style={{ border: 'none', background: 'none', color: '#f87171', cursor: 'pointer', padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 2: WORK MODES & COMPENSATION */}
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Work Arrangement & Compensation</h3>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#475569', marginBottom: '0.5rem' }}>Permitted Work Modes</label>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {['remote', 'hybrid', 'onsite'].map((mode) => (
                <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', textTransform: 'capitalize', color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={prefs.workModes.includes(mode)}
                    onChange={() => toggleWorkMode(mode)}
                  />
                  {mode}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>Minimum CTC</label>
              <input
                type="number"
                value={prefs.minComp ?? ''}
                onChange={(e) => setPrefs({ ...prefs, minComp: e.target.value ? Number(e.target.value) : null })}
                placeholder="e.g. 1500000"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>Target / Preferred CTC</label>
              <input
                type="number"
                value={prefs.preferredComp ?? ''}
                onChange={(e) => setPrefs({ ...prefs, preferredComp: e.target.value ? Number(e.target.value) : null })}
                placeholder="e.g. 2500000"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>Currency</label>
              <select
                value={prefs.compCurrency}
                onChange={(e) => setPrefs({ ...prefs, compCurrency: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>Max Acceptable Notice (Days)</label>
              <input
                type="number"
                value={prefs.maxNoticePeriodDays ?? ''}
                onChange={(e) => setPrefs({ ...prefs, maxNoticePeriodDays: e.target.value ? Number(e.target.value) : null })}
                placeholder="e.g. 60"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>Relocation Willingness</label>
              <select
                value={prefs.relocation || ''}
                onChange={(e) => setPrefs({ ...prefs, relocation: e.target.value || null })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
              >
                <option value="">Not Specified</option>
                <option value="no">No Relocation</option>
                <option value="within_country">Within Country Only</option>
                <option value="anywhere">Anywhere (International)</option>
                <option value="case_by_case">Case by Case</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 3: DETERMINISTIC SCORING WEIGHTS */}
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Opportunity Scoring Weights</h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Weights must total exactly 100%. Every job evaluation is explained component by component.
              </p>
            </div>
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: '700',
                padding: '0.25rem 0.65rem',
                borderRadius: '0.375rem',
                background: isWeightValid ? '#f0fdf4' : '#fef2f2',
                color: isWeightValid ? '#15803d' : '#b91c1c',
                border: `1px solid ${isWeightValid ? '#bbf7d0' : '#fecaca'}`,
              }}
            >
              Total: {totalWeight}% {isWeightValid ? '✓' : '(Must be 100%)'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              { key: 'roleFit', label: 'Role & Responsibility Match' },
              { key: 'skillMatch', label: 'Technical Skills Match' },
              { key: 'comp', label: 'Compensation & Benefits Alignment' },
              { key: 'location', label: 'Location & Work Arrangement' },
              { key: 'companyReputation', label: 'Company Stability & Profile' },
            ].map(({ key, label }) => {
              const val = prefs.scoringWeights[key as keyof typeof prefs.scoringWeights];
              return (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#334155', fontWeight: '500' }}>{label}</span>
                    <span style={{ fontWeight: '700', color: '#0f172a' }}>{val}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={val}
                    onChange={(e) => {
                      const next = { ...prefs.scoringWeights, [key]: Number(e.target.value) };
                      setPrefs({ ...prefs, scoringWeights: next });
                    }}
                    style={{ width: '100%', accentColor: '#2563eb' }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving || !isWeightValid}
            style={{
              padding: '0.625rem 1.5rem',
              background: isWeightValid ? '#2563eb' : '#94a3b8',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: isWeightValid ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving...' : 'Save Job Search Preferences'}
          </button>
        </div>
      </form>
    </div>
  );
}
