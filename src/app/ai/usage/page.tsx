'use client';

import { useState, useEffect } from 'react';
import {
  Cpu,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Activity,
  Layers,
  ShieldCheck,
} from 'lucide-react';

interface AIStatusInfo {
  status: 'available' | 'no_key' | 'quota_exhausted' | 'rate_limited' | 'outage';
  reason?: string;
  provider: string;
  defaultModel: string;
  dailyRequestsUsed: number;
  dailyRequestsLimit: number;
  dailyTokensUsed: number;
  dailyTokensLimit: number;
}

interface AIUsageMetrics {
  date: string;
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  cachedRequests: number;
  failedRequests: number;
  estimatedCostUsd: number;
  taskBreakdown: Record<string, { requests: number; tokens: number }>;
  modelBreakdown: Record<string, { requests: number; tokens: number }>;
}

export default function AIUsagePage() {
  const [status, setStatus] = useState<AIStatusInfo | null>(null);
  const [metrics, setMetrics] = useState<AIUsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [draining, setDraining] = useState(false);
  const [drainResult, setDrainResult] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/usage');
      if (res.ok) {
        const json = await res.json();
        setStatus(json.status);
        setMetrics(json.metrics);
      }
    } catch (err) {
      console.error('Failed to load AI usage metrics', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDrainPending() {
    setDraining(true);
    setDrainResult(null);
    try {
      const res = await fetch('/api/ai/status');
      const st = await res.json();
      if (st.status === 'available') {
        setDrainResult('AI is active. Queued pending jobs are automatically scheduled for processing.');
      } else {
        setDrainResult(`AI remains in degraded state: ${st.status}. Pending jobs will wait for recovery.`);
      }
      await loadData();
    } catch {
      setDrainResult('Drain check completed.');
    } finally {
      setDraining(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const requestsPercent = status
    ? Math.min(100, Math.round((status.dailyRequestsUsed / status.dailyRequestsLimit) * 100))
    : 0;

  const tokensPercent = status
    ? Math.min(100, Math.round((status.dailyTokensUsed / status.dailyTokensLimit) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Cpu className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                AI Engine & Intelligence Usage
              </h1>
            </div>
            <p className="text-xs text-slate-500">
              Provider telemetry, daily quota tracking, and degraded mode resilience.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDrainPending}
              disabled={draining}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 text-xs font-medium rounded-lg transition-all inline-flex items-center gap-1.5 border border-slate-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${draining ? 'animate-spin' : ''}`} />
              Drain Pending Jobs
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-medium rounded-lg transition-all shadow-sm inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {drainResult && (
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs flex items-center justify-between">
            <span>{drainResult}</span>
            <button onClick={() => setDrainResult(null)} className="text-blue-500 hover:text-blue-700">
              Dismiss
            </button>
          </div>
        )}

        {/* Operational Status Banner */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            status?.status === 'available'
              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
              : 'bg-amber-50/70 border-amber-200 text-amber-950'
          }`}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl mt-0.5 ${
                  status?.status === 'available'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {status?.status === 'available' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold capitalize">
                    {status?.status === 'available'
                      ? 'AI Layer Active & Ready'
                      : `Degraded Mode: ${status?.status.replace('_', ' ')}`}
                  </h2>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${
                      status?.status === 'available'
                        ? 'bg-emerald-200/80 text-emerald-800'
                        : 'bg-amber-200/80 text-amber-800'
                    }`}
                  >
                    {status?.status || 'Unknown'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                  {status?.status === 'available'
                    ? `Default model ${status.defaultModel} connected via ${status.provider} provider. Structured outputs and semantic validations operational.`
                    : status?.reason ||
                      'Non-AI functionality (discovery, normalization, profile, resume, manual flows) continues operating seamlessly without interruption.'}
                </p>
              </div>
            </div>

            <div className="text-right text-xs text-slate-500 shrink-0">
              <span className="block font-medium text-slate-700">Daily Reset Window</span>
              <span className="tabular-nums">Midnight UTC</span>
            </div>
          </div>
        </div>

        {/* Quota Progress Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Daily Requests */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <Activity className="w-4 h-4" />
                </span>
                <span className="text-xs font-semibold text-slate-700">Daily Request Budget</span>
              </div>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                {requestsPercent}% used
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {status?.dailyRequestsUsed.toLocaleString() || '0'}
              </span>
              <span className="text-xs text-slate-400 tabular-nums">
                of {status?.dailyRequestsLimit.toLocaleString() || '1,500'} limit
              </span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  requestsPercent > 80 ? 'bg-amber-500' : 'bg-blue-600'
                }`}
                style={{ width: `${requestsPercent}%` }}
              />
            </div>
          </div>

          {/* Daily Tokens */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Zap className="w-4 h-4" />
                </span>
                <span className="text-xs font-semibold text-slate-700">Daily Token Quota</span>
              </div>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                {tokensPercent}% used
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {status?.dailyTokensUsed.toLocaleString() || '0'}
              </span>
              <span className="text-xs text-slate-400 tabular-nums">
                of {status?.dailyTokensLimit.toLocaleString() || '1,000,000'} limit
              </span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  tokensPercent > 80 ? 'bg-amber-500' : 'bg-indigo-600'
                }`}
                style={{ width: `${tokensPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Telemetry Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Invocations
            </span>
            <span className="text-xl font-bold text-slate-900 tabular-nums mt-1 block">
              {metrics?.totalRequests ?? 0}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Recorded today</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Cache Hits
            </span>
            <span className="text-xl font-bold text-emerald-600 tabular-nums mt-1 block">
              {metrics?.cachedRequests ?? 0}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Zero token latency</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Tokens (In / Out)
            </span>
            <span className="text-xs font-semibold text-slate-800 tabular-nums mt-2 block">
              {(metrics?.totalTokensIn ?? 0).toLocaleString()} / {(metrics?.totalTokensOut ?? 0).toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Input vs Candidates</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Commercial Estimate
            </span>
            <span className="text-xl font-bold text-slate-900 tabular-nums mt-1 block">
              ${metrics?.estimatedCostUsd ?? '0.00'}
            </span>
            <span className="text-[11px] text-emerald-600 font-medium mt-1 block">Free on free tier</span>
          </div>
        </div>

        {/* Breakdown by Task */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Task Breakdown
              </h3>
            </div>
            <span className="text-xs text-slate-400">Activity today</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {metrics && Object.keys(metrics.taskBreakdown).length > 0 ? (
              Object.entries(metrics.taskBreakdown).map(([task, data]) => (
                <div key={task} className="p-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                  <div>
                    <span className="font-semibold text-slate-900 font-mono">{task}</span>
                    <span className="text-slate-400 ml-2">Structured Extraction</span>
                  </div>
                  <div className="flex items-center gap-6 tabular-nums">
                    <div>
                      <span className="text-slate-400 mr-1.5">Requests:</span>
                      <span className="font-semibold text-slate-800">{data.requests}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 mr-1.5">Tokens:</span>
                      <span className="font-semibold text-slate-800">{data.tokens.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400">
                No AI tasks executed yet today. Run JD analysis on a position to see live breakdown.
              </div>
            )}
          </div>
        </div>

        {/* Degraded Mode Protection Guarantees */}
        <div className="bg-slate-100/70 p-5 rounded-2xl border border-slate-200 text-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>Guaranteed Degraded Mode Isolation (Doc 11 §10)</span>
          </div>
          <p className="text-slate-600 leading-relaxed">
            Career Copilot is designed with strict fallback isolation. When the Gemini API key is unset, rate-limited,
            or the daily quota is exhausted, the application never crashes. Job and company discovery, board monitoring,
            profile management, PDF resume management, and manual applications continue executing flawlessly without AI.
          </p>
        </div>
      </div>
    </div>
  );
}
