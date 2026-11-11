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
  const [notes, setNotes] = useState('');
  const [confirmedSuccess, setConfirmedSuccess] = useState(false);

  useEffect(() => {
    fetchDetail();
  }, [id]);

  async function fetchDetail() {
    try {
      setLoading(true);
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
      const res = await fetch(`/api/applications/${id}/confirm-submitted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        setConfirmedSuccess(true);
        fetchDetail();
      }
    } catch {
      // ignore
    } finally {
      setConfirming(false);
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-zinc-800 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-zinc-100">{app.jobTitle}</h1>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                isSubmitted
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : isHandoverReady
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700/50'
              }`}
            >
              {app.status}
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

      {/* Manual Handover Card */}
      {isHandoverReady && !isSubmitted && (
        <div className="mb-8 p-6 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-3 flex-1">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Ready for Manual Handover</h3>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                  All form fields and answers have been prepared and verified against your candidate profile.
                  Automated submission is disabled by policy. Please open the portal, inspect the application, and
                  click submit yourself.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <a
                  href={app.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium active:scale-[0.98] transition-all shadow-sm"
                >
                  <ExternalLink className="w-4 h-4" />
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
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {confirming ? 'Recording...' : confirmedSuccess ? 'Submitted!' : 'I submitted it'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submitted Confirmation Card */}
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
