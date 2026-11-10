'use client';

import { useEffect, useState } from 'react';

interface WorkerState {
  online: boolean;
  lastSeenAt: string | null;
  ageSeconds: number;
}

export function WorkerStatusPill() {
  const [status, setStatus] = useState<WorkerState | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setStatus(data.worker);
      } else {
        setStatus({ online: false, lastSeenAt: null, ageSeconds: 999 });
      }
    } catch {
      setStatus({ online: false, lastSeenAt: null, ageSeconds: 999 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
        <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse"></span>
        Checking worker...
      </span>
    );
  }

  const isOnline = status?.online ?? false;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${
        isOnline
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-rose-50 text-rose-700 border border-rose-200'
      }`}
      title={
        isOnline
          ? `Worker active (seen ${status?.ageSeconds ?? 0}s ago)`
          : 'Worker offline — job discovery and background tasks paused'
      }
    >
      <span
        className={`w-2 h-2 rounded-full ${
          isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
        }`}
      ></span>
      {isOnline ? 'Worker Online' : 'Worker Offline'}
    </span>
  );
}
