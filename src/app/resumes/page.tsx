'use client';

import React, { useState, useEffect } from 'react';

interface ResumeVersion {
  id: string;
  versionNo: number;
  originalFilename: string;
  storedPath: string;
  sha256: string;
  sizeBytes: number;
  label: string;
  notes?: string | null;
  uploadedAt: string;
}

interface ResumeItem {
  id: string;
  label: string;
  notes?: string | null;
  isDefault: boolean;
  status: string;
  versions: ResumeVersion[];
  latestVersion?: ResumeVersion | null;
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [targetResumeId, setTargetResumeId] = useState<string>('');
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    loadResumes();
  }, []);

  async function loadResumes() {
    setLoading(true);
    try {
      const res = await fetch('/api/resumes');
      if (res.ok) {
        const data = await res.json();
        setResumes(data);
        if (data.length > 0 && !previewVersionId && data[0].latestVersion) {
          setPreviewVersionId(data[0].latestVersion.id);
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load resumes.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setMessage({ type: 'error', text: 'Only PDF files (.pdf) are permitted.' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('label', label || selectedFile.name.replace(/\.[^/.]+$/, ''));
      if (notes) formData.append('notes', notes);
      if (isDefault) formData.append('isDefault', 'true');
      if (targetResumeId) formData.append('resumeId', targetResumeId);

      const res = await fetch('/api/resumes', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Upload failed');
      }

      if (data.isDuplicate) {
        setMessage({
          type: 'info',
          text: `Duplicate detected: ${data.message}`,
        });
      } else {
        setMessage({
          type: 'success',
          text: `Resume version ${data.version.versionNo} uploaded successfully (SHA-256: ${data.version.sha256.slice(0, 8)}...).`,
        });
      }

      setSelectedFile(null);
      setLabel('');
      setNotes('');
      setTargetResumeId('');
      loadResumes();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setUploading(false);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      const res = await fetch(`/api/resumes/${id}/default`, { method: 'POST' });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Default resume updated.' });
        loadResumes();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to set default resume.' });
    }
  }

  async function handleDeleteResume(id: string) {
    if (!confirm('Are you sure you want to delete this resume? If attached to active applications, deletion is blocked to protect historical audit trail.')) return;
    try {
      const res = await fetch(`/api/resumes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Delete failed');
      }
      setMessage({ type: 'success', text: 'Resume deleted.' });
      loadResumes();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as Error).message });
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading Resume Manager...</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Resume Manager</h1>
        <p style={{ color: '#64748b', fontSize: '0.925rem', marginTop: '0.25rem' }}>
          Upload and manage your original PDF resumes. Preserves exact binary bytes for verified application attachments.
        </p>
      </div>

      {/* POLICY CALLOUT */}
      <div
        style={{
          background: '#f8fafc',
          borderLeft: '4px solid #64748b',
          padding: '0.75rem 1rem',
          borderRadius: '0.25rem',
          marginBottom: '1.5rem',
          fontSize: '0.825rem',
          color: '#334155',
        }}
      >
        <strong>Zero Modification Invariant:</strong> Career Copilot never rewrites, tailors, generates, or alters your resume content. Uploaded PDFs are stored immutable and attached byte-for-byte to ATS portals.
      </div>

      {message && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1.5rem',
            background: message.type === 'success' ? '#f0fdf4' : message.type === 'info' ? '#eff6ff' : '#fef2f2',
            color: message.type === 'success' ? '#166534' : message.type === 'info' ? '#1e40af' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#bbf7d0' : message.type === 'info' ? '#bfdbfe' : '#fecaca'}`,
            fontSize: '0.875rem',
          }}
        >
          {message.text}
        </div>
      )}

      {/* UPLOAD CARD */}
      <form
        onSubmit={handleUpload}
        style={{
          background: '#ffffff',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>+ Upload Original Resume PDF</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>
              Select PDF File (≤ 10 MB) *
            </label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setSelectedFile(f);
                if (f && !label) {
                  setLabel(f.name.replace(/\.[^/.]+$/, ''));
                }
              }}
              style={{ width: '100%', padding: '0.35rem 0', fontSize: '0.875rem' }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>
              Resume Label *
            </label>
            <input
              type="text"
              placeholder="e.g. Full Stack Engineer (v2025)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
              required
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>
              Target Resume Group (optional: adds a new version to existing resume)
            </label>
            <select
              value={targetResumeId}
              onChange={(e) => setTargetResumeId(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
            >
              <option value="">Create as New Resume</option>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  Add as new version to &quot;{r.label}&quot; (current: v{r.versions.length})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}>
              Notes (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Tailored for infrastructure/distributed systems roles"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Set as Default Resume (pre-selected for applications)
          </label>

          <button
            type="submit"
            disabled={uploading || !selectedFile}
            style={{
              padding: '0.5rem 1.25rem',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: selectedFile ? 'pointer' : 'not-allowed',
              opacity: uploading ? 0.7 : 1,
            }}
          >
            {uploading ? 'Validating & Uploading...' : 'Upload Original PDF'}
          </button>
        </div>
      </form>

      {/* RESUMES LIST & PREVIEW SPLIT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* LEFT COLUMN: RESUMES & VERSIONS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>
            Your Resumes ({resumes.length})
          </h3>

          {resumes.length === 0 ? (
            <div style={{ background: '#ffffff', padding: '2rem', textAlign: 'center', color: '#64748b', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
              No resumes uploaded yet. Upload your PDF resume above to start automating applications.
            </div>
          ) : (
            resumes.map((resume) => (
              <div
                key={resume.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '0.5rem',
                  border: resume.isDefault ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                  padding: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{resume.label}</strong>
                      {resume.isDefault && (
                        <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.15rem 0.45rem', borderRadius: '0.2rem', background: '#dbeafe', color: '#1e40af' }}>
                          DEFAULT
                        </span>
                      )}
                    </div>
                    {resume.notes && <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>{resume.notes}</p>}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {!resume.isDefault && (
                      <button
                        onClick={() => handleSetDefault(resume.id)}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '0.25rem', cursor: 'pointer' }}
                      >
                        Make Default
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteResume(resume.id)}
                      style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* VERSION TIMELINE */}
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase' }}>Versions</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.35rem' }}>
                    {resume.versions.map((v) => (
                      <div
                        key={v.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '0.25rem',
                          background: previewVersionId === v.id ? '#eff6ff' : '#f8fafc',
                          fontSize: '0.8rem',
                        }}
                      >
                        <div>
                          <strong>v{v.versionNo}:</strong> {v.originalFilename}
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                            ({(v.sizeBytes / 1024).toFixed(0)} KB • SHA-256: {v.sha256.slice(0, 8)}...)
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => setPreviewVersionId(v.id)}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: previewVersionId === v.id ? '#1d4ed8' : '#2563eb',
                              cursor: 'pointer',
                              fontWeight: previewVersionId === v.id ? '700' : '500',
                            }}
                          >
                            Preview
                          </button>
                          <a
                            href={`/api/resumes/versions/${v.id}/download`}
                            style={{ color: '#64748b', textDecoration: 'none' }}
                          >
                            Download
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* RIGHT COLUMN: PDF VIEWER */}
        <div style={{ position: 'sticky', top: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#0f172a' }}>Inline PDF Preview</h3>
          {previewVersionId ? (
            <div style={{ background: '#ffffff', borderRadius: '0.5rem', border: '1px solid #e2e8f0', overflow: 'hidden', height: '650px' }}>
              <iframe
                src={`/api/resumes/versions/${previewVersionId}/preview`}
                title="Resume Preview"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          ) : (
            <div style={{ background: '#ffffff', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
              Select a resume version on the left to preview it inline.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
