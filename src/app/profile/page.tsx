'use client';

import React, { useState, useEffect } from 'react';

interface EmailItem {
  id: string;
  email: string;
  isPrimary: boolean;
  verified: boolean;
}

interface PhoneItem {
  id: string;
  e164: string;
  isPrimary: boolean;
  verified: boolean;
}

interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  department?: string;
  startYear?: number;
  graduationYear?: number;
  gradeValue?: string;
  gradeScale?: string;
  coursework?: string[];
  verification: string;
}

interface ExperienceItem {
  id: string;
  org: string;
  title: string;
  kind: string;
  startDate: string;
  endDate?: string | null;
  location?: string;
  responsibilities: string[];
  achievements: Array<{ text: string; metric?: { value: number; unit: string } }>;
  verification: string;
}

interface SkillItem {
  id: string;
  name: string;
  category: string;
  proficiency: number;
  years?: number;
  verification: string;
}

interface ProjectItem {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  repoUrl?: string;
  demoUrl?: string;
  verification: string;
}

interface WorkAuthItem {
  id: string;
  country: string;
  status: string;
  details?: string;
  verification: string;
}

interface ProfileData {
  id: string;
  fullName: string;
  headline: string;
  summary: string;
  timezone: string;
  currentCity: string;
  currentCountry: string;
  address?: string;
  preferredContact: string;
  noticePeriodDays?: number;
  currentEmploymentStatus: string;
  emails: EmailItem[];
  phones: PhoneItem[];
  workAuthorizations: WorkAuthItem[];
  education: EducationItem[];
  experience: ExperienceItem[];
  skills: SkillItem[];
  projects: ProjectItem[];
  links: Array<{ id: string; kind: string; url: string }>;
}

interface CompletenessReport {
  score: number;
  breakdown: {
    personal: number;
    contact: number;
    workAuth: number;
    experience: number;
    education: number;
    skills: number;
  };
  missingFields: string[];
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [completeness, setCompleteness] = useState<CompletenessReport | null>(null);
  const [activeTab, setActiveTab] = useState<'personal' | 'experience' | 'education' | 'skills' | 'projects' | 'work_auth'>('personal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states for adding items
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('other');
  const [newSkillProficiency, setNewSkillProficiency] = useState(3);
  const [newSkillYears, setNewSkillYears] = useState(2);

  // Form states for Experience
  const [newExpOrg, setNewExpOrg] = useState('');
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpStartDate, setNewExpStartDate] = useState('');
  const [newExpEndDate, setNewExpEndDate] = useState('');
  const [newExpResp, setNewExpResp] = useState('');

  // Form states for Education
  const [newEduInst, setNewEduInst] = useState('');
  const [newEduDegree, setNewEduDegree] = useState('');
  const [newEduDept, setNewEduDept] = useState('');
  const [newEduGradYear, setNewEduGradYear] = useState(2024);

  // Form states for Work Auth
  const [newAuthCountry, setNewAuthCountry] = useState('India');
  const [newAuthStatus, setNewAuthStatus] = useState('citizen');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [resProfile, resComp] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/profile/completeness'),
      ]);
      if (resProfile.ok) setProfile(await resProfile.json());
      if (resComp.ok) setCompleteness(await resComp.json());
    } catch {
      setMessage({ type: 'error', text: 'Failed to load profile data.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePersonal(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: profile.fullName,
          headline: profile.headline,
          summary: profile.summary,
          timezone: profile.timezone,
          currentCity: profile.currentCity,
          currentCountry: profile.currentCountry,
          address: profile.address,
          preferredContact: profile.preferredContact,
          noticePeriodDays: profile.noticePeriodDays ? Number(profile.noticePeriodDays) : null,
          currentEmploymentStatus: profile.currentEmploymentStatus,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Update failed');
      }

      setMessage({ type: 'success', text: 'Personal information updated successfully.' });
      loadData();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail) return;
    try {
      const res = await fetch('/api/profile/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, isPrimary: profile?.emails.length === 0 }),
      });
      if (res.ok) {
        setNewEmail('');
        loadData();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add email.' });
    }
  }

  async function handleDeleteItem(section: string, id: string) {
    try {
      const res = await fetch(`/api/profile/${section}/${id}`, { method: 'DELETE' });
      if (res.ok) loadData();
    } catch {
      setMessage({ type: 'error', text: `Failed to delete ${section} item.` });
    }
  }

  async function handleAddPhone(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhone) return;
    try {
      const res = await fetch('/api/profile/phones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ e164: newPhone, isPrimary: profile?.phones.length === 0 }),
      });
      if (res.ok) {
        setNewPhone('');
        loadData();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add phone.' });
    }
  }

  async function handleAddSkill(e: React.FormEvent) {
    e.preventDefault();
    if (!newSkillName) return;
    try {
      const res = await fetch('/api/profile/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSkillName,
          category: newSkillCategory,
          proficiency: Number(newSkillProficiency),
          years: Number(newSkillYears),
        }),
      });
      if (res.ok) {
        setNewSkillName('');
        loadData();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add skill.' });
    }
  }

  async function handleAddExperience(e: React.FormEvent) {
    e.preventDefault();
    if (!newExpOrg || !newExpTitle || !newExpStartDate) return;
    try {
      const res = await fetch('/api/profile/experience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org: newExpOrg,
          title: newExpTitle,
          startDate: newExpStartDate,
          endDate: newExpEndDate || null,
          responsibilities: newExpResp ? newExpResp.split('\n').filter(Boolean) : [],
        }),
      });
      if (res.ok) {
        setNewExpOrg('');
        setNewExpTitle('');
        setNewExpStartDate('');
        setNewExpEndDate('');
        setNewExpResp('');
        loadData();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add experience.' });
    }
  }

  async function handleAddEducation(e: React.FormEvent) {
    e.preventDefault();
    if (!newEduInst || !newEduDegree) return;
    try {
      const res = await fetch('/api/profile/education', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution: newEduInst,
          degree: newEduDegree,
          department: newEduDept,
          graduationYear: Number(newEduGradYear),
        }),
      });
      if (res.ok) {
        setNewEduInst('');
        setNewEduDegree('');
        setNewEduDept('');
        loadData();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add education.' });
    }
  }

  async function handleAddWorkAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!newAuthCountry) return;
    try {
      const res = await fetch('/api/profile/work_authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: newAuthCountry,
          status: newAuthStatus,
        }),
      });
      if (res.ok) {
        setNewAuthCountry('India');
        setNewAuthStatus('citizen');
        loadData();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add work authorization.' });
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', color: '#64748b' }}>
        Loading Candidate Profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ padding: '2rem', color: '#ef4444' }}>
        Failed to load profile. Please refresh or check server health.
      </div>
    );
  }

  const score = completeness?.score ?? 0;
  const scoreColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
            {profile.fullName || 'Candidate Profile'}
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.925rem', marginTop: '0.25rem' }}>
            {profile.headline || 'Configure your verified personal data for intelligent job autofill.'}
          </p>
        </div>
      </div>

      {/* Completeness Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '0.5rem',
          border: '1px solid #e2e8f0',
          padding: '1.25rem',
          marginBottom: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>Profile Completeness</span>
          <span style={{ fontSize: '1.1rem', fontWeight: '700', color: scoreColor }}>{score}%</span>
        </div>
        <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${score}%`, height: '100%', background: scoreColor, transition: 'width 0.3s' }} />
        </div>
        {completeness && completeness.missingFields.length > 0 && (
          <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Missing for 100%:</span>
            {completeness.missingFields.map((field) => (
              <span
                key={field}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '0.25rem',
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                }}
              >
                + {field}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Notification Message */}
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

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '1.5rem', gap: '0.5rem' }}>
        {[
          { key: 'personal', label: 'Personal & Contact' },
          { key: 'experience', label: `Experience (${profile.experience.length})` },
          { key: 'education', label: `Education (${profile.education.length})` },
          { key: 'skills', label: `Skills (${profile.skills.length})` },
          { key: 'work_auth', label: `Work Authorization (${profile.workAuthorizations.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            style={{
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: activeTab === tab.key ? '#2563eb' : '#64748b',
              borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: PERSONAL & CONTACT */}
      {activeTab === 'personal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <form
            onSubmit={handleUpdatePersonal}
            style={{
              background: '#ffffff',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Core Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>Full Name *</label>
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>Headline</label>
                <input
                  type="text"
                  value={profile.headline || ''}
                  onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
                  placeholder="e.g. Senior Software Engineer"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>Summary</label>
              <textarea
                value={profile.summary || ''}
                onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
                rows={3}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>City</label>
                <input
                  type="text"
                  value={profile.currentCity || ''}
                  onChange={(e) => setProfile({ ...profile, currentCity: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>Country</label>
                <input
                  type="text"
                  value={profile.currentCountry || ''}
                  onChange={(e) => setProfile({ ...profile, currentCountry: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>Notice Period (Days)</label>
                <input
                  type="number"
                  value={profile.noticePeriodDays ?? ''}
                  onChange={(e) => setProfile({ ...profile, noticePeriodDays: e.target.value ? Number(e.target.value) : undefined })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.375rem',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save Personal Details'}
              </button>
            </div>
          </form>

          {/* Contact Details Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Emails */}
            <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#0f172a' }}>Verified Email Addresses</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {profile.emails.map((e) => (
                  <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', padding: '0.375rem 0.5rem', background: '#f8fafc', borderRadius: '0.25rem' }}>
                    <span>
                      {e.email} {e.isPrimary && <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: '600' }}>(Primary)</span>}
                    </span>
                    <button
                      onClick={() => handleDeleteItem('emails', e.id)}
                      style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={handleAddEmail} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={{ flex: 1, padding: '0.375rem 0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
                <button type="submit" style={{ padding: '0.375rem 0.75rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  + Add
                </button>
              </form>
            </div>

            {/* Phones */}
            <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#0f172a' }}>Phone Numbers (E.164)</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {profile.phones.map((p) => (
                  <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', padding: '0.375rem 0.5rem', background: '#f8fafc', borderRadius: '0.25rem' }}>
                    <span>
                      {p.e164} {p.isPrimary && <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: '600' }}>(Primary)</span>}
                    </span>
                    <button
                      onClick={() => handleDeleteItem('phones', p.id)}
                      style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={handleAddPhone} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="tel"
                  placeholder="+919876543210"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  style={{ flex: 1, padding: '0.375rem 0.5rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
                <button type="submit" style={{ padding: '0.375rem 0.75rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  + Add
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EXPERIENCE */}
      {activeTab === 'experience' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {profile.experience.map((exp) => (
              <div key={exp.id} style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{exp.title}</h4>
                    <span style={{ fontSize: '0.875rem', color: '#475569', fontWeight: '500' }}>{exp.org}</span>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginLeft: '0.5rem' }}>
                      ({exp.startDate} – {exp.endDate || 'Present'})
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteItem('experience', exp.id)}
                    style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
                {exp.responsibilities && (exp.responsibilities as string[]).length > 0 && (
                  <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.85rem', color: '#334155' }}>
                    {(exp.responsibilities as string[]).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleAddExperience} style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a' }}>Add Experience</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <input type="text" placeholder="Organization / Company" value={newExpOrg} onChange={(e) => setNewExpOrg(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} required />
              <input type="text" placeholder="Job Title" value={newExpTitle} onChange={(e) => setNewExpTitle(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} required />
              <input type="text" placeholder="Start Date (YYYY-MM)" value={newExpStartDate} onChange={(e) => setNewExpStartDate(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} required />
              <input type="text" placeholder="End Date (YYYY-MM, leave empty if current)" value={newExpEndDate} onChange={(e) => setNewExpEndDate(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} />
            </div>
            <textarea placeholder="Key Responsibilities (one per line)" value={newExpResp} onChange={(e) => setNewExpResp(e.target.value)} rows={3} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} />
            <button type="submit" style={{ alignSelf: 'flex-start', padding: '0.5rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.85rem' }}>+ Add Experience</button>
          </form>
        </div>
      )}

      {/* TAB 3: EDUCATION */}
      {activeTab === 'education' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {profile.education.map((edu) => (
              <div key={edu.id} style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{edu.degree}</h4>
                  <span style={{ fontSize: '0.875rem', color: '#475569', fontWeight: '500' }}>{edu.institution}</span>
                  {edu.graduationYear && <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginLeft: '0.5rem' }}>Class of {edu.graduationYear}</span>}
                </div>
                <button onClick={() => handleDeleteItem('education', edu.id)} style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}>Delete</button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddEducation} style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a' }}>Add Education</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <input type="text" placeholder="Institution / University" value={newEduInst} onChange={(e) => setNewEduInst(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} required />
              <input type="text" placeholder="Degree (e.g. B.Tech Computer Science)" value={newEduDegree} onChange={(e) => setNewEduDegree(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} required />
              <input type="text" placeholder="Department" value={newEduDept} onChange={(e) => setNewEduDept(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} />
              <input type="number" placeholder="Graduation Year" value={newEduGradYear} onChange={(e) => setNewEduGradYear(Number(e.target.value))} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} />
            </div>
            <button type="submit" style={{ alignSelf: 'flex-start', padding: '0.5rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.85rem' }}>+ Add Education</button>
          </form>
        </div>
      )}

      {/* TAB 4: SKILLS */}
      {activeTab === 'skills' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#0f172a' }}>Verified Technical Skills</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {profile.skills.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: '#f1f5f9',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.85rem',
                    fontWeight: '500',
                    color: '#334155',
                  }}
                >
                  <span>{s.name}</span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>({s.proficiency}/5)</span>
                  <button
                    onClick={() => handleDeleteItem('skills', s.id)}
                    style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleAddSkill} style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input type="text" placeholder="Skill name (e.g. TypeScript, React, Docker)" value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} style={{ flex: 2, padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} required />
            <select value={newSkillCategory} onChange={(e) => setNewSkillCategory(e.target.value)} style={{ flex: 1, padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}>
              <option value="language">Language</option>
              <option value="framework">Framework</option>
              <option value="database">Database</option>
              <option value="tool">Tool</option>
              <option value="cloud">Cloud</option>
              <option value="other">Other</option>
            </select>
            <select value={newSkillProficiency} onChange={(e) => setNewSkillProficiency(Number(e.target.value))} style={{ flex: 1, padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}>
              <option value="1">1 - Novice</option>
              <option value="2">2 - Basic</option>
              <option value="3">3 - Intermediate</option>
              <option value="4">4 - Advanced</option>
              <option value="5">5 - Expert</option>
            </select>
            <input type="number" min="0" max="50" placeholder="Years" value={newSkillYears} onChange={(e) => setNewSkillYears(Number(e.target.value))} style={{ width: '80px', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} />
            <button type="submit" style={{ padding: '0.5rem 1rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.85rem' }}>+ Add Skill</button>
          </form>
        </div>
      )}

      {/* TAB 5: WORK AUTHORIZATION */}
      {activeTab === 'work_auth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {profile.workAuthorizations.map((auth) => (
              <div key={auth.id} style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a' }}>{auth.country}</h4>
                  <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: '600', textTransform: 'capitalize' }}>
                    Status: {auth.status.replace('_', ' ')}
                  </span>
                </div>
                <button onClick={() => handleDeleteItem('work_authorizations', auth.id)} style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}>Delete</button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddWorkAuth} style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input type="text" placeholder="Country" value={newAuthCountry} onChange={(e) => setNewAuthCountry(e.target.value)} style={{ flex: 2, padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }} required />
            <select value={newAuthStatus} onChange={(e) => setNewAuthStatus(e.target.value)} style={{ flex: 2, padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}>
              <option value="citizen">Citizen</option>
              <option value="permanent_resident">Permanent Resident</option>
              <option value="visa">Visa Holder</option>
              <option value="requires_sponsorship">Requires Sponsorship</option>
              <option value="other">Other</option>
            </select>
            <button type="submit" style={{ padding: '0.5rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.85rem' }}>+ Add Status</button>
          </form>
        </div>
      )}
    </div>
  );
}
