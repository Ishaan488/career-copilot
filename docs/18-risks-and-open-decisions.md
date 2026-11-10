# 18 — Risks, Constraints, Assumptions & Open Decisions

Resolved questions Q1–Q12 are recorded in [19-user-decisions](19-user-decisions.md).

## 1. Open questions for the user (consequential — do not assume)
| ID | Question | Safe default until answered |
|----|----------|-----------------------------|
| Q13 | Repo location: WSL2 on `/mnt/e/...` is slow (node_modules, file watching unreliable). Move the canonical working tree to WSL ext4 (`~/dev/career-copilot`) and keep `E:\personal\career-copilot` as a git remote/backup? | Yes: M0 clones into `~/dev/career-copilot`; the E: copy stays as a backup remote (`receive.denyCurrentBranch=updateInstead` or a bare repo). Ask before moving anything. |
| Q14 | At Level 2 ("preparation with my approval"), who clicks the final Submit? (a) the automation, after you explicitly authorize that specific application on the final summary screen; or (b) you, manually, in a browser window the system hands over with the form pre-filled. | Implement (b) first (M11, no submit code). Implement (a) in M12 behind `SUBMISSION_ENABLED=false` (env) AND a settings toggle; per-application authorization only; no standing/auto policy. |
| Q15 | Should the system read your mailbox (IMAP, read-only) to detect confirmation/interview/rejection emails? | Disabled. Notifications still work (Telegram/SMTP send only). |
| Q16 | Company discovery inputs you want: manual add (name/domain/URL), CSV/paste import, auto-registration from imported job URLs and email alerts, slug-probing of public ATS APIs by company name? | All enabled except email alerts (needs Q15/IMAP). Probe results stay `partially_verified` until you confirm identity. |
| Q17 | Telegram chat id and SMTP details when you are ready (env only). | Channels disabled until configured. |
| Q18 | Which Gemini model(s)? (agent verifies current free-tier names/limits at M6 and proposes). | Verify from official docs at M6. |

## 2. Assumptions
- Single user, single profile, trusted local machine (WSL2 Ubuntu-D, Windows 11).
- Public ATS JSON APIs (Greenhouse/Lever/Ashby/SmartRecruiters) remain available (verify live at M5).
- Gemini free tier suffices for modest volume (verify at M6).
- No public directory of all companies on an ATS exists → "dynamic discovery" means user-provided inputs, derived registrations, URL imports and API slug probing — **not** an exhaustive crawl of the internet. This is a deliberate honest limitation.
- Some application forms are reachable without login/CAPTCHA (otherwise the workflow pauses and the user continues manually).
- Resume PDF is the user's own file; the system never edits it.

## 3. Technical constraints
- PC sleeping/off → nothing runs; UI states this. WSL2 itself may be stopped when idle (Windows shuts it down) → document `wsl` keep-alive and auto-start (doc 16 §4).
- WSL2 headed browser (for "continue manually") requires WSLg (Windows 11 has it) → verify at M0.
- RAM: WSL sees ~7.8 GB; budget < 1.5 GB for app+Postgres+Chromium.
- Free-tier AI rate limits → budgets, cache, backoff; non-AI features keep working.
- Workday, Darwinbox, Oracle, SuccessFactors: login/bot-sensitive per-tenant flows → **out of v1** (company pages using them are registered as `ats=unsupported`, with manual/URL-import path).
- LinkedIn/Naukri: no scraping.

## 4. Risk register
| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R1 | Accidental unauthorized/duplicate submission | Low | Critical | per-app authorization, intent row, unique index, env + settings flags off by default, manual dry-run |
| R2 | Misstating the user (wrong form answers) | Med | Critical | verified-only snapshot, answer hierarchy, AI answers always `needs_review`, sensitive/EEO never AI |
| R3 | Prompt injection via JD/website | Med | High | channel separation, schema outputs, validators, no AI-driven navigation |
| R4 | Portal layout changes break drivers | High | Med | multi-strategy selectors, LAYOUT_CHANGED pause, readBack validation |
| R5 | ATS blocks automation / ToS | Med | Med | stop on block, prepare-only for unknown portals, manual handover |
| R6 | AI quota exhaustion | High | Med | budgets, cache, defer, degraded mode |
| R7 | False job/company merge | Med | Med | conservative thresholds, flag-don't-merge, keep listings; slug-probe results unverified until confirmed |
| R8 | Scope too large for small agent | High | High | milestone slicing, strict docs |
| R9 | Data loss | Low | High | backup + restore test |
| R10 | Local web exposure | Low | High | loopback bind, Origin/Host checks, SameSite=Strict |
| R11 | Misleading legitimacy conclusion | Med | High | checklist + evidence + wording rules |
| R12 | Gemini model/limit changes | Med | Low | models in settings; verify at M6 |
| R13 | WSL2 /mnt/e slowness or file-lock issues | High if used | Med | work on ext4 (Q13) |
| R14 | Windows PostgreSQL (`listen_addresses='*'`) exposed on LAN | Existing | Med | Not used by this project; recommend user restrict it (informational) |
| R15 | Company slug probing hits wrong company | Med | Med | confidence + user confirmation before monitoring/applying |

## 5. Unresolved technical decisions (decide with evidence at the milestone)
- Gemini model ids/quotas (M6). • Argon2 native build in WSL vs scrypt fallback (M1). • pg-boss transactional enqueue vs outbox relay (M9). • Which public ATS endpoints support listing detail + compensation fields (M5).

## 6. Explicit out-of-scope items
Multi-user, mobile apps, **resume generation/rewriting/tailoring/modification**, resume parsing into profile, auto-accepting legal terms, CAPTCHA solving, LinkedIn/Naukri scraping, interview scheduling, negotiation, cloud infra, Redis/Kafka/K8s, Python services, **Level-3 auto-submit (future)**, news/search provider (future via `SearchProvider`).

## 7. Change log
- 2026-11-10 (a): Initial plan.
- 2026-11-10 (b): Applied user decisions Q1–Q12 (doc 19): company discovery split, no resume generation, L1/L2 only, WSL2 primary, native PG in WSL, retention defaults, EEO rules, traceability.
