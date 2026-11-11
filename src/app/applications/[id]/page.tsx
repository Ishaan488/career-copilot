'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  CheckCircle2,
  Clock,
  Send,
  ArrowLeft,
  Layers,
  AlertTriangle,
  ShieldCheck,
  RotateCcw,
  XCircle,
  Zap,
  Calendar,
  Users,
  MessageSquare,
  History,
  Plus,
  Trash2,
  Mail,
  Phone,
  Linkedin,
  Video,
} from 'lucide-react';

interface Contact {
  id: string;
  applicationId: string;
  name: string;
  email: string | null;
  role: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  createdAt: string;
}

interface Interview {
  id: string;
  applicationId: string;
  stage: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number | null;
  interviewerNames: string[] | null;
  meetingUrl: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  notes: string | null;
  feedback: string | null;
  createdAt: string;
}

interface Note {
  id: string;
  applicationId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface AppEvent {
  id: string;
  applicationId: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: string;
  details: Record<string, unknown> | null;
  at: string;
}

interface ApplicationDetail {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  status: string;
  platform: string;
  applicationUrl: string;
  submissionSource: string | null;
  appliedAt: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt: string;
  summaryHash?: string;
  canAutomate?: boolean;
  authorization?: {
    id: string;
    summaryHash: string;
    expiresAt: string;
    revokedAt?: string | null;
    createdAt: string;
  } | null;
  latestSubmission?: {
    id: string;
    status: string;
    attemptNo: number;
    clickedAt?: string | null;
    verifiedAt?: string | null;
    screenshotPath?: string | null;
    error?: string | null;
  } | null;
  tasks: Array<{
    id: string;
    step: string;
    status: string;
    error?: string | null;
    createdAt: string;
  }>;
  fields: Array<{
    field: {
      id: string;
      fieldKey: string;
      label: string;
      type: string;
      required: boolean;
      category: string;
    };
    answer: {
      id: string;
      answer: unknown;
      decision: string;
      source: string;
      status: string;
    } | null;
  }>;
}

const LIFECYCLE_STATUS_OPTIONS = [
  { value: 'under_review', label: 'Under Review' },
  { value: 'assessment_received', label: 'Assessment Received' },
  { value: 'interview_scheduled', label: 'Interview Scheduled' },
  { value: 'interview_completed', label: 'Interview Completed' },
  { value: 'offer_received', label: 'Offer Received' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'closed', label: 'Closed' },
];

export default function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lifecycle' | 'interviews' | 'contacts' | 'notes' | 'events'>('lifecycle');

  // Related Subsystem Data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [notesList, setNotesList] = useState<Note[]>([]);
  const [eventsList, setEventsList] = useState<AppEvent[]>([]);

  // Action states
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  // Form states
  const [handoverNotes, setHandoverNotes] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Status transition form
  const [targetStatus, setTargetStatus] = useState('under_review');
  const [statusReason, setStatusReason] = useState('');

  // Add Contact form
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactLinkedin, setContactLinkedin] = useState('');
  const [contactNotes, setContactNotes] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  // Add Interview form
  const [showAddInterview, setShowAddInterview] = useState(false);
  const [interviewStage, setInterviewStage] = useState('screening');
  const [interviewTitle, setInterviewTitle] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('10:00');
  const [interviewDuration, setInterviewDuration] = useState('45');
  const [interviewInterviewer, setInterviewInterviewer] = useState('');
  const [interviewMeetingUrl, setInterviewMeetingUrl] = useState('');
  const [interviewNotesText, setInterviewNotesText] = useState('');
  const [savingInterview, setSavingInterview] = useState(false);

  // Add Note form
  const [newNoteContent, setNewNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    fetchDetail();
    fetchContacts();
    fetchInterviews();
    fetchNotes();
    fetchEvents();
  }, [id]);

  async function fetchDetail() {
    try {
      setLoading(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}`);
      if (res.ok) {
        const data = await res.json();
        setApp(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function fetchContacts() {
    try {
      const res = await fetch(`/api/applications/${id}/contacts`);
      if (res.ok) setContacts(await res.json());
    } catch {
      // ignore
    }
  }

  async function fetchInterviews() {
    try {
      const res = await fetch(`/api/applications/${id}/interviews`);
      if (res.ok) setInterviews(await res.json());
    } catch {
      // ignore
    }
  }

  async function fetchNotes() {
    try {
      const res = await fetch(`/api/applications/${id}/notes`);
      if (res.ok) setNotesList(await res.json());
    } catch {
      // ignore
    }
  }

  async function fetchEvents() {
    try {
      const res = await fetch(`/api/applications/${id}/events`);
      if (res.ok) setEventsList(await res.json());
    } catch {
      // ignore
    }
  }

  // 1. Status Transition
  async function handleTransitionStatus() {
    if (!targetStatus) return;
    try {
      setTransitioning(true);
      setActionError(null);
      setActionSuccess(null);
      const res = await fetch(`/api/applications/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus: targetStatus,
          reason: statusReason || undefined,
        }),
      });

      if (res.ok) {
        setActionSuccess(`Status successfully updated to ${targetStatus.replace(/_/g, ' ')}`);
        setStatusReason('');
        await fetchDetail();
        await fetchEvents();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to transition application status.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setTransitioning(false);
    }
  }

  // 2. Contacts Actions
  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault();
    if (!contactName.trim()) return;
    try {
      setSavingContact(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName.trim(),
          email: contactEmail.trim() || undefined,
          role: contactRole.trim() || undefined,
          phone: contactPhone.trim() || undefined,
          linkedinUrl: contactLinkedin.trim() || undefined,
          notes: contactNotes.trim() || undefined,
        }),
      });

      if (res.ok) {
        setContactName('');
        setContactEmail('');
        setContactRole('');
        setContactPhone('');
        setContactLinkedin('');
        setContactNotes('');
        setShowAddContact(false);
        await fetchContacts();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to save contact.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setSavingContact(false);
    }
  }

  async function handleDeleteContact(contactId: string) {
    try {
      const res = await fetch(`/api/applications/${id}/contacts/${contactId}`, { method: 'DELETE' });
      if (res.ok) await fetchContacts();
    } catch {
      // ignore
    }
  }

  // 3. Interviews Actions
  async function handleScheduleInterview(e: React.FormEvent) {
    e.preventDefault();
    if (!interviewTitle.trim() || !interviewDate) return;
    try {
      setSavingInterview(true);
      setActionError(null);
      const scheduledDateTime = new Date(`${interviewDate}T${interviewTime || '10:00'}:00`).toISOString();
      const interviewers = interviewInterviewer.trim()
        ? interviewInterviewer.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      const res = await fetch(`/api/applications/${id}/interviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: interviewStage,
          title: interviewTitle.trim(),
          scheduledAt: scheduledDateTime,
          durationMinutes: parseInt(interviewDuration, 10) || 45,
          interviewerNames: interviewers,
          meetingUrl: interviewMeetingUrl.trim() || undefined,
          notes: interviewNotesText.trim() || undefined,
        }),
      });

      if (res.ok) {
        setInterviewTitle('');
        setInterviewMeetingUrl('');
        setInterviewInterviewer('');
        setInterviewNotesText('');
        setShowAddInterview(false);
        await fetchInterviews();
        await fetchDetail();
        await fetchEvents();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to schedule interview.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setSavingInterview(false);
    }
  }

  async function handleUpdateInterviewStatus(interviewId: string, newStatus: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled') {
    try {
      const res = await fetch(`/api/applications/${id}/interviews/${interviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await fetchInterviews();
        await fetchDetail();
      }
    } catch {
      // ignore
    }
  }

  async function handleDeleteInterview(interviewId: string) {
    try {
      const res = await fetch(`/api/applications/${id}/interviews/${interviewId}`, { method: 'DELETE' });
      if (res.ok) await fetchInterviews();
    } catch {
      // ignore
    }
  }

  // 4. Notes Actions
  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNoteContent.trim()) return;
    try {
      setSavingNote(true);
      const res = await fetch(`/api/applications/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNoteContent.trim() }),
      });
      if (res.ok) {
        setNewNoteContent('');
        await fetchNotes();
      }
    } catch {
      // ignore
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      const res = await fetch(`/api/applications/${id}/notes/${noteId}`, { method: 'DELETE' });
      if (res.ok) await fetchNotes();
    } catch {
      // ignore
    }
  }

  // 5. Existing Submission Handlers
  async function handleConfirmSubmitted() {
    if (!app) return;
    try {
      setConfirming(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/confirm-submitted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: handoverNotes }),
      });
      if (res.ok) {
        await fetchDetail();
        await fetchEvents();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to confirm submission.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  async function handleAuthorizeSubmission() {
    if (!app?.summaryHash) return;
    try {
      setAuthorizing(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/authorize-submission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summaryHash: app.summaryHash,
          notes: 'Authorized via application detail UI',
        }),
      });
      if (res.ok) {
        await fetchDetail();
        await fetchEvents();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to authorize automated submission.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setAuthorizing(false);
    }
  }

  async function handleRevokeAuthorization() {
    try {
      setRevoking(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/revoke-authorization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Revoked by user via UI' }),
      });
      if (res.ok) {
        await fetchDetail();
        await fetchEvents();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to revoke authorization.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setRevoking(false);
    }
  }

  async function handleSubmitApplication() {
    try {
      setSubmitting(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/submit`, { method: 'POST' });
      if (res.ok) {
        await fetchDetail();
        await fetchEvents();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Automated submission encountered an issue.');
        await fetchDetail();
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
      await fetchDetail();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolveUnverified(resolution: 'confirm_submitted' | 'retry_confirmed' | 'abandon') {
    try {
      setResolving(true);
      setActionError(null);
      const res = await fetch(`/api/applications/${id}/resolve-unverified`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution, notes: resolutionNotes }),
      });
      if (res.ok) {
        await fetchDetail();
        await fetchEvents();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'Failed to resolve unverified submission.');
      }
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setResolving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-zinc-500">
        <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-3" />
        <p className="text-sm">Loading application details...</p>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <h2 className="text-lg font-medium text-zinc-200">Application not found</h2>
        <Link href="/applications" className="text-xs text-emerald-400 hover:underline mt-2 inline-block">
          Return to applications
        </Link>
      </div>
    );
  }

  const isHandoverReady = app.status === 'ready_to_submit';
  const isSubmitted = app.status === 'submitted';
  const isUnverified = app.status === 'submission_unverified';
  const isAuthorized =
    Boolean(app.authorization) &&
    !app.authorization?.revokedAt &&
    new Date(app.authorization?.expiresAt || 0) > new Date();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/applications"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Applications Tracker
        </Link>

        <div className="flex items-center gap-2">
          {app.applicationUrl && (
            <a
              href={app.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-medium border border-zinc-800 active:scale-[0.98] transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
              Company Portal
            </a>
          )}
        </div>
      </div>

      {/* Action Alerts */}
      {actionError && (
        <div className="mb-6 p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-rose-200">Action Notice:</span> {actionError}
          </div>
        </div>
      )}

      {actionSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-300 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-emerald-200">Success:</span> {actionSuccess}
          </div>
        </div>
      )}

      {/* Header Info Panel */}
      <div className="p-6 rounded-xl bg-zinc-900/60 border border-zinc-800/80 mb-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold text-zinc-100">{app.jobTitle}</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60 capitalize">
                {app.status.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-400">
                {app.platform}
              </span>
            </div>
            <p className="text-sm text-zinc-400">
              <span className="font-semibold text-zinc-200">{app.companyName || 'Unknown Company'}</span>
              {app.appliedAt && (
                <>
                  {' '}• Applied on{' '}
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(app.appliedAt).toLocaleDateString()}
                  </span>
                </>
              )}
              {app.submissionSource && (
                <>
                  {' '}• Via <span className="font-mono text-zinc-300">{app.submissionSource}</span>
                </>
              )}
            </p>
          </div>

          {/* Quick Lifecycle Transition Controller */}
          <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col gap-2 shrink-0 md:w-80">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
              <span>Update Status</span>
              <span className="text-zinc-500 font-mono text-[10px]">Doc 10 §3</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500"
              >
                {LIFECYCLE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                onClick={handleTransitionStatus}
                disabled={transitioning}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap shadow-sm"
              >
                {transitioning ? 'Saving...' : 'Apply'}
              </button>
            </div>
            <input
              type="text"
              placeholder="Optional reason / notes"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              className="w-full px-2.5 py-1 text-[11px] rounded bg-zinc-900 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 mb-6 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('lifecycle')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-all border-b-2 -mb-[1px] ${
            activeTab === 'lifecycle'
              ? 'border-emerald-500 text-zinc-100 bg-zinc-900/50'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Submission & Fields
        </button>

        <button
          onClick={() => setActiveTab('interviews')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-all border-b-2 -mb-[1px] ${
            activeTab === 'interviews'
              ? 'border-emerald-500 text-zinc-100 bg-zinc-900/50'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Interviews
          <span
            className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {interviews.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('contacts')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-all border-b-2 -mb-[1px] ${
            activeTab === 'contacts'
              ? 'border-emerald-500 text-zinc-100 bg-zinc-900/50'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Recruiter Contacts
          <span
            className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {contacts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('notes')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-all border-b-2 -mb-[1px] ${
            activeTab === 'notes'
              ? 'border-emerald-500 text-zinc-100 bg-zinc-900/50'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Notes
          <span
            className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {notesList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-all border-b-2 -mb-[1px] ${
            activeTab === 'events'
              ? 'border-emerald-500 text-zinc-100 bg-zinc-900/50'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Timeline & Audit
          <span
            className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {eventsList.length}
          </span>
        </button>
      </div>

      {/* TAB 1: SUBMISSION & FORM FIELDS */}
      {activeTab === 'lifecycle' && (
        <div className="space-y-6">
          {/* Unverified submission resolution */}
          {isUnverified && (
            <div className="p-6 rounded-xl bg-amber-950/25 border border-amber-500/40">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-4 flex-1">
                  <div>
                    <h3 className="text-sm font-semibold text-amber-200">Submission Verification Required (Idempotency Safe)</h3>
                    <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                      The automated submission click was dispatched to the portal, but post-submit confirmation could not be verified automatically (evidence inconclusive or timed out).
                      To prevent duplicate applications, automatic retry is locked. Please inspect your email inbox or portal status and choose a resolution below.
                    </p>
                    {app.latestSubmission?.error && (
                      <p className="text-xs text-amber-300/90 font-mono mt-2 bg-amber-950/40 p-2 rounded border border-amber-500/20">
                        Observation: {app.latestSubmission.error}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Optional resolution notes (e.g. Received confirmation email #1234)"
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        onClick={() => handleResolveUnverified('confirm_submitted')}
                        disabled={resolving}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Confirm Submitted (Email Received)
                      </button>

                      <button
                        onClick={() => handleResolveUnverified('retry_confirmed')}
                        disabled={resolving}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset to Ready to Submit (Not Received)
                      </button>

                      <button
                        onClick={() => handleResolveUnverified('abandon')}
                        disabled={resolving}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4 text-zinc-400" />
                        Abandon Submission
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ready to Submit Action Cards */}
          {isHandoverReady && !isSubmitted && (
            <div className="space-y-6">
              {/* Card A: Manual Handover */}
              <div className="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-3 flex-1">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">Manual Browser Handover (Default)</h3>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                        Form answers and resume are pre-filled and verified. You can open the portal, perform a final review of the form, and click submit yourself.
                      </p>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <a
                        href={app.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium border border-zinc-700 active:scale-[0.98] transition-all shadow-sm"
                      >
                        <ExternalLink className="w-4 h-4 text-emerald-400" />
                        Open Application Portal
                      </a>

                      <input
                        type="text"
                        placeholder="Optional notes or confirmation #"
                        value={handoverNotes}
                        onChange={(e) => setHandoverNotes(e.target.value)}
                        className="px-3 py-2 text-xs rounded-lg bg-zinc-900/90 border border-zinc-700 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                      />

                      <button
                        onClick={handleConfirmSubmitted}
                        disabled={confirming}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {confirming ? 'Recording...' : 'I submitted it'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card B: Level 2 Approved Automated Submission */}
              {app.canAutomate && (
                <div className="p-6 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-4 flex-1">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-zinc-100">Approved Automated Submission (Level 2)</h3>
                          {isAuthorized && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <ShieldCheck className="w-3 h-3" />
                              Authorized
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                          Two-gate safety policy active. Automated submission requires explicit per-application authorization bound to the cryptographic summary hash of your form answers and resume. Authorizations expire automatically in 24 hours.
                        </p>
                      </div>

                      {app.summaryHash && (
                        <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="font-mono truncate">
                            <span className="text-zinc-500">Summary Hash: </span>
                            <span className="text-emerald-400">{app.summaryHash}</span>
                          </div>
                          {isAuthorized && app.authorization && (
                            <div className="text-zinc-400 text-[10px] whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              Expires: {new Date(app.authorization.expiresAt).toLocaleTimeString()}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {isAuthorized ? (
                          <>
                            <button
                              onClick={handleSubmitApplication}
                              disabled={submitting}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-[0.98] transition-all disabled:opacity-50 shadow-md"
                            >
                              <Send className="w-4 h-4" />
                              {submitting ? 'Executing Automated Submission...' : 'Submit Application Now'}
                            </button>

                            <button
                              onClick={handleRevokeAuthorization}
                              disabled={revoking}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                              {revoking ? 'Revoking...' : 'Revoke Authorization'}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={handleAuthorizeSubmission}
                            disabled={authorizing}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            {authorizing ? 'Authorizing...' : 'Authorize Automated Submission (24h)'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form Fields & Resolved Answers */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Extracted Form Fields & Answers ({app.fields.length})
            </h3>

            {app.fields.length === 0 ? (
              <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-500">
                Form extraction in progress or portal pending navigation.
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 divide-y divide-zinc-800/60 overflow-hidden">
                {app.fields.map(({ field, answer }) => (
                  <div key={field.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-200">{field.label}</span>
                        {field.required && <span className="text-xs text-rose-400 font-bold">*</span>}
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {field.category}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400">
                        Type: <span className="text-zinc-300 font-mono">{field.type}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      {answer ? (
                        <div className="text-right">
                          <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 max-w-xs truncate">
                            {answer.answer !== null ? String(answer.answer) : `[${answer.decision}]`}
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-0.5 capitalize">
                            Source: {answer.source} • Status: {answer.status}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500 italic">No answer resolved</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workflow Tasks Audit */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400" />
              Workflow Tasks Audit
            </h3>

            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 divide-y divide-zinc-800/60 overflow-hidden">
              {app.tasks.map((task) => (
                <div key={task.id} className="p-3.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        task.status === 'done'
                          ? 'bg-emerald-400'
                          : task.status === 'pending'
                            ? 'bg-amber-400'
                            : 'bg-rose-400'
                      }`}
                    />
                    <span className="font-mono text-zinc-300">{task.step}</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <span className="capitalize">{task.status}</span>
                    <span>•</span>
                    <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INTERVIEWS & SCHEDULED SESSIONS */}
      {activeTab === 'interviews' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400" />
                Interviews & Deadlines
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Schedule screening rounds, technical interviews, and track feedback.
              </p>
            </div>

            <button
              onClick={() => setShowAddInterview(!showAddInterview)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium active:scale-[0.98] transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Schedule Interview
            </button>
          </div>

          {/* Add Interview Modal / Inline Card */}
          {showAddInterview && (
            <form
              onSubmit={handleScheduleInterview}
              className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-4"
            >
              <h4 className="text-xs font-semibold text-zinc-200">New Interview Schedule</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Technical Round 1 - System Design"
                    value={interviewTitle}
                    onChange={(e) => setInterviewTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Stage</label>
                  <select
                    value={interviewStage}
                    onChange={(e) => setInterviewStage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="screening">Recruiter Screening</option>
                    <option value="technical">Technical Round</option>
                    <option value="behavioral">Behavioral / Culture</option>
                    <option value="hiring_manager">Hiring Manager</option>
                    <option value="onsite">Onsite Loop</option>
                    <option value="final">Final Round</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Time</label>
                  <input
                    type="time"
                    value={interviewTime}
                    onChange={(e) => setInterviewTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    value={interviewDuration}
                    onChange={(e) => setInterviewDuration(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Meeting URL</label>
                  <input
                    type="url"
                    placeholder="https://meet.google.com/..."
                    value={interviewMeetingUrl}
                    onChange={(e) => setInterviewMeetingUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 text-[11px] mb-1">Interviewers (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. Jane Doe (Eng Lead), Bob Smith (PM)"
                    value={interviewInterviewer}
                    onChange={(e) => setInterviewInterviewer(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 text-[11px] mb-1">Preparation Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Focus areas, questions to ask, topics to cover..."
                    value={interviewNotesText}
                    onChange={(e) => setInterviewNotesText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingInterview}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {savingInterview ? 'Saving...' : 'Save & Schedule'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddInterview(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Interviews List */}
          {interviews.length === 0 ? (
            <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-500">
              No interviews scheduled yet.
            </div>
          ) : (
            <div className="space-y-3">
              {interviews.map((iv) => (
                <div
                  key={iv.id}
                  className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-semibold text-xs text-zinc-100">{iv.title}</span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {iv.stage}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                          iv.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : iv.status === 'cancelled'
                              ? 'bg-rose-500/10 text-rose-400'
                              : 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {iv.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        {new Date(iv.scheduledAt).toLocaleString()} ({iv.durationMinutes || 45}m)
                      </span>
                      {iv.meetingUrl && (
                        <a
                          href={iv.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-emerald-400 hover:underline"
                        >
                          <Video className="w-3.5 h-3.5" />
                          Join Meeting
                        </a>
                      )}
                    </div>

                    {iv.interviewerNames && iv.interviewerNames.length > 0 && (
                      <p className="text-[11px] text-zinc-400">
                        <span className="text-zinc-500">Interviewers:</span> {iv.interviewerNames.join(', ')}
                      </p>
                    )}

                    {iv.notes && (
                      <p className="text-[11px] text-zinc-300 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/60">
                        {iv.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                    {iv.status !== 'completed' && (
                      <button
                        onClick={() => handleUpdateInterviewStatus(iv.id, 'completed')}
                        className="px-2.5 py-1 text-[11px] rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-400 font-medium active:scale-[0.98] transition-all"
                        title="Mark Completed"
                      >
                        Done
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteInterview(iv.id)}
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition-colors"
                      title="Delete Interview"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: RECRUITER CONTACTS */}
      {activeTab === 'contacts' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                Recruiter & Team Contacts
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Track recruiters, hiring managers, and interviewers associated with this role.
              </p>
            </div>

            <button
              onClick={() => setShowAddContact(!showAddContact)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium active:scale-[0.98] transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Contact
            </button>
          </div>

          {/* Add Contact Modal / Inline Form */}
          {showAddContact && (
            <form onSubmit={handleCreateContact} className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-4">
              <h4 className="text-xs font-semibold text-zinc-200">New Contact Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Connor"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Role / Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Lead Technical Recruiter"
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="sarah.c@company.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="+1 (555) 012-3456"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 text-[11px] mb-1">LinkedIn Profile</label>
                  <input
                    type="url"
                    placeholder="https://linkedin.com/in/..."
                    value={contactLinkedin}
                    onChange={(e) => setContactLinkedin(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 text-[11px] mb-1">Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Personal notes, outreach history, conversational pointers..."
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingContact}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {savingContact ? 'Saving...' : 'Save Contact'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddContact(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Contacts List */}
          {contacts.length === 0 ? (
            <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-500">
              No contacts recorded for this application yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 transition-colors flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-100">{contact.name}</h4>
                        {contact.role && <p className="text-[11px] text-zinc-400 mt-0.5">{contact.role}</p>}
                      </div>
                      <button
                        onClick={() => handleDeleteContact(contact.id)}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition-colors"
                        title="Delete contact"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1 text-xs text-zinc-400 pt-1">
                      {contact.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3 h-3 text-zinc-500 shrink-0" />
                          <a href={`mailto:${contact.email}`} className="text-zinc-300 hover:text-emerald-400 truncate">
                            {contact.email}
                          </a>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span className="text-zinc-300">{contact.phone}</span>
                        </div>
                      )}
                      {contact.linkedinUrl && (
                        <div className="flex items-center gap-2">
                          <Linkedin className="w-3 h-3 text-blue-400 shrink-0" />
                          <a
                            href={contact.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline truncate"
                          >
                            LinkedIn Profile
                          </a>
                        </div>
                      )}
                    </div>

                    {contact.notes && (
                      <p className="text-[11px] text-zinc-400 bg-zinc-950 p-2 rounded border border-zinc-800/60 mt-2">
                        {contact.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: NOTES */}
      {activeTab === 'notes' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              Application Notes & Observations
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Keep custom reflections, preparation checklists, and recruiter communication notes.
            </p>
          </div>

          {/* New note form */}
          <form onSubmit={handleAddNote} className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
            <textarea
              rows={3}
              required
              placeholder="Write a new note or observation..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={savingNote}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              {savingNote ? 'Adding...' : 'Add Note'}
            </button>
          </form>

          {/* Notes List */}
          {notesList.length === 0 ? (
            <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-500">
              No notes recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {notesList.map((note) => (
                <div
                  key={note.id}
                  className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 transition-colors flex items-start justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                    <div className="text-[10px] text-zinc-500 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(note.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition-colors"
                    title="Delete Note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: TIMELINE & AUDIT LOG */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <History className="w-4 h-4 text-zinc-400" />
              Application Audit Trail & Events
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Immutable ledger of all state transitions, system submissions, and recruiter communications.
            </p>
          </div>

          {eventsList.length === 0 ? (
            <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-500">
              No events recorded yet.
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 divide-y divide-zinc-800/60 overflow-hidden">
              {eventsList.map((evt) => (
                <div key={evt.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-zinc-200 font-medium">{evt.type}</span>
                      {evt.fromStatus && evt.toStatus && (
                        <span className="text-[11px] text-zinc-400">
                          {evt.fromStatus} &rarr;{' '}
                          <span className="text-emerald-400 font-semibold">{evt.toStatus}</span>
                        </span>
                      )}
                    </div>
                    {evt.details && Object.keys(evt.details).length > 0 && (
                      <p className="text-[11px] text-zinc-400 font-mono">
                        {JSON.stringify(evt.details)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-zinc-500 shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <span className="font-mono text-zinc-400">{evt.actor}</span>
                    <span>•</span>
                    <span>{new Date(evt.at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
