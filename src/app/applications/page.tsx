'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Send,
  Clock,
  CheckCircle,
  ChevronRight,
  Shield,
  Layers,
} from 'lucide-react';

interface ApplicationSummary {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  status: string;
  platform: string;
  applicationUrl: string;
  submissionSource: string | null;
  appliedAt: string | null;
  updatedAt: string;
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApplications();
  }, []);

  async function fetchApplications() {
    try {
      setLoading(true);
      const res = await fetch('/api/applications');
      if (res.ok) {
        const data = await res.json();
        setApps(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'ready_to_submit':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3.5 h-3.5" />
            Ready to Submit
          </span>
        );
      case 'awaiting_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" />
            Awaiting Review
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Send className="w-3.5 h-3.5" />
            Submitted
          </span>
        );
      case 'preparing':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            <Layers className="w-3.5 h-3.5" />
            Preparing
          </span>
        );
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-emerald-400" />
            Applications
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Automated form preparation, human verification, and manual handover center.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/review"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 active:scale-[0.98] transition-all border border-zinc-700/60"
          >
            <Shield className="w-4 h-4 text-amber-400" />
            Review Center
          </Link>
        </div>
      </div>

      {/* Zero Fabrication Invariant Banner */}
      <div className="mb-6 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-start gap-3">
        <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-zinc-300">
          <span className="font-semibold text-zinc-100">Zero-Fabrication Level 2 Preparation:</span>{' '}
          All application forms are parsed via local Playwright automation. Sensitive disclosures, salary, and legal
          declarations pause strictly for human approval. Submission is manual by default.
        </div>
      </div>

      {/* Applications List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading applications...</p>
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-12 text-center">
          <FileText className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-zinc-200">No applications initiated yet</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            Applications can be launched from any recommended or shortlisted job in the Jobs tab.
          </p>
          <div className="mt-5">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 active:scale-[0.98] transition-all"
            >
              Browse Jobs
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 divide-y divide-zinc-800/60 overflow-hidden">
          {apps.map((app) => (
            <Link
              key={app.id}
              href={`/applications/${app.id}`}
              className="block p-5 hover:bg-zinc-800/40 transition-colors group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-zinc-100 group-hover:text-emerald-400 transition-colors truncate">
                      {app.jobTitle}
                    </h3>
                    {getStatusBadge(app.status)}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                    <span className="font-medium text-zinc-300">{app.companyName || 'Unknown Company'}</span>
                    <span>•</span>
                    <span className="capitalize">{app.platform}</span>
                    <span>•</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      Updated {new Date(app.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {app.status === 'ready_to_submit' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                      Handover Ready
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
