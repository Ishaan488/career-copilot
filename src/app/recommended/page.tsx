'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  CheckCircle2,
  Building,
  MapPin,
  ChevronRight,
  Award,
  BookmarkCheck,
} from 'lucide-react';

interface RecommendedJob {
  id: string;
  title: string;
  companyId: string | null;
  companyName: string | null;
  companyLogoUrl: string | null;
  location: string | null;
  workMode: string | null;
  seniority: string | null;
  score: string | null;
  recommendation: string | null;
  status: string;
  statusReason: string | null;
  postedAt: string | null;
  firstDiscoveredAt: string;
}

export default function RecommendedPage() {
  const [jobs, setJobs] = useState<RecommendedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRec, setFilterRec] = useState<string>('all');
  const [shortlistingId, setShortlistingId] = useState<string | null>(null);

  const fetchRecommended = async () => {
    setLoading(true);
    try {
      let url = '/api/recommended?limit=100';
      if (filterRec !== 'all') {
        url += `&recommendation=${filterRec}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error('Failed to load recommended jobs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommended();
  }, [filterRec]);

  const handleQuickShortlist = async (jobId: string) => {
    setShortlistingId(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus: 'shortlisted',
          reason: 'Quick shortlisted from Recommended view',
        }),
      });
      if (res.ok) {
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: 'shortlisted' } : j))
        );
      }
    } catch (err) {
      console.error('Failed to shortlist', err);
    } finally {
      setShortlistingId(null);
    }
  };

  const stronglyCount = jobs.filter(
    (j) => j.recommendation === 'strongly_recommended'
  ).length;
  const avgScore =
    jobs.length > 0
      ? (
          jobs.reduce((acc, j) => acc + (Number(j.score) || 0), 0) / jobs.length
        ).toFixed(1)
      : '0.0';

  const getRecommendationBadge = (rec: string | null) => {
    switch (rec) {
      case 'strongly_recommended':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Strongly Recommended
          </span>
        );
      case 'recommended':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Recommended
          </span>
        );
      case 'consider':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Consider
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            {rec || 'Unrated'}
          </span>
        );
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <Award className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Recommended Jobs
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Roles meeting all mandatory eligibility criteria, ranked strictly by multi-component suitability score.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl text-xs">
          {[
            { id: 'all', label: 'All Opportunities' },
            { id: 'strongly_recommended', label: 'Strongly Recommended' },
            { id: 'recommended', label: 'Recommended' },
            { id: 'consider', label: 'Consider' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterRec(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all active:scale-[0.98] ${
                filterRec === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <span className="text-xs text-slate-500 block">Total Recommended Roles</span>
          <span className="text-2xl font-bold text-slate-900 tabular-nums">
            {jobs.length}
          </span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <span className="text-xs text-slate-500 block">Top Fits (≥ 85 Score)</span>
          <span className="text-2xl font-bold text-emerald-600 tabular-nums">
            {stronglyCount}
          </span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <span className="text-xs text-slate-500 block">Average Suitability Score</span>
          <span className="text-2xl font-bold text-indigo-600 tabular-nums">
            {avgScore} <span className="text-xs font-normal text-slate-400">/ 100</span>
          </span>
        </div>
      </div>

      {/* Invariant Policy Notice */}
      <div className="p-3.5 bg-gradient-to-r from-emerald-50/50 to-indigo-50/50 border border-emerald-100 rounded-xl text-xs text-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Zero-Fabrication Guarantee:</strong> Jobs failing any mandatory eligibility rule (skills, work authorization, or location constraints) are strictly excluded from recommendations.
          </span>
        </div>
        <Link
          href="/jobs"
          className="text-indigo-600 hover:text-indigo-800 font-medium shrink-0 ml-4 inline-flex items-center gap-1 active:scale-[0.98] transition-transform"
        >
          View All Postings <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Job Cards List */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          Calculating match rankings and suitability scores...
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-20 text-center bg-white border border-slate-200 rounded-2xl p-8 space-y-3">
          <Award className="w-8 h-8 text-slate-300 mx-auto" />
          <h3 className="text-base font-semibold text-slate-700">No Recommended Jobs Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Jobs will appear here once discovered and evaluated. Sync job sources or check your candidate profile skills to discover matches.
          </p>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-medium rounded-xl transition-all shadow-sm"
          >
            Go to Jobs
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const scoreNum = Number(job.score) || 0;
            return (
              <div
                key={job.id}
                className="p-5 bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl shadow-sm transition-all duration-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                {/* Left Column: Job Info */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/jobs?selected=${job.id}`}
                      className="text-base font-semibold text-slate-900 hover:text-indigo-600 transition-colors tracking-tight truncate"
                    >
                      {job.title}
                    </Link>
                    {getRecommendationBadge(job.recommendation)}
                    {job.status === 'shortlisted' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                        <BookmarkCheck className="w-3 h-3 text-purple-600" /> Shortlisted
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                    {job.companyName && (
                      <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        {job.companyName}
                      </span>
                    )}
                    {job.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {job.location}
                      </span>
                    )}
                    {job.workMode && (
                      <span className="px-2 py-0.5 text-[11px] bg-slate-100 text-slate-700 rounded-md capitalize">
                        {job.workMode}
                      </span>
                    )}
                    {job.seniority && (
                      <span className="px-2 py-0.5 text-[11px] bg-slate-100 text-slate-700 rounded-md capitalize">
                        {job.seniority}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Column: Score Meter & Actions */}
                <div className="flex items-center gap-6 self-stretch sm:self-center shrink-0 justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                  {/* Score Meter */}
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      Suitability Match
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ease-out ${
                            scoreNum >= 85
                              ? 'bg-emerald-500'
                              : scoreNum >= 70
                              ? 'bg-indigo-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${scoreNum}%` }}
                        />
                      </div>
                      <span className="text-base font-bold text-slate-900 tabular-nums">
                        {scoreNum.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {job.status !== 'shortlisted' ? (
                      <button
                        onClick={() => handleQuickShortlist(job.id)}
                        disabled={shortlistingId === job.id}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 active:scale-[0.98] text-indigo-700 font-medium text-xs rounded-xl transition-all border border-indigo-200 inline-flex items-center gap-1.5"
                      >
                        <BookmarkCheck className="w-3.5 h-3.5 text-indigo-600" />
                        {shortlistingId === job.id ? 'Saving...' : 'Shortlist'}
                      </button>
                    ) : (
                      <span className="text-xs text-purple-700 font-medium px-2 py-1 bg-purple-50 rounded-lg">
                        Saved
                      </span>
                    )}
                    <Link
                      href={`/jobs?selected=${job.id}`}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 font-medium text-xs rounded-xl transition-all inline-flex items-center gap-1"
                    >
                      Details <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
