'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  CheckCircle2,
  Clock,
  Send,
  ArrowLeft,
  Layers,
  AlertTriangle,
  ShieldCheck,
  RotateCcw,
  XCircle,
  Zap,
} from 'lucide-react';

interface ApplicationDetail {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  status: string;
  platform: string;
  applicationUrl: string;
  submissionSource: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  summaryHash?: string;
  canAutomate?: boolean;
  authorization?: {
    id: string;
    summaryHash: string;
    expiresAt: string;
    revokedAt?: string | null;
    createdAt: string;
  } | null;
  latestSubmission?: {
    id: string;
    status: string;
    attemptNo: number;
    clickedAt?: string | null;
    verifiedAt?: string | null;
    screenshotPath?: string | null;
    error?: string | null;
  } | null;
  tasks: Array<{
    id: string;
    step: string;
    status: string;
    error?: string | null;
    createdAt: string;
  }>;
  fields: Array<{
    field: {
      id: string;
      fieldKey: string;
      label: string;
      type: string;
      required: boolean;
      category: string;
    };
    answer: {
      id: string;
      answer: unknown;
      decision: string;
      source: string;
      status: string;
    } | null;
  }>;
}

export default function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchDetail();
  }, [id]);

  async function fetchDetail() {
    try {
      setLoading(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}`);
      if (res.ok) {
        const data = await res.json();
        setApp(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmSubmitted() {
    if (!app) return;
    try {
      setConfirming(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/confirm-submitted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        await fetchDetail();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to confirm submission.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  async function handleAuthorizeSubmission() {
    if (!app?.summaryHash) return;
    try {
      setAuthorizing(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/authorize-submission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summaryHash: app.summaryHash,
          notes: 'Authorized via application detail UI',
        }),
      });
      if (res.ok) {
        await fetchDetail();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to authorize automated submission.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setAuthorizing(false);
    }
  }

  async function handleRevokeAuthorization() {
    try {
      setRevoking(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/revoke-authorization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Revoked by user via UI' }),
      });
      if (res.ok) {
        await fetchDetail();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to revoke authorization.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setRevoking(false);
    }
  }

  async function handleSubmitApplication() {
    try {
      setSubmitting(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/submit`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchDetail();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Automated submission encountered an issue.');
        await fetchDetail();
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
      await fetchDetail();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolveUnverified(resolution: 'confirm_submitted' | 'retry_confirmed' | 'abandon') {
    try {
      setResolving(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/resolve-unverified`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution, notes: resolutionNotes }),
      });
      if (res.ok) {
        await fetchDetail();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to resolve unverified submission.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setResolving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-zinc-500">
        <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-3" />
        <p className="text-sm">Loading application details...</p>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-lg font-medium text-zinc-200">Application not found</h2>
        <Link href="/applications" className="text-xs text-emerald-400 hover:underline mt-2 inline-block">
          Return to applications
        </Link>
      </div>
    );
  }

  const isHandoverReady = app.status === 'ready_to_submit';
  const isSubmitted = app.status === 'submitted';
  const isUnverified = app.status === 'submission_unverified';
  const isAuthorized =
    Boolean(app.authorization) &&
    !app.authorization?.revokedAt &&
    new Date(app.authorization?.expiresAt || 0) > new Date();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back button */}
      <Link
        href="/applications"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Applications
      </Link>

      {/* Global Action Error Alert */}
      {actionError && (
        <div className="mb-6 p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-rose-200">Action Notice:</span> {actionError}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-zinc-800 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-zinc-100">{app.jobTitle}</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                isSubmitted
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : isUnverified
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : isHandoverReady
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-300 border border-zinc-700/50'
              }`}
            >
              {isUnverified && <AlertTriangle className="w-3 h-3 text-amber-400" />}
              {app.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            {app.companyName || 'Unknown Company'} • Platform: <span className="capitalize">{app.platform}</span>
          </p>
        </div>

        {app.applicationUrl && (
          <a
            href={app.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 active:scale-[0.98] transition-all self-start"
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            Portal Link
          </a>
        )}
      </div>

      {/* 1. UNVERIFIED SUBMISSION RESOLUTION CARD */}
      {isUnverified && (
        <div className="mb-8 p-6 rounded-xl bg-amber-950/25 border border-amber-500/40">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-4 flex-1">
              <div>
                <h3 className="text-sm font-semibold text-amber-200">Submission Verification Required (Idempotency Safe)</h3>
                <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                  The automated submission click was dispatched to the portal, but post-submit confirmation could not be verified automatically (evidence inconclusive or timed out).
                  To prevent duplicate applications, automatic retry is locked. Please inspect your email inbox or portal status and choose a resolution below.
                </p>
                {app.latestSubmission?.error && (
                  <p className="text-xs text-amber-300/90 font-mono mt-2 bg-amber-950/40 p-2 rounded border border-amber-500/20">
                    Observation: {app.latestSubmission.error}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Optional resolution notes (e.g. Received confirmation email #1234)"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {/* Option 1: Confirm submitted */}
                  <button
                    onClick={() => handleResolveUnverified('confirm_submitted')}
                    disabled={resolving}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm Submitted (Email Received)
                  </button>

                  {/* Option 2: Retry confirmed */}
                  <button
                    onClick={() => handleResolveUnverified('retry_confirmed')}
                    disabled={resolving}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset to Ready to Submit (Not Received)
                  </button>

                  {/* Option 3: Abandon */}
                  <button
                    onClick={() => handleResolveUnverified('abandon')}
                    disabled={resolving}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4 text-zinc-400" />
                    Abandon Submission
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. READY TO SUBMIT SECTION */}
      {isHandoverReady && !isSubmitted && (
        <div className="space-y-6 mb-8">
          {/* Card A: Manual Handover (Default flow per Doc 10 §5 and Q14) */}
          <div className="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-3 flex-1">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Manual Browser Handover (Default)</h3>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Form answers and resume are pre-filled and verified. You can open the portal, perform a final review of the form, and click submit yourself.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <a
                    href={app.applicationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium border border-zinc-700 active:scale-[0.98] transition-all shadow-sm"
                  >
                    <ExternalLink className="w-4 h-4 text-emerald-400" />
                    Open Application Portal
                  </a>

                  <input
                    type="text"
                    placeholder="Optional notes or confirmation #"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="px-3 py-2 text-xs rounded-lg bg-zinc-900/90 border border-zinc-700 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />

                  <button
                    onClick={handleConfirmSubmitted}
                    disabled={confirming}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {confirming ? 'Recording...' : 'I submitted it'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card B: Level 2 Approved Automated Submission */}
          {app.canAutomate && (
            <div className="p-6 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-4 flex-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-zinc-100">Approved Automated Submission (Level 2)</h3>
                      {isAuthorized && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <ShieldCheck className="w-3 h-3" />
                          Authorized
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                      Two-gate safety policy active. Automated submission requires explicit per-application authorization bound to the cryptographic summary hash of your form answers and resume. Authorizations expire automatically in 24 hours.
                    </p>
                  </div>

                  {/* Summary Hash Preview */}
                  {app.summaryHash && (
                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="font-mono truncate">
                        <span className="text-zinc-500">Summary Hash: </span>
                        <span className="text-emerald-400">{app.summaryHash}</span>
                      </div>
                      {isAuthorized && app.authorization && (
                        <div className="text-zinc-400 text-[10px] whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          Expires: {new Date(app.authorization.expiresAt).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {isAuthorized ? (
                      <>
                        <button
                          onClick={handleSubmitApplication}
                          disabled={submitting}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-[0.98] transition-all disabled:opacity-50 shadow-md"
                        >
                          <Send className="w-4 h-4" />
                          {submitting ? 'Executing Automated Submission...' : 'Submit Application Now'}
                        </button>

                        <button
                          onClick={handleRevokeAuthorization}
                          disabled={revoking}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                          {revoking ? 'Revoking...' : 'Revoke Authorization'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleAuthorizeSubmission}
                        disabled={authorizing}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        {authorizing ? 'Authorizing...' : 'Authorize Automated Submission (24h)'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. SUBMITTED CONFIRMATION CARD */}
      {isSubmitted && (
        <div className="mb-8 p-5 rounded-xl bg-blue-950/20 border border-blue-500/30 flex items-start gap-3">
          <Send className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-zinc-300">
            <span className="font-semibold text-zinc-100">Application Submitted:</span>{' '}
            Marked as submitted via{' '}
            <span className="text-blue-300 font-mono">{app.submissionSource || 'manual_confirmed'}</span> on{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {app.appliedAt ? new Date(app.appliedAt).toLocaleString() : 'N/A'}
            </span>
            . Lifecycle tracking and interview monitoring are active.
          </div>
        </div>
      )}

      {/* Form Fields & Resolved Answers */}
      <div className="space-y-4 mb-8">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          Extracted Form Fields & Answers ({app.fields.length})
        </h3>

        {app.fields.length === 0 ? (
          <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-500">
            Form extraction in progress or portal pending navigation.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 divide-y divide-zinc-800/60 overflow-hidden">
            {app.fields.map(({ field, answer }) => (
              <div key={field.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-200">{field.label}</span>
                    {field.required && <span className="text-xs text-rose-400 font-bold">*</span>}
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {field.category}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    Type: <span className="text-zinc-300 font-mono">{field.type}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  {answer ? (
                    <div className="text-right">
                      <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 max-w-xs truncate">
                        {answer.answer !== null ? String(answer.answer) : `[${answer.decision}]`}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 capitalize">
                        Source: {answer.source} • Status: {answer.status}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500 italic">No answer resolved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workflow Task Execution Audit Log */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          Workflow Tasks Audit
        </h3>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 divide-y divide-zinc-800/60 overflow-hidden">
          {app.tasks.map((task) => (
            <div key={task.id} className="p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    task.status === 'done'
                      ? 'bg-emerald-400'
                      : task.status === 'pending'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                  }`}
                />
                <span className="font-mono text-zinc-300">{task.step}</span>
              </div>

              <div className="flex items-center gap-3 text-zinc-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span className="capitalize">{task.status}</span>
                <span>•</span>
                <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
