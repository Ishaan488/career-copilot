# 14 — UI/UX Specification

## 1. Design principles
Calm, dense-but-readable, tool-like (think Linear/Notion), not a "AI dashboard". One accent color, neutral grays, 1 level of card nesting max, no gradients, no decorative charts. Tables and lists over cards where scanning matters. Light + dark theme via CSS variables.

Tokens: font Inter (system fallback), base 14px, spacing scale 4px, radius 6px, accent `#2563eb`, success `#16a34a`, warn `#d97706`, danger `#dc2626`, neutral from slate. Status badges use text + color (never color alone).

## 2. Shell
Left sidebar (collapsible; icons+labels) groups: **Work** (Dashboard, Jobs, Recommended, Saved, Applications/Tracker, Review Center [badge=pending count]) · **Prepare** (Resumes, Profile, Preferences) · **System** (Automation, Sources, Notifications, Activity, Settings). Top bar: global search (jobs/companies, `/` shortcut), worker status pill (green "Worker online" / red "Worker offline since …: discovery & monitoring paused"), notification bell, theme toggle. Mobile: sidebar → drawer.

## 3. Pages (route → content → required states)
| Route | Content | Empty state CTA |
|-------|---------|-----------------|
| `/dashboard` | 4 count tiles (New today, Worth considering, Needs review, In progress) → each links to filtered list; "Needs your attention" list (pending reviews, authorization waits, failed automation, unverified submissions); Upcoming deadlines; Recent activity (10 latest real events); Source health strip | "Complete your profile" / "Add a source" |
| `/jobs` | Table: title, company, location/mode, comp (label disclosed/estimated), posted, source(s), status badge, recommendation badge, score. Filters sidebar (status, recommendation, source, work mode, score min, posted, has comp), search, sort, bulk shortlist/reject/save with confirm. Pagination | "Add a source or import a URL" |
| `/jobs/[id]` | Header (title, company link, status, actions: Shortlist/Save/Reject/Prepare application). Tabs: **Overview** (parsed JD structured + original text toggle), **Evaluation** (eligibility rules table pass/fail/unknown with JD quote; suitability breakdown bars with matched/missing; risk; comp; recommendation + explanation), **Company** (summary, legitimacy checklist, evidence list with links & verification badges), **Sources** (listings, snapshots/changes), **History** (status + policy decisions). Duplicate banner if `possible_duplicate`. Injection-warning banner if flagged | — |
| `/companies/[id]` | Identity, domains with verification, evidence table, research freshness + "Re-run research", other jobs | |
| `/recommended` | Jobs with recommendation ≥ consider, sorted by score; eligibility failures hidden by default | "No recommendations yet — analysis runs after discovery" |
| `/saved` | Saved jobs | |
| `/applications` (Tracker) | Kanban-by-status toggle + table; columns follow statuses; card: company, title, last activity, next action, deadline | "Shortlist a job to start" |
| `/applications/[id]` | Workflow stepper (all 15 steps, current highlighted, paused reason), tabs: **Summary** (answers table w/ source badges profile/reusable/AI/human & status; docs; resume version link; submission panel), **Form** (extracted fields), **Events**, **Logs** (execution log + screenshots), **Notes/Contacts/Interviews**. Authorization panel: shows exactly what will be authorized + checkbox + typed confirm "SUBMIT" | |
| `/review` | List with filters; sort by oldest; chips by category | "Nothing needs your attention" |
| `/review/[id]` | Left: question + context + job/application link + why uncertain + evidence. Right: suggested answer (confidence shown as informational with rationale), response form depending on `required_action`: input matching field type, buttons **Approve suggestion / Edit & approve / Provide answer / Investigate more / Defer (date picker) / Reject / Cancel application**; optional checkbox "Save as reusable answer for…" (scope selector) with confirm dialog. Footer: "What happens next: …" text derived from checkpoint (e.g., "The application will resume at 'validate answers' and fill the form.") | |
| `/resumes` | Master + versions list, job association, validation status, preview (PDF viewer in iframe / HTML render), diff between versions, approve button (disabled until validated), download PDF/DOCX | "Generate master resume" |
| `/profile` | Sections as tabs; each item shows verified toggle; completeness sidebar; import-from-resume flow with draft review | Onboarding link |
| `/preferences` | Preference form | |
| `/automation` | Autonomy policy form with plain-language explanations; each auto_* toggle opens confirm dialog stating consequences; policy rules editor (typed forms per rule type); "Simulate on a job" tool; authorization history | |
| `/sources` | Source list with status, last success, last error, run now, enable toggle, add-source wizard per adapter type with config validation + "test fetch" | "Add Greenhouse board" |
| `/notifications` | Feed grouped by day, mark read, links; preferences tab | |
| `/activity` | Tabs: Execution logs, Queue (failed/terminal), AI usage, Audit | |
| `/settings` | Timezone, scoring weights (sum validator), thresholds, AI models & budgets, notification channels (Telegram/email test buttons), passcode change, backup info, data export/purge | |
| `/onboarding` | Wizard steps: Passcode → Personal → Education → Experience → Skills → Projects → Links → Preferences → Autonomy (all OFF) → Sources → Done checklist | |

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
