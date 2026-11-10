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
- Scraping LinkedIn/Naukri behind login or evading anti-bot. (Later via authorized APIs, email alerts, user-provided URLs.)
- **Resume generation, rewriting, tailoring or modification of any kind** (user uploads their own PDF; it is stored, previewed, selected and attached byte-for-byte).
- **Level-3 policy-controlled automatic submission** (future; no code path in v1).
- Auto-accepting legal terms/bonds/consents; answering EEO/demographic/sensitive questions automatically.
- Interview scheduling automation, salary negotiation.
- Microservices, Kubernetes, Kafka, Redis.
- A hardcoded list of companies, or an exhaustive crawl of "all companies" (see doc 18 assumptions).

## 5. Autonomy levels (user-selected, default L1)
| Level | Name | Behavior | v1 |
|-------|------|----------|----|
| L1 | Discovery & evaluation | Discover companies/jobs, analyze, evaluate, recommend, notify. Never opens an application portal. | ✅ |
| L2 | Preparation with approval | Prepares application: fills forms, attaches selected resume, pauses for review; **user approves each application**. Submission only by the user (manual handover) or by automation after explicit per-application authorization (doc 18 Q14), gated by env + settings. | ✅ |
| L3 | Policy-controlled auto-submit | Standing policy permits routine submissions. | ❌ future |
Legal declarations, contracts, consent, EEO/demographic and other sensitive decisions require explicit user authorization at every level, always.

## 6. Scope by capability
| Area | v1 (must) | Later |
|------|-----------|-------|
| Profile & prefs | Full manual CRUD, onboarding wizard; every personal field starts unknown/null | LinkedIn import |
| **Company Discovery** (separate from jobs) | Company registry (no hardcoded list), manual add/CSV import/auto-registration from job URLs, career-page & ATS detection, public-ATS slug probing (user-confirmed), monitoring even with 0 openings | search-provider based discovery |
| Job Discovery | Greenhouse, Lever, Ashby, SmartRecruiters (public APIs) for registered company boards, company career pages (JSON-LD/supported ATS), user URL import, manual paste, RSS feed | LinkedIn/Naukri via authorized API/email alerts, Workday, Darwinbox, Oracle, SuccessFactors |
| Intelligence | JD analysis, eligibility, suitability, company research from official/public info, comp intelligence (disclosed/estimated labeled), risk | `SearchProvider` implementations (news, reviews) |
| Policy | Rule-based, user-editable, versioned, decision log | |
| Resume Manager | PDF upload, original preserved, versions, preview, selection, attachment | — (no generation ever planned without new decision) |
| Apply (L2) | Playwright (WSL2) drivers Greenhouse, Lever, Ashby (+generic prepare-only); manual handover; per-application authorized submit with verification | other ATS, L3 |
| HITL | Review center, checkpoints, resume after restart | |
| Tracking | Lifecycle, events, notes, dashboard; IMAP monitoring only if user opts in | Calendar sync |
| Notify | In-app, Telegram bot, SMTP email, dedupe, digest | |

## 7. Primary user journeys
1. **Onboard:** wizard → profile → preferences → autonomy (L1, everything else OFF) → upload resume PDF → add companies/sources.
2. **Company discovery:** user adds company (name/domain/URL/CSV) → system detects career page/ATS → registers monitor → jobs flow into Job Discovery.
3. **Discover → triage:** jobs appear → analyzed (if AI available) → ranked → user shortlists/rejects (auto-shortlist only if enabled).
4. **Apply (L2):** shortlisted job → select uploaded resume → prepare application → review questions → approve → submit (manual handover or per-app authorized) → verify → tracked.
4. **Respond to review:** notification → Review Center → answer/approve/defer → workflow resumes from checkpoint.
5. **Monitor:** email/portal events update tracker; user notified.

## 8. Success criteria (acceptance of the whole product)
- SC1 Full lifecycle runs end-to-end against a local test ATS fixture site with zero fake data in prod paths.
- SC2 Kill the worker/app mid-workflow → restart → workflow resumes from checkpoint, pending reviews intact.
- SC3 Simulated timeout after Submit click never causes second submit.
- SC4 Every recommendation shows eligibility, suitability breakdown, risk, evidence links.
- SC5 Uploaded resume PDF bytes are identical (sha256) at upload, preview, and attachment.
- SC6 Defaults conservative: L1 only until user raises level; automated submit disabled by env + settings.
- SC7 With Gemini unavailable, all non-AI features still work (degraded mode).
- SC8 EEO/sensitive/legal questions never answered without the user.
- SC9 Companies are monitored even with zero openings; no company list is hardcoded.
- SC10 Every AI output, user correction and automation action is traceable (doc 08 §12).

## 9. Default (configurable) values
Scoring weights 30/20/15/15/10/10 (editable in dashboard); shortlist threshold 70; strongly-recommended ≥85; recommended ≥70; consider ≥55; low priority <55. Discovery interval 6h; company check interval 24h. AI budgets via settings. Retention per doc 16 §9 (Q9). No personal values (CTC, notice, roles, locations) are defaulted — the user enters them (Q7).
