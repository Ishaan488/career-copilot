'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  FileText,
  Send,
  Clock,
  CheckCircle,
  ChevronRight,
  Shield,
  LayoutGrid,
  List,
  Search,
  ExternalLink,
  Sparkles,
  Calendar,
  AlertCircle,
  Award,
  XCircle,
} from 'lucide-react';
import type { PipelineStage } from '@/modules/tracking';

interface ApplicationItem {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  status: string;
  platform: string;
  applicationUrl: string;
  submissionSource: string | null;
  appliedAt: string | null;
  lastActivityAt: string | null;
  updatedAt: string;
  notes: string | null;
  pipelineStage: PipelineStage;
}

const STAGE_CONFIG: Record<
  PipelineStage,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; border: string; bg: string }
> = {
  draft_review: {
    label: 'Draft & Review',
    icon: Clock,
    color: 'text-amber-400',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/10',
  },
  applied: {
    label: 'Applied & Under Review',
    icon: Send,
    color: 'text-blue-400',
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/10',
  },
  interviewing: {
    label: 'Interviewing',
    icon: Calendar,
    color: 'text-purple-400',
    border: 'border-purple-500/20',
    bg: 'bg-purple-500/10',
  },
  offer: {
    label: 'Offer',
    icon: Award,
    color: 'text-emerald-400',
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/10',
  },
  closed: {
    label: 'Closed',
    icon: XCircle,
    color: 'text-zinc-400',
    border: 'border-zinc-700/50',
    bg: 'bg-zinc-800/40',
  },
};

export default function ApplicationsPage() {
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');

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

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      if (stageFilter !== 'all' && app.pipelineStage !== stageFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = app.jobTitle.toLowerCase().includes(q);
        const matchesCompany = (app.companyName || '').toLowerCase().includes(q);
        const matchesPlatform = (app.platform || '').toLowerCase().includes(q);
        const matchesStatus = app.status.toLowerCase().includes(q);
        return matchesTitle || matchesCompany || matchesPlatform || matchesStatus;
      }
      return true;
    });
  }, [apps, stageFilter, searchQuery]);

  const appsByStage = useMemo(() => {
    const map: Record<PipelineStage, ApplicationItem[]> = {
      draft_review: [],
      applied: [],
      interviewing: [],
      offer: [],
      closed: [],
    };
    for (const app of filteredApps) {
      if (map[app.pipelineStage]) {
        map[app.pipelineStage].push(app);
      } else {
        map.closed.push(app);
      }
    }
    return map;
  }, [filteredApps]);

  function getStatusBadge(status: string) {
    switch (status) {
      case 'ready_to_submit':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3 h-3" />
            Ready to Submit
          </span>
        );
      case 'awaiting_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Awaiting Review
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Send className="w-3 h-3" />
            Submitted
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Clock className="w-3 h-3" />
            Under Review
          </span>
        );
      case 'interview_scheduled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Calendar className="w-3 h-3" />
            Interview Scheduled
          </span>
        );
      case 'interview_completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <CheckCircle className="w-3 h-3" />
            Interview Done
          </span>
        );
      case 'assessment_received':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <FileText className="w-3 h-3" />
            Assessment
          </span>
        );
      case 'offer_received':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <Award className="w-3 h-3 text-emerald-400" />
            Offer Received
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'withdrawn':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-700/30 text-zinc-400 border border-zinc-700/50">
            Withdrawn
          </span>
        );
      case 'submission_unverified':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertCircle className="w-3 h-3" />
            Unverified
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/50 capitalize">
            {status.replace(/_/g, ' ')}
          </span>
        );
    }
  }

  const stages: PipelineStage[] = ['draft_review', 'applied', 'interviewing', 'offer', 'closed'];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2.5">
              <FileText className="w-6 h-6 text-emerald-400" />
              Applications Tracker
            </h1>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {apps.length}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Complete lifecycle tracking, recruiter interactions, scheduled interviews, and verified status flow.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 active:scale-[0.98] transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            Live Operations
          </Link>
          <Link
            href="/review"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 active:scale-[0.98] transition-all"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            Review Center
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.98] transition-all shadow-sm"
          >
            Browse Jobs
          </Link>
        </div>
      </div>

      {/* Control bar: Search, Stage Filter, and View Mode Toggle */}
      <div className="p-3 mb-6 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by role, company, or platform..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
            />
          </div>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none focus:border-zinc-700"
          >
            <option value="all">All Stages ({apps.length})</option>
            <option value="draft_review">Draft & Review</option>
            <option value="applied">Applied & Under Review</option>
            <option value="interviewing">Interviewing</option>
            <option value="offer">Offer</option>
            <option value="closed">Closed / Archived</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800 self-start md:self-auto">
          <button
            onClick={() => setViewMode('kanban')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'kanban'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Kanban
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'table'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Table
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading applications...</p>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-12 text-center">
          <FileText className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-zinc-200">No applications found</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            {searchQuery || stageFilter !== 'all'
              ? 'Try adjusting your search or stage filters.'
              : 'Applications can be launched from any recommended or shortlisted job in the Jobs tab.'}
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
      ) : viewMode === 'kanban' ? (
        /* KANBAN BOARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
          {stages.map((stageKey) => {
            const stage = STAGE_CONFIG[stageKey];
            const items = appsByStage[stageKey];
            const StageIcon = stage.icon;

            return (
              <div
                key={stageKey}
                className="rounded-xl bg-zinc-900/40 border border-zinc-800/80 overflow-hidden flex flex-col min-h-[500px]"
              >
                {/* Column Header */}
                <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/70 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`p-1 rounded-md ${stage.bg} ${stage.color} shrink-0`}>
                      <StageIcon className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-zinc-200 truncate">{stage.label}</span>
                  </div>
                  <span
                    className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {items.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto">
                  {items.length === 0 ? (
                    <div className="p-6 text-center text-xs text-zinc-600 border border-dashed border-zinc-800/80 rounded-lg">
                      Empty
                    </div>
                  ) : (
                    items.map((app) => (
                      <Link
                        key={app.id}
                        href={`/applications/${app.id}`}
                        className="block p-3 rounded-lg bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-850 active:scale-[0.98] transition-all group"
                      >
                        <div className="space-y-2">
                          <div>
                            <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-400 transition-colors line-clamp-1">
                              {app.jobTitle}
                            </h4>
                            <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-medium">
                              {app.companyName || 'Unknown Company'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {getStatusBadge(app.status)}
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400">
                              {app.platform}
                            </span>
                          </div>

                          <div className="pt-1.5 border-t border-zinc-800/50 flex items-center justify-between text-[10px] text-zinc-500">
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {app.lastActivityAt
                                ? `Active ${new Date(app.lastActivityAt).toLocaleDateString()}`
                                : `Updated ${new Date(app.updatedAt).toLocaleDateString()}`}
                            </span>
                            <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Role & Company</th>
                  <th className="py-3 px-4">Platform</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Applied</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredApps.map((app) => {
                  const stage = STAGE_CONFIG[app.pipelineStage] || STAGE_CONFIG.closed;
                  return (
                    <tr key={app.id} className="hover:bg-zinc-800/30 transition-colors group">
                      <td className="py-3.5 px-4">
                        <Link href={`/applications/${app.id}`} className="block">
                          <div className="font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors">
                            {app.jobTitle}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">
                            {app.companyName || 'Unknown Company'}
                          </div>
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] capitalize text-zinc-400">
                        {app.platform}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${stage.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${stage.color.replace('text-', 'bg-')}`} />
                          {stage.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">{getStatusBadge(app.status)}</td>
                      <td className="py-3.5 px-4 font-mono text-zinc-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-zinc-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {app.lastActivityAt ? new Date(app.lastActivityAt).toLocaleDateString() : new Date(app.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {app.applicationUrl && (
                            <a
                              href={app.applicationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                              title="Open portal"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <Link
                            href={`/applications/${app.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium active:scale-[0.98] transition-all"
                          >
                            Details
                            <ChevronRight className="w-3 h-3 text-zinc-400" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
