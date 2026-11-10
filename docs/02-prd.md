# 02 — Product Requirements Document

## 1. Vision
A persistent personal job-search operations assistant. It discovers jobs from permitted sources, normalizes/deduplicates, analyzes them, researches the employer with evidence, evaluates eligibility/suitability/risk deterministically, prepares tailored resumes from **verified** profile data, prepares (and, only under explicit authorization, submits) applications, pauses for the human whenever uncertain, and tracks everything with a full audit history.

## 2. User & context
- Single user (the owner). One candidate profile. Local-first on Windows 11 (+optional WSL2), later movable to a VPS.
- Locale: India-oriented (INR, notice periods, CGPA, Naukri/Darwinbox are relevant) but nothing hardcoded to India. Timezone default `Asia/Kolkata`, configurable.
- Not multi-tenant. "Auth" = local access protection (ADR-007).

## 3. Goals
G1 Reduce repetitive job-search work. G2 Never misrepresent the user. G3 Never submit anything unauthorized. G4 Explainable decisions with evidence. G5 Survive restarts without losing state. G6 Extensible adapters/providers.

## 4. Non-goals (v1)
- Multi-user/SaaS, mobile app, billing.
- Scraping LinkedIn/Naukri behind login or evading anti-bot. (They are supported only via email alerts, user-pasted URLs, manual import.)
- Auto-accepting legal terms/bonds/consents.
- Interview scheduling automation, salary negotiation, cover-letter mass generation without review.
- Microservices, Kubernetes, Kafka, Redis.

## 5. Scope by capability
| Area | v1 (must) | Later |
|------|-----------|-------|
| Profile & prefs | Full CRUD, onboarding wizard, resume-upload-as-draft (parsed → user confirms) | LinkedIn import |
| Sources | Greenhouse, Lever, Ashby, SmartRecruiters (public JSON APIs), user URL import, manual paste, RSS/generic feed, email alerts via IMAP (parse alerts) | Workday, Darwinbox, Oracle, SuccessFactors adapters |
| Intelligence | JD analysis, eligibility, suitability, company research (web evidence), comp intelligence, risk | richer review sites |
| Policy | Rule-based, user-editable, versioned, decision log | |
| Resume | Master profile → tailored resume → HTML→PDF + DOCX, validation, versions | LaTeX templates |
| Apply | Playwright drivers for Greenhouse, Lever, Ashby (+ generic form extractor, prepare-only); authorized submit for those with verified success detection | other ATS |
| HITL | Review center, checkpoints, resume after restart | |
| Tracking | Lifecycle, events, notes, IMAP email monitoring, dashboard | Calendar sync |
| Notify | In-app, SSE, Telegram (optional), email SMTP (optional), digest | |

## 6. Primary user journeys
1. **Onboard:** wizard → profile → preferences → autonomy defaults (everything OFF by default) → sources.
2. **Discover → triage:** jobs appear → analyzed → ranked → user shortlists/rejects (or policy auto-shortlists).
3. **Apply:** shortlisted job → prepare resume (approve) → prepare application → review questions → authorize → submit → verify → tracked.
4. **Respond to review:** notification → Review Center → answer/approve/defer → workflow resumes from checkpoint.
5. **Monitor:** email/portal events update tracker; user notified.

## 7. Success criteria (acceptance of the whole product)
- SC1 Full lifecycle runs end-to-end against a local test ATS fixture site with zero fake data in prod paths.
- SC2 Kill the worker/app mid-workflow → restart → workflow resumes from checkpoint, pending reviews intact.
- SC3 Simulated timeout after Submit click never causes second submit.
- SC4 Every recommendation shows eligibility, suitability breakdown, risk, evidence links.
- SC5 No resume claim without mapping to master profile (validator proves it).
- SC6 All defaults are conservative: autonomy OFF until user enables.

## 8. Default (configurable) values — flagged, not assumed
Scoring weights 30/20/15/15/10/10; shortlist threshold 70; strongly-recommended ≥85; recommended ≥70; consider ≥55; low priority <55. Discovery interval 6h. AI daily budget in tokens/requests configured via settings. All editable in UI; all need user confirmation at onboarding (doc 18, Q-list).
