'use client';

import React, { useState, useEffect, useCallback } from 'react';

export type ReviewCategory =
  | 'legal'
  | 'consent'
  | 'bond'
  | 'work_auth'
  | 'salary'
  | 'eeo'
  | 'sensitive'
  | 'company_legitimacy'
  | 'missing_profile'
  | 'custom_question'
  | 'other';

export type ReviewStatus =
  | 'pending'
  | 'answered'
  | 'approved'
  | 'rejected'
  | 'deferred'
  | 'cancelled'
  | 'expired';

export interface ResponseSchema {
  type: 'text' | 'select' | 'radio' | 'boolean' | 'number' | 'multiselect';
  options?: Array<{ label: string; value: string | boolean | number }>;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
}

export interface ReviewItem {
  id: string;
  workflowId?: string | null;
  jobId: string;
  jobTitle?: string;
  companyName?: string;
  applicationId?: string | null;
  fieldId?: string | null;
  category: ReviewCategory;
  isCoreCategory: boolean;
  question: string;
  context: Record<string, unknown>;
  uncertaintyReason?: string | null;
  evidence: Array<Record<string, unknown>>;
  suggestedAnswer?: unknown;
  suggestionConfidence?: number | null;
  suggestionRationale?: string | null;
  requiredAction: 'answer' | 'approve' | 'authorize' | 'decide';
  responseSchema: ResponseSchema;
  status: ReviewStatus;
  userAnswer?: unknown;
  snoozedUntil?: string | null;
  expiresAt?: string | null;
  checkpointStep?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

const CORE_CATEGORIES: ReviewCategory[] = [
  'legal',
  'consent',
  'bond',
  'work_auth',
  'salary',
  'eeo',
  'sensitive',
];

export default function ReviewCenterPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'deferred' | 'history'>('active');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  // Form states for selected review
  const [formAnswer, setFormAnswer] = useState<unknown>('');
  const [saveReusable, setSaveReusable] = useState(false);
  const [reusableKey, setReusableKey] = useState('');
  const [notes, setNotes] = useState('');
  const [deferHours, setDeferHours] = useState(4);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeTab === 'active') {
        params.set('status', 'active');
      } else if (activeTab === 'deferred') {
        params.set('status', 'deferred');
      } else {
        params.set('status', 'all');
      }

      if (categoryFilter !== 'all') {
        params.set('category', categoryFilter);
      }

      const res = await fetch(`/api/reviews?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch reviews');
      const data = await res.json();
      const items: ReviewItem[] = data.items || [];
      setReviews(items);

      // Preserve or set active selection
      if (items.length > 0) {
        if (!selectedReviewId || !items.some((i) => i.id === selectedReviewId)) {
          setSelectedReviewId(items[0]?.id || null);
        }
      } else {
        setSelectedReviewId(null);
      }
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : 'Error loading review requests',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, categoryFilter, selectedReviewId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Periodic polling for auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchReviews();
    }, 12000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchReviews]);

  const selectedReview = reviews.find((r) => r.id === selectedReviewId) || null;

  // Reset form inputs when selected review changes
  useEffect(() => {
    if (selectedReview) {
      if (selectedReview.userAnswer !== undefined && selectedReview.userAnswer !== null) {
        setFormAnswer(selectedReview.userAnswer);
      } else if (selectedReview.suggestedAnswer !== undefined && selectedReview.suggestedAnswer !== null) {
        setFormAnswer(selectedReview.suggestedAnswer);
      } else if (selectedReview.responseSchema?.type === 'boolean') {
        setFormAnswer(null);
      } else {
        setFormAnswer('');
      }

      setSaveReusable(false);
      // Auto-suggest a clean reusable key
      const keyBase = selectedReview.category.replace(/[^a-zA-Z0-9]/g, '_');
      const stepBase = selectedReview.checkpointStep ? `_${selectedReview.checkpointStep}` : '';
      setReusableKey(`${keyBase}${stepBase}_default`);
      setNotes('');
    }
  }, [selectedReviewId, selectedReview?.category, selectedReview?.checkpointStep]);

  const handleRespond = async (action: 'answer' | 'approve' | 'authorize' | 'decide') => {
    if (!selectedReview) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/reviews/${selectedReview.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          answer: formAnswer,
          saveReusable: saveReusable,
          reusableKey: saveReusable && reusableKey.trim() ? reusableKey.trim() : undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Failed to submit response');
      }

      setToast({
        message: `Response submitted successfully. Checkpointed workflow resumed.`,
        type: 'success',
      });
      await fetchReviews();
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : 'Error submitting answer',
        type: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDefer = async () => {
    if (!selectedReview) return;
    try {
      setActionLoading(true);
      const snoozeDate = new Date(Date.now() + deferHours * 3600 * 1000);
      const res = await fetch(`/api/reviews/${selectedReview.id}/defer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snoozeUntil: snoozeDate.toISOString(),
          reason: `Snoozed by user for ${deferHours}h`,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Failed to snooze review');
      }

      setToast({
        message: `Review request snoozed for ${deferHours} hour${deferHours > 1 ? 's' : ''}.`,
        type: 'success',
      });
      await fetchReviews();
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : 'Error deferring review',
        type: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedReview) return;
    if (!confirm('Are you sure you want to cancel this review request? Associated workflow step may fail or halt.')) {
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch(`/api/reviews/${selectedReview.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Failed to cancel review');
      }

      setToast({
        message: 'Review request cancelled.',
        type: 'success',
      });
      await fetchReviews();
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cancelling review',
        type: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Filter reviews by search term
  const filteredReviews = reviews.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.question.toLowerCase().includes(q) ||
      (r.jobTitle && r.jobTitle.toLowerCase().includes(q)) ||
      (r.companyName && r.companyName.toLowerCase().includes(q)) ||
      r.category.toLowerCase().includes(q)
    );
  });

  const activeCount = reviews.filter((r) => r.status === 'pending').length;
  const coreActiveCount = reviews.filter((r) => r.status === 'pending' && r.isCoreCategory).length;

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: toast.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: toast.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${toast.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              color: 'inherit',
              padding: '0.125rem 0.375rem',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header & Metrics */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Human Review Center
            </h1>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: '600',
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Milestone 9 HITL Engine
            </span>
          </div>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
            Zero-fabrication guardrail: Inspect, verify, and resolve checkpointed workflow inquiries.
          </p>
        </div>

        {/* Stats and Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pending Tasks
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
              {activeCount}{' '}
              {coreActiveCount > 0 && (
                <span style={{ fontSize: '0.8125rem', color: '#dc2626', fontWeight: '600' }}>
                  ({coreActiveCount} Core)
                </span>
              )}
            </div>
          </div>

          <div style={{ height: '32px', width: '1px', background: '#e2e8f0' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => fetchReviews()}
              disabled={loading}
              style={{
                padding: '0.5rem 0.875rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🔄</span> {loading ? 'Refreshing...' : 'Refresh'}
            </button>

            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                borderRadius: '6px',
                border: autoRefresh ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                background: autoRefresh ? '#f0fdf4' : '#f8fafc',
                color: autoRefresh ? '#166534' : '#64748b',
                cursor: 'pointer',
              }}
            >
              {autoRefresh ? '● Polling 12s' : '○ Polling Paused'}
            </button>
          </div>
        </div>
      </div>

      {/* Safety Invariant Notice Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
          borderRadius: '10px',
          border: '1px solid #fde68a',
          padding: '0.875rem 1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
        }}
      >
        <div style={{ fontSize: '1.25rem', lineHeight: '1.4' }}>🛡️</div>
        <div style={{ fontSize: '0.875rem', color: '#92400e', lineHeight: '1.5' }}>
          <strong>Zero-Fabrication Contract:</strong> Inquiries relating to legal declarations, bonds, work
          authorization, salary requirements, consent, or EEO demographics are permanently guarded. By architectural
          invariant, AI suggestions, synthetic answers, and automatic profile fills are disabled for core categories.
          Every submission requires explicit user decision.
        </div>
      </div>

      {/* Filter and Tab Navigation Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          background: '#ffffff',
          padding: '0.75rem 1rem',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button
            onClick={() => setActiveTab('active')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: activeTab === 'active' ? '600' : '500',
              border: 'none',
              background: activeTab === 'active' ? '#0f172a' : 'transparent',
              color: activeTab === 'active' ? '#ffffff' : '#64748b',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Active Inquiries
          </button>
          <button
            onClick={() => setActiveTab('deferred')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: activeTab === 'deferred' ? '600' : '500',
              border: 'none',
              background: activeTab === 'deferred' ? '#0f172a' : 'transparent',
              color: activeTab === 'deferred' ? '#ffffff' : '#64748b',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Snoozed / Deferred
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: activeTab === 'history' ? '600' : '500',
              border: 'none',
              background: activeTab === 'history' ? '#0f172a' : 'transparent',
              color: activeTab === 'history' ? '#ffffff' : '#64748b',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Resolution History
          </button>
        </div>

        {/* Filter and Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: '1', maxWidth: '600px', justifyContent: 'flex-end' }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '0.45rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.8125rem',
              color: '#334155',
              background: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Categories</option>
            <option value="legal">Legal & Compliance</option>
            <option value="bond">Employment Bonds</option>
            <option value="work_auth">Work Authorization</option>
            <option value="salary">Salary Expectations</option>
            <option value="eeo">EEO & Demographics</option>
            <option value="consent">Consent & Disclaimers</option>
            <option value="company_legitimacy">Company Legitimacy</option>
            <option value="missing_profile">Profile Information</option>
            <option value="custom_question">Custom Questions</option>
          </select>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions or companies..."
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.8125rem',
              width: '240px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Main Split Layout: Inquiries List vs Detailed Decision Card */}
      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '1.25rem', alignItems: 'start' }}>
        {/* Left Column: Review Items List */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100vh - 280px)',
          }}
        >
          <div
            style={{
              padding: '0.875rem 1rem',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#475569' }}>
              Inquiry Queue ({filteredReviews.length})
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
              Sorted by date
            </span>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '0.5rem' }}>
            {filteredReviews.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748b' }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>✓</div>
                <div style={{ fontWeight: '600', color: '#0f172a' }}>No reviews found</div>
                <div style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                  {activeTab === 'active'
                    ? 'All workflow checkpoints are clear. Automation engine is running.'
                    : 'No items match current filters.'}
                </div>
              </div>
            ) : (
              filteredReviews.map((item) => {
                const isSelected = item.id === selectedReviewId;
                const isCore = item.isCoreCategory || CORE_CATEGORIES.includes(item.category);

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedReviewId(item.id)}
                    style={{
                      padding: '0.875rem',
                      borderRadius: '8px',
                      marginBottom: '0.5rem',
                      border: isSelected ? '1.5px solid #2563eb' : '1px solid #f1f5f9',
                      background: isSelected ? '#f8fafc' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 1px 3px rgba(37, 99, 235, 0.08)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        {isCore && (
                          <span
                            title="Protected Core Category"
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: '700',
                              color: '#b45309',
                              background: '#fef3c7',
                              padding: '0.125rem 0.375rem',
                              borderRadius: '4px',
                              letterSpacing: '0.025em',
                            }}
                          >
                            🛡️ CORE
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            color: '#475569',
                            background: '#e2e8f0',
                            padding: '0.125rem 0.375rem',
                            borderRadius: '4px',
                          }}
                        >
                          {item.category.replace('_', ' ')}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: '600',
                          padding: '0.125rem 0.4rem',
                          borderRadius: '9999px',
                          fontVariantNumeric: 'tabular-nums',
                          background:
                            item.status === 'pending'
                              ? '#fef3c7'
                              : item.status === 'approved' || item.status === 'answered'
                              ? '#dcfce7'
                              : item.status === 'deferred'
                              ? '#ede9fe'
                              : '#fee2e2',
                          color:
                            item.status === 'pending'
                              ? '#b45309'
                              : item.status === 'approved' || item.status === 'answered'
                              ? '#15803d'
                              : item.status === 'deferred'
                              ? '#6d28d9'
                              : '#b91c1c',
                        }}
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#0f172a', marginBottom: '0.25rem', lineHeight: '1.3' }}>
                      {item.question}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>{item.companyName || 'Application Target'}</span>
                      {item.jobTitle && (
                        <>
                          <span>•</span>
                          <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.jobTitle}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detailed Decision Card */}
        {selectedReview ? (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            {/* Header section with category & status */}
            <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {selectedReview.isCoreCategory ? (
                    <span
                      style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        border: '1px solid #fde68a',
                        padding: '0.25rem 0.625rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <span>🛡️</span> PROTECTED CORE CATEGORY
                    </span>
                  ) : (
                    <span
                      style={{
                        background: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #e2e8f0',
                        padding: '0.25rem 0.625rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                      }}
                    >
                      {selectedReview.category.replace('_', ' ')}
                    </span>
                  )}

                  {selectedReview.checkpointStep && (
                    <span
                      style={{
                        background: '#f8fafc',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                      }}
                    >
                      step:{selectedReview.checkpointStep}
                    </span>
                  )}
                </div>

                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                  Requested {new Date(selectedReview.createdAt).toLocaleDateString()} at{' '}
                  {new Date(selectedReview.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', margin: '0.5rem 0 0.25rem 0' }}>
                {selectedReview.question}
              </h2>

              <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.25rem' }}>
                Company: <strong style={{ color: '#334155' }}>{selectedReview.companyName || 'Not specified'}</strong>
                {selectedReview.jobTitle && (
                  <>
                    {' '}| Position: <strong style={{ color: '#334155' }}>{selectedReview.jobTitle}</strong>
                  </>
                )}
              </div>
            </div>

            {/* Context & Uncertainty Details */}
            {(selectedReview.uncertaintyReason || Object.keys(selectedReview.context || {}).length > 0) && (
              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  padding: '1rem',
                  fontSize: '0.8125rem',
                }}
              >
                <div style={{ fontWeight: '600', color: '#475569', marginBottom: '0.375rem' }}>
                  Checkpoint Context & Reason for Review:
                </div>
                {selectedReview.uncertaintyReason && (
                  <div style={{ color: '#b45309', marginBottom: '0.5rem', fontWeight: '500' }}>
                    ⚠️ {selectedReview.uncertaintyReason}
                  </div>
                )}
                {Object.keys(selectedReview.context || {}).length > 0 && (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '0.625rem',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: '#334155',
                      maxHeight: '120px',
                      overflowY: 'auto',
                    }}
                  >
                    {JSON.stringify(selectedReview.context, null, 2)}
                  </div>
                )}
              </div>
            )}

            {/* AI Suggestion section (ONLY present for non-core categories) */}
            {!selectedReview.isCoreCategory && selectedReview.suggestedAnswer !== undefined && selectedReview.suggestedAnswer !== null && (
              <div
                style={{
                  background: '#f0fdf4',
                  borderRadius: '8px',
                  border: '1px solid #bbf7d0',
                  padding: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#166534' }}>
                    🤖 Assistant Suggestion (Non-core inquiry)
                  </span>
                  {selectedReview.suggestionConfidence !== null && selectedReview.suggestionConfidence !== undefined && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: '#15803d',
                        background: '#dcfce7',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '4px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {Math.round(selectedReview.suggestionConfidence * 100)}% Confidence
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '0.875rem', color: '#14532d', fontWeight: '500', marginBottom: '0.5rem' }}>
                  Suggested Answer: <code>{String(selectedReview.suggestedAnswer)}</code>
                </div>

                {selectedReview.suggestionRationale && (
                  <div style={{ fontSize: '0.75rem', color: '#166534', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                    Rationale: {selectedReview.suggestionRationale}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setFormAnswer(selectedReview.suggestedAnswer)}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    border: '1px solid #86efac',
                    background: '#ffffff',
                    color: '#166534',
                    cursor: 'pointer',
                  }}
                >
                  Use This Suggested Answer
                </button>
              </div>
            )}

            {/* Core Category Warning Reminder */}
            {selectedReview.isCoreCategory && (
              <div
                style={{
                  background: '#fef3c7',
                  borderRadius: '8px',
                  border: '1px solid #fde68a',
                  padding: '0.875rem 1rem',
                  fontSize: '0.8125rem',
                  color: '#92400e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                }}
              >
                <span>⚠️</span>
                <span>
                  <strong>Strict Human Input Required:</strong> No suggestions or guesses were generated by AI for this
                  question. Please provide your explicit statement.
                </span>
              </div>
            )}

            {/* Input Form based on ResponseSchema */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: '600', color: '#0f172a' }}>
                Your Answer / Explicit Decision:
              </label>

              {/* Render dynamic control */}
              {selectedReview.responseSchema?.type === 'boolean' ? (
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setFormAnswer(true)}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      border: formAnswer === true ? '2px solid #16a34a' : '1px solid #cbd5e1',
                      background: formAnswer === true ? '#f0fdf4' : '#ffffff',
                      color: formAnswer === true ? '#166534' : '#334155',
                      fontWeight: formAnswer === true ? '700' : '500',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    ✓ Yes / Confirm / Authorize
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormAnswer(false)}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      border: formAnswer === false ? '2px solid #dc2626' : '1px solid #cbd5e1',
                      background: formAnswer === false ? '#fef2f2' : '#ffffff',
                      color: formAnswer === false ? '#991b1b' : '#334155',
                      fontWeight: formAnswer === false ? '700' : '500',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    ✕ No / Decline
                  </button>
                </div>
              ) : selectedReview.responseSchema?.type === 'radio' && selectedReview.responseSchema.options ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedReview.responseSchema.options.map((opt, idx) => (
                    <label
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.625rem',
                        padding: '0.625rem 0.875rem',
                        borderRadius: '6px',
                        border: formAnswer === opt.value ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        background: formAnswer === opt.value ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      <input
                        type="radio"
                        name="reviewAnswer"
                        checked={formAnswer === opt.value}
                        onChange={() => setFormAnswer(opt.value)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: formAnswer === opt.value ? '600' : '400', color: '#0f172a' }}>
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              ) : selectedReview.responseSchema?.type === 'select' && selectedReview.responseSchema.options ? (
                <select
                  value={String(formAnswer ?? '')}
                  onChange={(e) => setFormAnswer(e.target.value)}
                  style={{
                    padding: '0.625rem 0.875rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    color: '#0f172a',
                    background: '#ffffff',
                  }}
                >
                  <option value="">-- Select an option --</option>
                  {selectedReview.responseSchema.options.map((opt, idx) => (
                    <option key={idx} value={String(opt.value)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : selectedReview.responseSchema?.type === 'number' ? (
                <input
                  type="number"
                  value={formAnswer === null || formAnswer === undefined ? '' : String(formAnswer)}
                  onChange={(e) => setFormAnswer(e.target.value === '' ? null : Number(e.target.value))}
                  placeholder={selectedReview.responseSchema?.placeholder || 'Enter numeric value...'}
                  min={selectedReview.responseSchema?.min}
                  max={selectedReview.responseSchema?.max}
                  style={{
                    padding: '0.625rem 0.875rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
              ) : (
                <textarea
                  rows={3}
                  value={formAnswer === null || formAnswer === undefined ? '' : String(formAnswer)}
                  onChange={(e) => setFormAnswer(e.target.value)}
                  placeholder={selectedReview.responseSchema?.placeholder || 'Type your explicit declaration or answer...'}
                  style={{
                    padding: '0.625rem 0.875rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              )}
            </div>

            {/* Optional Reusable Answer Sync */}
            <div
              style={{
                border: '1px dashed #cbd5e1',
                borderRadius: '8px',
                padding: '0.875rem',
                background: '#fafafa',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
                <input
                  type="checkbox"
                  checked={saveReusable}
                  onChange={(e) => setSaveReusable(e.target.checked)}
                />
                <span style={{ fontWeight: '600', color: '#334155' }}>
                  Save as reusable answer for matching future applications
                </span>
              </label>

              {saveReusable && (
                <div style={{ marginTop: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>
                    Reusable Knowledge Key:
                  </label>
                  <input
                    type="text"
                    value={reusableKey}
                    onChange={(e) => setReusableKey(e.target.value)}
                    placeholder="e.g. work_auth_us_citizen"
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.8125rem',
                      fontFamily: 'monospace',
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                    Note: For core categories, saving reusable knowledge stores your explicit human confirmation.
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons: Submit / Snooze / Cancel */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid #f1f5f9',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleRespond(selectedReview.requiredAction || 'answer')}
                  disabled={actionLoading || formAnswer === '' || formAnswer === null || formAnswer === undefined}
                  style={{
                    padding: '0.625rem 1.25rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    border: 'none',
                    background:
                      actionLoading || formAnswer === '' || formAnswer === null || formAnswer === undefined
                        ? '#94a3b8'
                        : '#0f172a',
                    color: '#ffffff',
                    cursor:
                      actionLoading || formAnswer === '' || formAnswer === null || formAnswer === undefined
                        ? 'not-allowed'
                        : 'pointer',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {actionLoading ? 'Submitting...' : '✓ Submit & Resume Workflow'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Snooze control */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <select
                    value={deferHours}
                    onChange={(e) => setDeferHours(Number(e.target.value))}
                    disabled={actionLoading}
                    style={{
                      padding: '0.5rem 0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.8125rem',
                      color: '#475569',
                      background: '#ffffff',
                    }}
                  >
                    <option value={1}>1 hour</option>
                    <option value={4}>4 hours</option>
                    <option value={24}>24 hours</option>
                    <option value={72}>3 days</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleDefer}
                    disabled={actionLoading}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.8125rem',
                      fontWeight: '500',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#475569',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ⏰ Snooze
                  </button>
                </div>

                {/* Cancel Request */}
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={actionLoading}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.8125rem',
                    fontWeight: '500',
                    border: '1px solid #fecaca',
                    background: '#ffffff',
                    color: '#dc2626',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '4rem 2rem',
              textAlign: 'center',
              color: '#64748b',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#0f172a', margin: '0 0 0.5rem 0' }}>
              Select a Review Inquiry
            </h3>
            <p style={{ fontSize: '0.875rem', maxWidth: '400px', margin: '0 auto' }}>
              Choose a pending review from the left panel to inspect the question, view step context, and confirm your decision.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}