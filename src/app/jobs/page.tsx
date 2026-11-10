'use client';

import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Search,
  ExternalLink,
  Plus,
  Link as LinkIcon,
  CheckCircle,
  XCircle,
  Clock,
  Building,
  MapPin,
  DollarSign,
  ChevronRight,
  X,
  RefreshCw,
  Bookmark,
  Send,
} from 'lucide-react';

interface JobItem {
  id: string;
  title: string;
  normalizedTitle: string;
  seniority: string | null;
  locationRaw: string | null;
  city: string | null;
  country: string | null;
  workMode: string;
  employmentType: string | null;
  compMin: string | null;
  compMax: string | null;
  compCurrency: string | null;
  compPeriod: string | null;
  compDisclosed: boolean;
  postedAt: string | null;
  canonicalUrl: string | null;
  applicationUrl: string | null;
  status: string;
  statusReason: string | null;
  possibleDuplicateOf: string | null;
  company: {
    id: string;
    name: string;
    primaryDomain: string | null;
  } | null;
}

interface JobDetail extends JobItem {
  descriptionText: string;
  descriptionHtml: string | null;
  listings: Array<{
    id: string;
    externalId: string;
    listingUrl: string;
    status: string;
    source: {
      id: string;
      name: string;
      type: string;
    } | null;
  }>;
  history: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    actor: string;
    reason: string | null;
    at: string;
  }>;
}

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'recommended', label: 'Recommended' },
  { id: 'shortlisted', label: 'Shortlisted' },
  { id: 'saved', label: 'Saved' },
  { id: 'applied', label: 'Applied' },
  { id: 'closed', label: 'Closed' },
  { id: 'archived', label: 'Archived' },
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [seniorityFilter, setSeniorityFilter] = useState('');
  const [workModeFilter, setWorkModeFilter] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  // Import modal state
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Manual job modal state
  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [manualWorkMode, setManualWorkMode] = useState<string>('unknown');
  const [manualCreating, setManualCreating] = useState(false);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'all') params.append('status', activeTab);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (seniorityFilter) params.append('seniority', seniorityFilter);
      if (workModeFilter) params.append('workMode', workModeFilter);

      const res = await fetch(`/api/jobs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setTotal(data.total || 0);
      }
    } catch {
      // Ignore network errors in polling/fetching
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [activeTab, seniorityFilter, workModeFilter]);

  // Fetch job detail
  useEffect(() => {
    if (!selectedJobId) {
      setJobDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/jobs/${selectedJobId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setJobDetail(data);
      })
      .finally(() => setLoadingDetail(false));
  }, [selectedJobId]);

  const handleStatusTransition = async (toStatus: string, reason?: string) => {
    if (!selectedJobId) return;
    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatus, reason }),
      });
      if (res.ok) {
        const updated = await res.json();
        // Update in lists
        setJobs((prev) => prev.map((j) => (j.id === updated.id ? { ...j, status: updated.status } : j)));
        if (jobDetail && jobDetail.id === updated.id) {
          setJobDetail({
            ...jobDetail,
            status: updated.status,
            history: [
              {
                id: `tmp-${Date.now()}`,
                fromStatus: jobDetail.status,
                toStatus: updated.status,
                actor: 'user',
                reason: reason || null,
                at: new Date().toISOString(),
              },
              ...jobDetail.history,
            ],
          });
        }
      }
    } catch {
      // Handle error
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch('/api/jobs/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || 'Failed to import job');
      } else {
        setShowImportModal(false);
        setImportUrl('');
        fetchJobs();
        if (data.job?.id) setSelectedJobId(data.job.id);
      }
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualDescription.trim()) return;
    setManualCreating(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: manualTitle.trim(),
          descriptionText: manualDescription.trim(),
          applicationUrl: manualUrl.trim() || null,
          locationRaw: manualLocation.trim() || null,
          workMode: manualWorkMode,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowManualModal(false);
        setManualTitle('');
        setManualDescription('');
        setManualUrl('');
        setManualLocation('');
        fetchJobs();
        if (data.job?.id) setSelectedJobId(data.job.id);
      }
    } finally {
      setManualCreating(false);
    }
  };

  const formatCompensation = (job: JobItem) => {
    if (!job.compDisclosed || (!job.compMin && !job.compMax)) return null;
    const cur = job.compCurrency || 'INR';
    const period = job.compPeriod ? `/${job.compPeriod}` : '';
    const min = job.compMin ? Number(job.compMin).toLocaleString() : '';
    const max = job.compMax ? Number(job.compMax).toLocaleString() : '';

    if (min && max && min !== max) {
      return `${cur} ${min} – ${max} ${period}`;
    }
    return `${cur} ${min || max} ${period}`;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; border: string }> = {
      new: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
      under_analysis: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
      recommended: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
      shortlisted: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
      saved: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
      applied: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
      closed: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' },
      rejected: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
      archived: { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300' },
    };

    const c = config[status] || { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border} capitalize tabular-nums`}>
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-slate-700" />
            Job Discovery
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Deduplicated jobs aggregated across synced company portals, ATS boards, and direct imports.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-[transform,background-color] duration-150"
          >
            <LinkIcon className="w-4 h-4 text-slate-500" />
            Import URL
          </button>
          <button
            onClick={() => setShowManualModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg shadow-sm hover:bg-slate-800 active:scale-[0.98] transition-[transform,background-color] duration-150"
          >
            <Plus className="w-4 h-4" />
            Add Manual Job
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="mt-6 flex flex-col gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap active:scale-[0.98] transition-[transform,color,background-color] duration-150 ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search jobs by title, company, skills, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchJobs()}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={seniorityFilter}
              onChange={(e) => setSeniorityFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">All Seniorities</option>
              <option value="intern">Intern</option>
              <option value="junior">Junior</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
              <option value="staff">Staff</option>
              <option value="principal">Principal</option>
              <option value="director">Director</option>
            </select>

            <select
              value={workModeFilter}
              onChange={(e) => setWorkModeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">All Work Modes</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>

            <button
              onClick={fetchJobs}
              className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50 active:scale-[0.98] transition-[transform,background-color] duration-150"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Job Count Stats */}
      <div className="mt-4 text-xs text-slate-500 tabular-nums">
        Found {total} positions matching current filters
      </div>

      {/* Job Cards List */}
      <div className="mt-4 grid grid-cols-1 gap-3">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
            <Briefcase className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No job postings found</p>
            <p className="text-xs text-slate-400 mt-1">
              {activeTab !== 'all'
                ? `No jobs in '${activeTab}' status. Switch tabs or trigger a source sync.`
                : 'Import a job URL or sync career boards to populate.'}
            </p>
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              onClick={() => setSelectedJobId(job.id)}
              className={`p-4 bg-white border rounded-xl hover:shadow-sm cursor-pointer transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.99] flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                selectedJobId === job.id ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-slate-900 tracking-tight truncate">
                    {job.title}
                  </h3>
                  {getStatusBadge(job.status)}
                  {job.seniority && (
                    <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-md capitalize">
                      {job.seniority}
                    </span>
                  )}
                  {job.workMode && job.workMode !== 'unknown' && (
                    <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-md capitalize">
                      {job.workMode}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                  {job.company && (
                    <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      {job.company.name}
                    </span>
                  )}
                  {job.locationRaw && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {job.locationRaw}
                    </span>
                  )}
                  {formatCompensation(job) && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium tabular-nums">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                      {formatCompensation(job)}
                    </span>
                  )}
                  {job.postedAt && (
                    <span className="inline-flex items-center gap-1 tabular-nums text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(job.postedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Slide-out Job Details Drawer */}
      {selectedJobId && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/30 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {jobDetail && getStatusBadge(jobDetail.status)}
                  {jobDetail?.workMode && jobDetail.workMode !== 'unknown' && (
                    <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded capitalize">
                      {jobDetail.workMode}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  {jobDetail?.title || 'Loading position...'}
                </h2>
                {jobDetail?.company && (
                  <p className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-slate-400" />
                    {jobDetail.company.name}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedJobId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg active:scale-[0.98] transition-[transform,background-color] duration-150"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Actions Toolbar */}
            {jobDetail && (
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {jobDetail.status !== 'shortlisted' && (
                    <button
                      onClick={() => handleStatusTransition('shortlisted', 'Shortlisted by user')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 active:scale-[0.98] transition-[transform,background-color] duration-150"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Shortlist
                    </button>
                  )}
                  {jobDetail.status !== 'saved' && (
                    <button
                      onClick={() => handleStatusTransition('saved', 'Saved for later')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 active:scale-[0.98] transition-[transform,background-color] duration-150"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      Save
                    </button>
                  )}
                  {jobDetail.status !== 'applied' && (
                    <button
                      onClick={() => handleStatusTransition('applied', 'Applied externally')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 active:scale-[0.98] transition-[transform,background-color] duration-150"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Mark Applied
                    </button>
                  )}
                  {jobDetail.status !== 'rejected' && (
                    <button
                      onClick={() => handleStatusTransition('rejected', 'Not interested')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 active:scale-[0.98] transition-[transform,background-color] duration-150"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  )}
                </div>

                {jobDetail.canonicalUrl && (
                  <a
                    href={jobDetail.canonicalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 active:scale-[0.98] transition-transform duration-150"
                  >
                    Open Listing <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingDetail ? (
                <div className="py-12 text-center text-slate-400">Loading position details...</div>
              ) : jobDetail ? (
                <>
                  {/* Meta Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div>
                      <span className="text-slate-400 block">Location</span>
                      <span className="font-medium text-slate-800">{jobDetail.locationRaw || 'Unspecified'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Seniority</span>
                      <span className="font-medium text-slate-800 capitalize">{jobDetail.seniority || 'General'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Compensation</span>
                      <span className="font-medium text-slate-800 tabular-nums">
                        {formatCompensation(jobDetail) || 'Undisclosed'}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Job Description
                    </h4>
                    <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-line leading-relaxed font-sans">
                      {jobDetail.descriptionText}
                    </div>
                  </div>

                  {/* Source Listings */}
                  {jobDetail.listings && jobDetail.listings.length > 0 && (
                    <div className="border-t border-slate-200 pt-6">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Source Listings ({jobDetail.listings.length})
                      </h4>
                      <div className="space-y-2">
                        {jobDetail.listings.map((l) => (
                          <div
                            key={l.id}
                            className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-medium text-slate-800">{l.source?.name || 'Manual'}</span>
                              <span className="text-slate-400 ml-2">ID: {l.externalId}</span>
                            </div>
                            <a
                              href={l.listingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 font-medium"
                            >
                              View <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status Audit Trail */}
                  {jobDetail.history && jobDetail.history.length > 0 && (
                    <div className="border-t border-slate-200 pt-6">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Status History
                      </h4>
                      <div className="space-y-2">
                        {jobDetail.history.map((h) => (
                          <div
                            key={h.id}
                            className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="capitalize text-slate-500 font-medium">{h.fromStatus}</span>
                              <span className="text-slate-400">→</span>
                              <span className="capitalize font-semibold text-slate-900">{h.toStatus}</span>
                              {h.reason && <span className="text-slate-500 italic">({h.reason})</span>}
                            </div>
                            <div className="text-slate-400 tabular-nums">
                              {new Date(h.at).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Import URL Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-slate-700" />
                Import Job from URL
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="mt-4 space-y-4">
              <p className="text-xs text-slate-500">
                Paste any job posting URL (Greenhouse, Lever, Ashby, SmartRecruiters, or standard careers page).
                The job will be parsed, deduplicated, and added to your pipeline.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Job Posting URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://boards.greenhouse.io/.../jobs/..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>

              {importError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                  {importError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg active:scale-[0.98] transition-[transform,background-color] duration-150"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 active:scale-[0.98] transition-[transform,background-color] duration-150"
                >
                  {importing ? 'Importing...' : 'Import Position'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Job Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-slate-700" />
                Add Position Manually
              </h3>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Position Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Backend Engineer"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Work Mode
                  </label>
                  <select
                    value={manualWorkMode}
                    onChange={(e) => setManualWorkMode(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <option value="unknown">Unknown / Flexible</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">On-site</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bengaluru, India"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Application / Listing URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://company.com/careers/..."
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Job Description *
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Paste complete job description or key responsibilities..."
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg active:scale-[0.98] transition-[transform,background-color] duration-150"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualCreating}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 active:scale-[0.98] transition-[transform,background-color] duration-150"
                >
                  {manualCreating ? 'Creating...' : 'Create Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
