import React from 'react';
import Link from 'next/link';
import {
  Briefcase,
  ThumbsUp,
  AlertCircle,
  Clock,
  Calendar,
  Activity,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  getDashboardStats,
  getNeedsAttentionItems,
  getUpcomingDeadlines,
  getRecentActivity,
} from '@/modules/tracking';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [stats, attention, deadlines, recentActivity] = await Promise.all([
    getDashboardStats(),
    getNeedsAttentionItems(),
    getUpcomingDeadlines(),
    getRecentActivity(8),
  ]);

  const metricTiles = [
    {
      label: 'New Today',
      count: stats.newToday,
      href: '/jobs?status=new',
      icon: Briefcase,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10 border-blue-500/20',
      description: 'Discovered in last 24h',
    },
    {
      label: 'Worth Considering',
      count: stats.worthConsidering,
      href: '/recommended',
      icon: ThumbsUp,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      description: 'Suitability ≥ consider',
    },
    {
      label: 'Needs Review',
      count: stats.needsReview,
      href: '/review',
      icon: AlertCircle,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10 border-amber-500/20',
      description: 'Human approval requests',
    },
    {
      label: 'In Progress',
      count: stats.inProgress,
      href: '/applications',
      icon: Clock,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10 border-indigo-500/20',
      description: 'Active applications',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header & Worker Heartbeat */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Operations Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Local-first intelligence, job evaluations, and tracked application lifecycles.
          </p>
        </div>

        {/* Worker Heartbeat Status Pill */}
        <div className="flex items-center gap-2">
          {stats.worker.online ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <Wifi className="w-3.5 h-3.5" />
              Worker Online
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <WifiOff className="w-3.5 h-3.5" />
              Worker Offline (Gap &gt; 60s)
            </div>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.label}
              href={tile.href}
              className="group block p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {tile.label}
                </span>
                <div className={`p-2 rounded-lg border ${tile.bg}`}>
                  <Icon className={`w-4 h-4 ${tile.color}`} />
                </div>
              </div>
              <div
                className="text-3xl font-extrabold text-slate-900 dark:text-slate-100"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {tile.count}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                <span>{tile.description}</span>
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Grid: Needs Attention & Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs Your Attention */}
        <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Needs Your Attention
              </h2>
              {attention.reviews.length > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  {attention.reviews.length} pending
                </span>
              )}
            </div>

            {attention.reviews.length === 0 && attention.unverifiedSubmissions.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
                Nothing requires human intervention right now.
              </div>
            ) : (
              <div className="space-y-3">
                {attention.unverifiedSubmissions.map((sub) => (
                  <Link
                    key={sub.submissionId}
                    href={`/applications/${sub.applicationId}`}
                    className="block p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-colors"
                  >
                    <div className="text-xs font-semibold text-rose-500 flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Unverified Submission Resolution Required
                    </div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {sub.companyName} &bull; {sub.jobTitle}
                    </div>
                  </Link>
                ))}

                {attention.reviews.map((rev) => (
                  <Link
                    key={rev.id}
                    href={`/review/${rev.id}`}
                    className="block p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50 dark:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <span className="uppercase font-semibold tracking-wider text-amber-500">
                        {rev.category}
                      </span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm text-slate-900 dark:text-slate-100 font-medium line-clamp-1">
                      {rev.question}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80">
            <Link
              href="/review"
              className="text-xs font-semibold text-blue-500 hover:underline flex items-center gap-1"
            >
              Open Human Review Center
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </section>

        {/* Upcoming Deadlines & Interviews */}
        <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500" />
                Upcoming Interviews &amp; Deadlines
              </h2>
              {deadlines.interviews.length > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  {deadlines.interviews.length} scheduled
                </span>
              )}
            </div>

            {deadlines.interviews.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                No upcoming interviews scheduled yet.
              </div>
            ) : (
              <div className="space-y-3">
                {deadlines.interviews.map((iv) => (
                  <Link
                    key={iv.id}
                    href={`/applications/${iv.applicationId}`}
                    className="block p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50 dark:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <span className="font-semibold text-indigo-500 uppercase tracking-wider">
                        {iv.stage.replace('_', ' ')}
                      </span>
                      <span
                        className="font-medium text-slate-700 dark:text-slate-300"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {new Date(iv.scheduledAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-sm text-slate-900 dark:text-slate-100 font-medium">
                      {iv.companyName} &bull; {iv.title}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80">
            <Link
              href="/applications"
              className="text-xs font-semibold text-blue-500 hover:underline flex items-center gap-1"
            >
              View Application Tracker
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </section>
      </div>

      {/* Recent Activity Timeline */}
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-emerald-500" />
          Recent Automation &amp; Lifecycle Timeline
        </h2>

        {recentActivity.length === 0 ? (
          <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            No chronological lifecycle activity recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {recentActivity.map((event) => (
              <div key={event.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {event.companyName}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                      {event.type.replace('_', ' ')}
                      {event.toStatus ? ` &rarr; ${event.toStatus.replace('_', ' ')}` : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs text-slate-500 dark:text-slate-400"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <Link
                    href={`/applications/${event.applicationId}`}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
