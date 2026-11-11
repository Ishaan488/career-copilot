'use client';

import React, { useState, useEffect } from 'react';

interface Company {
  id: string;
  name: string;
  normalizedName: string;
  primaryDomain: string | null;
  industry: string | null;
  sizeRange: string | null;
  hqCountry: string | null;
  websiteUrl: string | null;
  notes: string | null;
  discoveryStatus: string;
  origin: string;
  registeredAt: string;
  excludedAt: string | null;
  excludeReason: string | null;
  createdAt: string;
  monitor?: {
    id: string;
    enabled: boolean;
    checkIntervalHours: number;
    status: string;
    lastCheckedAt: string | null;
    openingsCount: number | null;
    consecutiveFailures: number;
  } | null;
  careerPagesCount?: number;
}

interface ProbeCandidate {
  id: string;
  atsType: string;
  slug: string;
  outcome: string;
  displayedName: string | null;
  nameMatchScore: string | null;
  domainMatch: boolean | null;
  status: string;
  probedAt: string;
}

interface CareerPage {
  id: string;
  url: string;
  atsType: string;
  boardId: string | null;
  status: string;
  verification: string;
  confirmedAt: string | null;
  lastCheckedAt: string | null;
}

interface CheckRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  openingsCount: number | null;
  boardAlive: boolean | null;
  error: string | null;
}

interface CompanyDetail extends Company {
  domains: { id: string; domain: string; kind: string; verification: string }[];
  careerPages: CareerPage[];
  recentCheckRuns: CheckRun[];
  probeCandidates: ProbeCandidate[];
}

interface ResearchEvidenceItem {
  id?: string;
  signalType: string;
  sourceUrl: string;
  contentSnippet: string;
  confidence: number;
}

interface ResearchReport {
  id: string;
  companyId: string;
  provider: string;
  legitimacyStatus: 'verified' | 'some_concerns' | 'high_concern' | 'insufficient_evidence';
  legitimacyScore: number;
  signals: Record<string, unknown>;
  riskFactors: Array<{ code: string; severity: string; description: string }>;
  summary: string;
  researchedAt: string;
  expiresAt: string;
  evidence: ResearchEvidenceItem[];
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCompany, setSelectedCompany] = useState<CompanyDetail | null>(null);
  const [_detailLoading, setDetailLoading] = useState(false);
  const [researchReport, setResearchReport] = useState<ResearchReport | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Add Company Form State
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newCareerUrl, setNewCareerUrl] = useState('');
  const [newIndustry, setNewIndustry] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Bulk Import Form State
  const [importContent, setImportContent] = useState('');
  const [importSource, setImportSource] = useState<'paste' | 'csv'>('paste');

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/companies?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch companies');
      const data = await res.json();
      setCompanies(data.items || []);
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Error fetching companies', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCompanies();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter]);

  const fetchCompanyResearch = async (companyId: string) => {
    try {
      setResearchLoading(true);
      const res = await fetch(`/api/companies/${companyId}/research`);
      if (res.ok) {
        const data = await res.json();
        setResearchReport(data);
      } else {
        setResearchReport(null);
      }
    } catch {
      setResearchReport(null);
    } finally {
      setResearchLoading(false);
    }
  };

  const viewCompanyDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      setResearchReport(null);
      const res = await fetch(`/api/companies/${id}`);
      if (!res.ok) throw new Error('Failed to load company details');
      const data = await res.json();
      setSelectedCompany(data);
      fetchCompanyResearch(id);
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Error loading details', type: 'error' });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setActionLoading(true);
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          primaryDomain: newDomain.trim() || undefined,
          careerUrl: newCareerUrl.trim() || undefined,
          industry: newIndustry.trim() || undefined,
          notes: newNotes.trim() || undefined,
          origin: 'manual',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Failed to add company');
      }

      setShowAddModal(false);
      setNewName('');
      setNewDomain('');
      setNewCareerUrl('');
      setNewIndustry('');
      setNewNotes('');
      setMessage({ text: 'Company successfully added!', type: 'success' });
      await fetchCompanies();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Error adding company', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importContent.trim()) return;

    try {
      setActionLoading(true);
      const res = await fetch('/api/companies/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: importContent,
          source: importSource,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Bulk import failed');
      }

      const result = await res.json();
      setShowImportModal(false);
      setImportContent('');
      setMessage({
        text: `Bulk import completed: ${result.acceptedCount} accepted, ${result.rejectedCount} rejected.`,
        type: 'success',
      });
      await fetchCompanies();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Error during bulk import', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleProbeAts = async (companyId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/companies/${companyId}/probe`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'ATS probing failed');
      }
      setMessage({ text: 'ATS probing finished. Review detected candidates below.', type: 'success' });
      await viewCompanyDetail(companyId);
      await fetchCompanies();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'ATS probe error', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunCheck = async (companyId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/companies/${companyId}/check`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Check run failed');
      }
      const run = await res.json();
      const countMsg = run.openingsCount !== null ? `${run.openingsCount} openings` : 'no openings data';
      setMessage({ text: `Check run ${run.status}: ${countMsg}`, type: 'success' });
      await viewCompanyDetail(companyId);
      await fetchCompanies();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Check run error', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmCandidate = async (candidateId: string, companyId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/companies/candidates/${candidateId}/confirm`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Failed to confirm candidate');
      }
      setMessage({ text: 'Candidate confirmed! Monitoring activated for this board.', type: 'success' });
      await viewCompanyDetail(companyId);
      await fetchCompanies();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Confirmation error', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectCandidate = async (candidateId: string, companyId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/companies/candidates/${candidateId}/reject`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reject candidate');
      setMessage({ text: 'Probe candidate rejected.', type: 'success' });
      await viewCompanyDetail(companyId);
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Rejection error', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleMonitoring = async (company: Company) => {
    const isCurrentlyEnabled = company.monitor?.enabled;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/companies/${company.id}/monitor`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !isCurrentlyEnabled }),
      });
      if (!res.ok) throw new Error('Failed to update monitor');
      setMessage({
        text: isCurrentlyEnabled ? 'Monitoring paused' : 'Monitoring resumed',
        type: 'success',
      });
      if (selectedCompany && selectedCompany.id === company.id) {
        await viewCompanyDetail(company.id);
      }
      await fetchCompanies();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Monitor toggle error', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleExcludeCompany = async (companyId: string) => {
    if (!confirm('Are you sure you want to exclude this company? It will never be monitored or sync jobs until unexcluded.')) {
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch(`/api/companies/${companyId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Excluded by user from dashboard' }),
      });
      if (!res.ok) throw new Error('Failed to exclude company');
      setMessage({ text: 'Company excluded from discovery and monitoring.', type: 'success' });
      if (selectedCompany && selectedCompany.id === companyId) {
        await viewCompanyDetail(companyId);
      }
      await fetchCompanies();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Exclusion error', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunResearch = async (companyId: string) => {
    try {
      setResearchLoading(true);
      const res = await fetch(`/api/companies/${companyId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || errData.error || 'Company research failed');
      }
      setMessage({ text: 'Company research and legitimacy verification completed!', type: 'success' });
      await fetchCompanyResearch(companyId);
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Research failed', type: 'error' });
    } finally {
      setResearchLoading(false);
    }
  };

  // Legitimacy Badge Helper
  const renderLegitimacyBadge = (status?: string, score?: number) => {
    if (!status) return null;
    const defaultStyle = { bg: '#f1f5f9', text: '#475569', label: 'Insufficient Evidence', border: '#e2e8f0' };
    const styles: Record<string, { bg: string; text: string; label: string; border: string }> = {
      verified: { bg: '#dcfce7', text: '#166534', label: 'Verified', border: '#bbf7d0' },
      some_concerns: { bg: '#fef3c7', text: '#92400e', label: 'Some Concerns', border: '#fde68a' },
      high_concern: { bg: '#fee2e2', text: '#991b1b', label: 'High Concern', border: '#fecaca' },
      insufficient_evidence: defaultStyle,
    };
    const style = styles[status] || defaultStyle;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.2rem 0.55rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: '600',
          backgroundColor: style.bg,
          color: style.text,
          border: `1px solid ${style.border}`,
        }}
      >
        <span>{style.label}</span>
        {score !== undefined && (
          <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>({Math.round(score)})</span>
        )}
      </span>
    );
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      monitoring: { bg: '#dcfce7', text: '#166534' },
      registered: { bg: '#e0f2fe', text: '#0369a1' },
      discovered: { bg: '#f1f5f9', text: '#475569' },
      paused: { bg: '#fef3c7', text: '#92400e' },
      excluded: { bg: '#fee2e2', text: '#991b1b' },
    };
    const fallbackStyle = { bg: '#f1f5f9', text: '#475569' };
    const style = colors[status] || fallbackStyle;
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.2rem 0.55rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: '600',
          textTransform: 'capitalize',
          backgroundColor: style.bg,
          color: style.text,
        }}
      >
        {status}
      </span>
    );
  };

  // Openings Count Helper (distinguishing 0 from unknown)
  const renderOpeningsCount = (count: number | null | undefined) => {
    if (count === 0) {
      return <span style={{ color: '#16a34a', fontWeight: '600' }}>0 openings</span>;
    }
    if (typeof count === 'number' && count > 0) {
      return <span style={{ color: '#2563eb', fontWeight: '700' }}>{count} openings</span>;
    }
    return <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Unknown</span>;
  };

  const totalCompanies = companies.length;
  const monitoringCount = companies.filter((c) => c.discoveryStatus === 'monitoring').length;
  const totalOpenings = companies.reduce((acc, c) => acc + (c.monitor?.openingsCount || 0), 0);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Company Discovery</h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
            Track and monitor companies independently of active job listings. Zero hardcoded lists.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setShowImportModal(true)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Import CSV / List
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            + Add Company
          </button>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            color: message.type === 'success' ? '#166534' : '#991b1b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Stats Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ backgroundColor: '#ffffff', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Tracked Companies</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a', marginTop: '0.25rem' }}>{totalCompanies}</div>
        </div>
        <div style={{ backgroundColor: '#ffffff', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Active Monitors</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#16a34a', marginTop: '0.25rem' }}>{monitoringCount}</div>
        </div>
        <div style={{ backgroundColor: '#ffffff', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Total Openings Detected</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2563eb', marginTop: '0.25rem' }}>{totalOpenings}</div>
        </div>
      </div>

      {/* Search and Filters Strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#ffffff',
          padding: '0.875rem 1rem',
          borderRadius: '0.5rem',
          border: '1px solid #e2e8f0',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ flex: '1', minWidth: '240px' }}>
          <input
            type="text"
            placeholder="Search company name or domain..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid #cbd5e1',
              fontSize: '0.875rem',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['all', 'monitoring', 'registered', 'discovered', 'paused', 'excluded'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: '600',
                textTransform: 'capitalize',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: statusFilter === st ? '#2563eb' : '#f1f5f9',
                color: statusFilter === st ? '#ffffff' : '#475569',
              }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Companies Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '0.5rem', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading companies...</div>
        ) : companies.length === 0 ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#0f172a', margin: '0 0 0.5rem 0' }}>
              No companies found
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', maxWidth: '450px', margin: '0 auto 1.25rem auto' }}>
              Add a company or import a list — nothing is monitored until you explicitly add it.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: 'none',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              + Add First Company
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Company</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Openings</th>
                <th style={{ padding: '0.75rem 1rem' }}>Monitor Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Last Checked</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                  onClick={() => viewCompanyDetail(c.id)}
                >
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <div style={{ fontWeight: '600', color: '#0f172a' }}>{c.name}</div>
                    {c.primaryDomain && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.primaryDomain}</div>
                    )}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>{renderStatusBadge(c.discoveryStatus)}</td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {renderOpeningsCount(c.monitor?.openingsCount)}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {c.monitor ? (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: c.monitor.enabled
                            ? c.monitor.status === 'ok'
                              ? '#16a34a'
                              : '#dc2626'
                            : '#94a3b8',
                        }}
                      >
                        {c.monitor.enabled ? c.monitor.status.toUpperCase() : 'PAUSED'}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>None</span>
                    )}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b', fontSize: '0.75rem' }}>
                    {c.monitor?.lastCheckedAt ? new Date(c.monitor.lastCheckedAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => viewCompanyDetail(c.id)}
                      style={{
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.75rem',
                        borderRadius: '0.25rem',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        cursor: 'pointer',
                        marginRight: '0.5rem',
                      }}
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleRunCheck(c.id)}
                      disabled={actionLoading || c.discoveryStatus === 'excluded'}
                      style={{
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.75rem',
                        borderRadius: '0.25rem',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      Check
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Company Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.5rem',
              maxWidth: '500px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: '700', margin: '0 0 1rem 0' }}>Add New Company</h3>
            <form onSubmit={handleAddCompany} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stripe, Razorpay"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                  Primary Domain (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. stripe.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                  Career Page or ATS URL (optional)
                </label>
                <input
                  type="url"
                  placeholder="e.g. https://boards.greenhouse.io/stripe"
                  value={newCareerUrl}
                  onChange={(e) => setNewCareerUrl(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                  Industry (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. FinTech, Developer Tools"
                  value={newIndustry}
                  onChange={(e) => setNewIndustry(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                  Notes (optional)
                </label>
                <textarea
                  placeholder="Personal observations or tags..."
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  {actionLoading ? 'Saving...' : 'Add Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showImportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.5rem',
              maxWidth: '550px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: '700', margin: '0 0 0.5rem 0' }}>Bulk Import Companies</h3>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>
              Paste a comma-separated list or plain text list of company names/domains (one per line).
            </p>

            <form onSubmit={handleBulkImport} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <input
                    type="radio"
                    name="importFormat"
                    checked={importSource === 'paste'}
                    onChange={() => setImportSource('paste')}
                  />
                  Plain Text / Names
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <input
                    type="radio"
                    name="importFormat"
                    checked={importSource === 'csv'}
                    onChange={() => setImportSource('csv')}
                  />
                  CSV with Headers
                </label>
              </div>

              <div>
                <textarea
                  required
                  placeholder={
                    importSource === 'csv'
                      ? 'name,domain,career_url\nStripe,stripe.com,https://boards.greenhouse.io/stripe\nPostman,postman.com,'
                      : 'Stripe\nZerodha, zerodha.com\nPostman\nrazorpay.com'
                  }
                  rows={8}
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #cbd5e1',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  {actionLoading ? 'Importing...' : 'Start Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Company Detail Drawer / Modal */}
      {selectedCompany && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 40,
          }}
          onClick={() => setSelectedCompany(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              width: '100%',
              maxWidth: '650px',
              height: '100%',
              overflowY: 'auto',
              padding: '2rem 1.5rem',
              boxShadow: '-10px 0 25px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                    {selectedCompany.name}
                  </h2>
                  {renderStatusBadge(selectedCompany.discoveryStatus)}
                </div>
                {selectedCompany.primaryDomain && (
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
                    🌐 {selectedCompany.primaryDomain}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedCompany(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button
                onClick={() => handleProbeAts(selectedCompany.id)}
                disabled={actionLoading || selectedCompany.discoveryStatus === 'excluded'}
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  borderRadius: '0.375rem',
                  border: '1px solid #2563eb',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  cursor: 'pointer',
                }}
              >
                🔍 Probe ATS Boards
              </button>
              <button
                onClick={() => handleRunCheck(selectedCompany.id)}
                disabled={actionLoading || selectedCompany.discoveryStatus === 'excluded'}
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  borderRadius: '0.375rem',
                  border: '1px solid #16a34a',
                  backgroundColor: '#f0fdf4',
                  color: '#16a34a',
                  cursor: 'pointer',
                }}
              >
                ⚡ Run Check Now
              </button>
              <button
                onClick={() => handleToggleMonitoring(selectedCompany)}
                disabled={actionLoading || selectedCompany.discoveryStatus === 'excluded'}
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  borderRadius: '0.375rem',
                  border: '1px solid #d97706',
                  backgroundColor: '#fffbeb',
                  color: '#d97706',
                  cursor: 'pointer',
                }}
              >
                {selectedCompany.monitor?.enabled ? '⏸ Pause Monitor' : '▶ Resume Monitor'}
              </button>
              <button
                onClick={() => handleRunResearch(selectedCompany.id)}
                disabled={researchLoading || selectedCompany.discoveryStatus === 'excluded'}
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  borderRadius: '0.375rem',
                  border: '1px solid #7c3aed',
                  backgroundColor: '#f5f3ff',
                  color: '#7c3aed',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                {researchLoading ? '⏳ Researching...' : '🛡️ Research & Legitimacy'}
              </button>
              {selectedCompany.discoveryStatus !== 'excluded' && (
                <button
                  onClick={() => handleExcludeCompany(selectedCompany.id)}
                  disabled={actionLoading}
                  style={{
                    padding: '0.4rem 0.8rem',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    borderRadius: '0.375rem',
                    border: '1px solid #dc2626',
                    backgroundColor: '#fef2f2',
                    color: '#dc2626',
                    cursor: 'pointer',
                  }}
                >
                  ⛔ Exclude
                </button>
              )}
            </div>

            {/* Legitimacy & Verifiable Research Section */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: '700', textTransform: 'uppercase', color: '#1e293b', margin: 0, letterSpacing: '0.05em' }}>
                    Legitimacy &amp; Research Assessment
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                    Verifiable public evidence with 180-day retention. Never fabricated.
                  </p>
                </div>
                {researchReport && renderLegitimacyBadge(researchReport.legitimacyStatus, researchReport.legitimacyScore)}
              </div>

              {researchLoading ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                  <div style={{ display: 'inline-block', marginBottom: '0.5rem', fontSize: '1.5rem' }}>⏳</div>
                  <div>Analyzing official website, HTTPS, career portal, and verifiable evidence...</div>
                </div>
              ) : !researchReport ? (
                <div style={{ padding: '1.5rem 1rem', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '0.375rem', border: '1px dashed #cbd5e1' }}>
                  <div style={{ fontSize: '0.875rem', color: '#475569', fontWeight: '500', marginBottom: '0.5rem' }}>
                    No research conducted yet
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: '380px', margin: '0 auto 1rem auto' }}>
                    Run automated website discovery to inspect official domains, SSL/TLS, physical addresses, career pages, and risk signals.
                  </p>
                  <button
                    onClick={() => handleRunResearch(selectedCompany.id)}
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: '0.375rem',
                      border: 'none',
                      backgroundColor: '#7c3aed',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    🛡️ Run Legitimacy Research
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Score Meter & Narrative */}
                  <div style={{ backgroundColor: '#f8fafc', padding: '0.875rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', textTransform: 'uppercase' }}>
                        Legitimacy Score
                      </span>
                      <span style={{ fontSize: '1.125rem', fontWeight: '700', fontVariantNumeric: 'tabular-nums', color: researchReport.legitimacyScore >= 70 ? '#16a34a' : researchReport.legitimacyScore >= 40 ? '#d97706' : '#dc2626' }}>
                        {Math.round(researchReport.legitimacyScore)} <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#94a3b8' }}>/ 100</span>
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(0, researchReport.legitimacyScore))}%`,
                          backgroundColor: researchReport.legitimacyScore >= 70 ? '#16a34a' : researchReport.legitimacyScore >= 40 ? '#d97706' : '#dc2626',
                          transition: 'width 0.4s ease-out',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
                      {researchReport.summary}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Provider: <strong>{researchReport.provider}</strong></span>
                      <span>Researched: {new Date(researchReport.researchedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Risk Factors (if any) */}
                  {researchReport.riskFactors && researchReport.riskFactors.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#dc2626', textTransform: 'uppercase' }}>
                        Detected Risk Factors ({researchReport.riskFactors.length})
                      </span>
                      {researchReport.riskFactors.map((rf, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '0.6rem 0.75rem',
                            borderRadius: '0.375rem',
                            backgroundColor: rf.severity === 'high' ? '#fef2f2' : '#fffbeb',
                            border: `1px solid ${rf.severity === 'high' ? '#fecaca' : '#fde68a'}`,
                            fontSize: '0.75rem',
                            color: rf.severity === 'high' ? '#991b1b' : '#92400e',
                          }}
                        >
                          <div style={{ fontWeight: '600', marginBottom: '0.15rem' }}>
                            [{rf.severity.toUpperCase()}] {rf.code}
                          </div>
                          <div>{rf.description}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Signals Overview */}
                  {researchReport.signals && (
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>
                        Verified Signals
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {Object.entries(researchReport.signals)
                          .filter(([, val]) => typeof val === 'boolean' && val === true)
                          .map(([key]) => (
                            <span
                              key={key}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.7rem',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '0.25rem',
                                backgroundColor: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                color: '#166534',
                                fontWeight: '500',
                              }}
                            >
                              ✓ {key.replace(/^has/, '').replace(/([A-Z])/g, ' $1').toLowerCase()}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Verifiable Evidence Items */}
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>
                      Verifiable Evidence Records ({researchReport.evidence?.length || 0})
                    </span>
                    {(!researchReport.evidence || researchReport.evidence.length === 0) ? (
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        No direct evidence captured. Unknown signals remain explicitly absent.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
                        {researchReport.evidence.map((ev, idx) => (
                          <div
                            key={ev.id || idx}
                            style={{
                              padding: '0.6rem 0.75rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #e2e8f0',
                              backgroundColor: '#ffffff',
                              fontSize: '0.75rem',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                              <span style={{ fontWeight: '600', color: '#2563eb', textTransform: 'capitalize' }}>
                                {ev.signalType.replace(/_/g, ' ')}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                                Conf: {Math.round(ev.confidence * 100)}%
                              </span>
                            </div>
                            <a
                              href={ev.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#0284c7', textDecoration: 'underline', wordBreak: 'break-all', display: 'block', fontSize: '0.7rem', marginBottom: '0.3rem' }}
                            >
                              {ev.sourceUrl}
                            </a>
                            <div
                              style={{
                                backgroundColor: '#f8fafc',
                                borderLeft: '2px solid #cbd5e1',
                                padding: '0.35rem 0.5rem',
                                color: '#475569',
                                fontFamily: 'monospace',
                                fontSize: '0.7rem',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              &quot;{ev.contentSnippet}&quot;
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Monitor Health Box */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.5rem' }}>
                Monitor Status
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.875rem' }}>
                <div>
                  <span style={{ color: '#64748b' }}>Active Openings: </span>
                  {renderOpeningsCount(selectedCompany.monitor?.openingsCount)}
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Check Interval: </span>
                  <span style={{ fontWeight: '600' }}>{selectedCompany.monitor?.checkIntervalHours || 24} hours</span>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Last Checked: </span>
                  <span style={{ fontWeight: '500' }}>
                    {selectedCompany.monitor?.lastCheckedAt ? new Date(selectedCompany.monitor.lastCheckedAt).toLocaleString() : 'Never'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Failure Count: </span>
                  <span style={{ fontWeight: '500', color: selectedCompany.monitor?.consecutiveFailures ? '#dc2626' : '#16a34a' }}>
                    {selectedCompany.monitor?.consecutiveFailures || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Probe Candidates Panel */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: '700', textTransform: 'uppercase', color: '#475569', marginBottom: '0.5rem' }}>
                ATS Probe Candidates ({selectedCompany.probeCandidates.length})
              </h4>
              {selectedCompany.probeCandidates.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  No probe candidates yet. Click &quot;Probe ATS Boards&quot; above to search public ATSs.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedCompany.probeCandidates.map((cand) => (
                    <div
                      key={cand.id}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #e2e8f0',
                        backgroundColor: cand.outcome === 'exists' ? '#f0fdf4' : '#f8fafc',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#0f172a' }}>
                          [{cand.atsType.toUpperCase()}] {cand.slug}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                          Outcome: <strong>{cand.outcome}</strong> | Match score:{' '}
                          {cand.nameMatchScore ? `${Math.round(Number(cand.nameMatchScore) * 100)}%` : 'N/A'}{' '}
                          {cand.displayedName && `("${cand.displayedName}")`}
                        </div>
                      </div>
                      <div>
                        {cand.status === 'confirmed' ? (
                          <span style={{ color: '#16a34a', fontWeight: '600', fontSize: '0.75rem' }}>Confirmed ✓</span>
                        ) : cand.status === 'rejected' ? (
                          <span style={{ color: '#dc2626', fontWeight: '600', fontSize: '0.75rem' }}>Rejected ✗</span>
                        ) : cand.outcome === 'exists' ? (
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              onClick={() => handleConfirmCandidate(cand.id, selectedCompany.id)}
                              disabled={actionLoading}
                              style={{
                                padding: '0.25rem 0.6rem',
                                borderRadius: '0.25rem',
                                border: 'none',
                                backgroundColor: '#16a34a',
                                color: '#ffffff',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleRejectCandidate(cand.id, selectedCompany.id)}
                              disabled={actionLoading}
                              style={{
                                padding: '0.25rem 0.6rem',
                                borderRadius: '0.25rem',
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                color: '#64748b',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Not Found</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Career Pages & ATS Endpoints */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: '700', textTransform: 'uppercase', color: '#475569', marginBottom: '0.5rem' }}>
                Career Pages &amp; ATS Endpoints ({selectedCompany.careerPages.length})
              </h4>
              {selectedCompany.careerPages.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  No career pages registered yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedCompany.careerPages.map((cp) => (
                    <div
                      key={cp.id}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>
                          [{cp.atsType.toUpperCase()}] {cp.boardId || 'Endpoint'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: cp.status === 'confirmed' ? '#16a34a' : '#64748b', fontWeight: '600' }}>
                          {cp.status.toUpperCase()}
                        </span>
                      </div>
                      <a
                        href={cp.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: '0.75rem',
                          color: '#2563eb',
                          wordBreak: 'break-all',
                          display: 'block',
                          marginTop: '0.25rem',
                        }}
                      >
                        {cp.url}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Check Runs Audit */}
            <div>
              <h4 style={{ fontSize: '0.875rem', fontWeight: '700', textTransform: 'uppercase', color: '#475569', marginBottom: '0.5rem' }}>
                Recent Monitor Runs ({selectedCompany.recentCheckRuns.length})
              </h4>
              {selectedCompany.recentCheckRuns.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  No checks performed yet.
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', color: '#64748b' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Time</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Status</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Openings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCompany.recentCheckRuns.map((run) => (
                      <tr key={run.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem' }}>{new Date(run.startedAt).toLocaleString()}</td>
                        <td style={{ padding: '0.5rem', fontWeight: '600', color: run.status === 'succeeded' ? '#16a34a' : '#dc2626' }}>
                          {run.status}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{renderOpeningsCount(run.openingsCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
