# 14 — UI/UX Specification

## 1. Design principles
Calm, dense-but-readable, tool-like (think Linear/Notion), not a "AI dashboard". One accent color, neutral grays, 1 level of card nesting max, no gradients, no decorative charts. Tables and lists over cards where scanning matters. Light + dark theme via CSS variables.

Tokens: font Inter (system fallback), base 14px, spacing scale 4px, radius 6px, accent `#2563eb`, success `#16a34a`, warn `#d97706`, danger `#dc2626`, neutral from slate. Status badges use text + color (never color alone).

## 2. Shell
Left sidebar (collapsible; icons+labels) groups: **Work** (Dashboard, Jobs, Recommended, Saved, Applications/Tracker, Review Center [badge=pending count]) · **Discover** (Companies, Sources) · **Prepare** (Resumes, Profile, Preferences) · **System** (Automation, Notifications, Activity, Settings). Top bar: global search (jobs/companies, `/` shortcut), worker status pill, **AI status pill** (available / no key / quota exhausted — "non-AI features unaffected"), notification bell, theme toggle. Mobile: sidebar → drawer.

## 3. Pages (route → content → required states)
| Route | Content | Empty state CTA |
|-------|---------|-----------------|
| `/dashboard` | 4 count tiles (New today, Worth considering, Needs review, In progress) → each links to filtered list; "Needs your attention" list (pending reviews, authorization waits, failed automation, unverified submissions); Upcoming deadlines; Recent activity (10 latest real events); Source health strip | "Complete your profile" / "Add a source" |
| `/jobs` | Table: title, company, location/mode, comp (label disclosed/estimated), posted, source(s), status badge, recommendation badge, score. Filters sidebar (status, recommendation, source, work mode, score min, posted, has comp), search, sort, bulk shortlist/reject/save with confirm. Pagination | "Add a source or import a URL" |
| `/jobs/[id]` | Header (title, company link, status, actions: Shortlist/Save/Reject/Prepare application). Tabs: **Overview** (parsed JD structured + original text toggle), **Evaluation** (eligibility rules table pass/fail/unknown with JD quote; suitability breakdown bars with matched/missing; risk; comp; recommendation + explanation), **Company** (summary, legitimacy checklist, evidence list with links & verification badges), **Sources** (listings, snapshots/changes), **History** (status + policy decisions). Duplicate banner if `possible_duplicate`. Injection-warning banner if flagged | — |
| `/companies` | **Company Discovery** (separate from Jobs): table of companies with discovery status badge, ATS, career page link, openings count (shows "0" vs "Unknown" distinctly), last checked, monitor status. "Add company" (name/domain/URL), "Import CSV/paste", status filters. Candidate review panel for probe results (name/domain match evidence, Confirm/Reject). Pause/Exclude with confirm | "Add a company or import a list — nothing is monitored until you do" |
| `/companies/[id]` | Identity, domains with verification, career pages (candidate/confirmed), monitor + check history, evidence table with confidence, research freshness + "Re-run research", other jobs | |
| `/recommended` | Jobs with recommendation ≥ consider, sorted by score; eligibility failures hidden by default | "No recommendations yet — analysis runs after discovery" |
| `/saved` | Saved jobs | |
| `/applications` (Tracker) | Kanban-by-status toggle + table; columns follow statuses; card: company, title, last activity, next action, deadline | "Shortlist a job to start" |
| `/applications/[id]` | Workflow stepper (all 15 steps, current highlighted, paused reason), tabs: **Summary** (answers table w/ source badges profile/reusable/AI/human & status; docs; resume version link; submission panel), **Form** (extracted fields), **Events**, **Logs** (execution log + screenshots), **Notes/Contacts/Interviews**. Authorization panel: shows exactly what will be authorized + checkbox + typed confirm "SUBMIT" | |
| `/review` | List with filters; sort by oldest; chips by category | "Nothing needs your attention" |
| `/review/[id]` | Left: question + context + job/application link + why uncertain + evidence. Right: suggested answer (confidence informational with rationale; **absent for core categories — no AI suggestion shown for EEO/legal/consent/bond/work-auth/salary/notice/relocation/background/sensitive**), response form per `required_action`: input matching field type, buttons **Approve suggestion / Edit & approve / Provide answer / Decline to answer (EEO, only when portal offers) / Leave blank (only when not required) / Investigate more / Defer (date picker) / Reject / Cancel application**; optional "Save as reusable answer" (scope selector, confirm dialog; EEO unchecked & warned). Footer: "What happens next: …" derived from checkpoint. | |
| `/resumes` | **Resume Manager (no editing/generation).** List of uploaded PDFs with label, version, uploaded date, size, sha256 (short), default badge, "attached to N applications". Upload dialog (PDF only, ≤10 MB, duplicate detection). Inline PDF preview of the original file; download original; set default; archive; delete (confirm; blocked if attached to active application, with reason). Banner: "Files are stored and attached exactly as uploaded." | "Upload your resume PDF" |
| `/profile` | Sections as tabs; each item shows verified toggle; completeness sidebar; import-from-resume flow with draft review | Onboarding link |
| `/preferences` | Preference form | |
| `/automation` | **Autonomy level selector:** L1 Discovery & evaluation / L2 Preparation with approval / L3 "Not available yet" (disabled, no handler). Plain-language consequences per level; each change opens a confirm dialog and is audit-logged. Per-category always-review list (core categories locked on). Auto-shortlist toggle + threshold. Policy rules editor (typed forms) + "Simulate on a job". Submission gate status panel: env flag state (read-only), settings toggle, explanation that automated submit needs per-application authorization. Authorization history | |
| `/sources` | Source list with status, last success, last error, run now, enable toggle, add-source wizard per adapter type with config validation + "test fetch" | "Add Greenhouse board" |
| `/notifications` | Feed grouped by day, mark read, links; preferences tab | |
| `/activity` | Tabs: Execution logs, Queue (failed/terminal), AI usage, Audit | |
| `/settings` | Timezone, **scoring weights editor** (live sum validator, reset to defaults, shows effect on a sample job via simulate), thresholds, AI models & budgets, notification channels (Telegram/email status + test buttons, credentials never shown), **retention settings** (doc 16 §9 defaults), passcode change, backup info, data export/purge | |
| `/activity` extra | "Trace" view: for any score/recommendation/answer show inputs, rules, AI request (model, prompt version, confidence), evidence and user corrections (doc 08 §12) | |
| `/onboarding` | Wizard steps: Passcode → Personal → Education → Experience → Skills → Projects → Links → Preferences (CTC, roles, locations, notice, relocation — all blank by default, "Skip / decide later" allowed) → Autonomy (L1 default) → Upload resume PDF → Add companies → Notifications (Telegram/email status) → Done checklist showing which features are blocked by missing data | |

## 4. Interaction rules
- Every mutation: button loading state, toast success/error (error shows `message` + code), optimistic update only for toggles.
- Destructive/consequential actions (reject job in bulk, cancel application, enable auto-submit, authorize submission, purge data) → confirm dialog naming the effect.
- Forms: inline validation, unsaved-changes guard.
- Live updates via SSE → TanStack invalidate; show "updated just now" not fake spinners.
- Keyboard: `/` search, `g d` dashboard, `g j` jobs, `g r` review; all dialogs focus-trapped; ARIA labels; tables with `<th scope>`.
- Time: `formatInTimeZone(setting)`; relative + absolute tooltip.
- Labels for provenance everywhere: `Disclosed`, `Estimated (AI)`, `Verified`, `Unverified`, `AI suggestion`, `Needs review`.
- Never display estimated salary without the "Estimated" badge and info tooltip.
- Disabled controls must explain why (tooltip).

## 5. Components to build (shared)
`StatusBadge, ProvenanceBadge, EvidenceList, ScoreBreakdown, EligibilityTable, WorkflowStepper, ReviewCard, AnswerSourceBadge, ConfirmDialog, EmptyState, DataTable (server pagination), FilterBar, TimeAgo, WorkerStatusPill, FormField wrappers`.

## 6. Accessibility checks
axe scan on each page in e2e; focus outlines; color-contrast; reduced motion respected.
