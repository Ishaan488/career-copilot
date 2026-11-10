'use client';

import React, { useState, useEffect } from 'react';
import {
  Layers,
  RefreshCw,
  Plus,
  CheckCircle,
  AlertTriangle,
  Clock,
  Play,
  Building,
  X,
} from 'lucide-react';

interface SourceItem {
  id: string;
  name: string;
  type: string;
  origin: string;
  companyName: string | null;
  status: string;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  latestSyncRun: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    newCount: number;
    changedCount: number;
    unchangedCount: number;
    failedCount: number;
    error: string | null;
  } | null;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // New source form state
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState('rss_feed');
  const [feedUrl, setFeedUrl] = useState('');
  const [creatingSource, setCreatingSource] = useState(false);

  const fetchSources = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sources');
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch {
      // Ignore network errors in polling
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleReconcile = async () => {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = await fetch('/api/sources/reconcile', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setReconcileResult(`Reconciled ${data.reconciledCount} boards (${data.createdCount} created, ${data.updatedCount} updated).`);
        fetchSources();
      }
    } catch {
      setReconcileResult('Failed to reconcile sources');
    } finally {
      setReconciling(false);
    }
  };

  const handleSyncSource = async (sourceId: string) => {
    setSyncingId(sourceId);
    try {
      const res = await fetch(`/api/sources/${sourceId}/sync`, { method: 'POST' });
      if (res.ok) {
        fetchSources();
      }
    } catch {
      // Handle error
    } finally {
      setSyncingId(null);
    }
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName.trim()) return;
    setCreatingSource(true);
    try {
      let config: Record<string, unknown> = {};
      if (sourceType === 'rss_feed') {
        config = { feedUrl: feedUrl.trim() };
      }

      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sourceName.trim(),
          type: sourceType,
          config,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setSourceName('');
        setFeedUrl('');
        fetchSources();
      }
    } finally {
      setCreatingSource(false);
    }
  };

  const getStatusBadge = (status: string, failures: number) => {
    if (failures >= 3 || status === 'failing') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-3 h-3" /> Failing
        </span>
      );
    }
    if (status === 'running') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <RefreshCw className="w-3 h-3 animate-spin" /> Syncing
        </span>
      );
    }
    if (status === 'disabled') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-300">
          Disabled
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle className="w-3 h-3" /> Active
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-slate-700" />
            Job Sources & ATS Adapters
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure, reconcile, and trigger synchronization across confirmed ATS boards and feeds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-[transform,background-color] duration-150 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${reconciling ? 'animate-spin' : ''}`} />
            {reconciling ? 'Reconciling...' : 'Reconcile Boards'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg shadow-sm hover:bg-slate-800 active:scale-[0.98] transition-[transform,background-color] duration-150"
          >
            <Plus className="w-4 h-4" />
            Add Custom Source
          </button>
        </div>
      </div>

      {reconcileResult && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center justify-between">
          <span>{reconcileResult}</span>
          <button onClick={() => setReconcileResult(null)} className="text-blue-500 hover:text-blue-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sources List */}
      <div className="mt-6 grid grid-cols-1 gap-4">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading sources...</div>
        ) : sources.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
            <Layers className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No job sources configured</p>
            <p className="text-xs text-slate-400 mt-1">
              Click &apos;Reconcile Boards&apos; to automatically derive sources from your confirmed company career pages.
            </p>
          </div>
        ) : (
          sources.map((source) => (
            <div
              key={source.id}
              className="p-5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-[border-color,box-shadow] duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                    {source.name}
                  </h3>
                  {getStatusBadge(source.status, source.consecutiveFailures)}
                  <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-md font-mono uppercase">
                    {source.type}
                  </span>
                  <span className="px-2 py-0.5 text-xs bg-slate-50 text-slate-500 rounded-md capitalize">
                    {source.origin.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                  {source.companyName && (
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      {source.companyName}
                    </span>
                  )}
                  {source.lastSuccessAt && (
                    <span className="inline-flex items-center gap-1 tabular-nums text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Last sync: {new Date(source.lastSuccessAt).toLocaleString()}
                    </span>
                  )}
                  {source.latestSyncRun && (
                    <span className="inline-flex items-center gap-1.5 tabular-nums text-slate-600">
                      <span className="text-emerald-700 font-medium">+{source.latestSyncRun.newCount} new</span>
                      <span className="text-amber-700 font-medium">~{source.latestSyncRun.changedCount} changed</span>
                      <span className="text-slate-500">={source.latestSyncRun.unchangedCount} unchanged</span>
                    </span>
                  )}
                </div>

                {source.lastError && (
                  <p className="text-xs text-rose-600 font-medium">
                    Error: {source.lastError}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={() => handleSyncSource(source.id)}
                  disabled={syncingId === source.id || source.status === 'running'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 active:scale-[0.98] transition-[transform,background-color] duration-150 disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 text-slate-600 ${syncingId === source.id ? 'animate-spin' : ''}`} />
                  {syncingId === source.id ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Custom Source Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-slate-700" />
                Add Custom Job Source
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSource} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Source Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hacker News Tech Jobs RSS"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Source Type
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="rss_feed">RSS / Atom Feed</option>
                </select>
              </div>

              {sourceType === 'rss_feed' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Feed URL *
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://example.com/jobs/feed.xml"
                    value={feedUrl}
                    onChange={(e) => setFeedUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg active:scale-[0.98] transition-[transform,background-color] duration-150"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingSource}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 active:scale-[0.98] transition-[transform,background-color] duration-150"
                >
                  {creatingSource ? 'Creating...' : 'Create Source'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
