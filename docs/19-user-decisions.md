# 19 — User Decisions Log (authoritative)

These decisions were given by the user on 2026-11-10 and **override** anything earlier in the docs that conflicts. Docs 02–18 have been updated to match; if you find a conflict, this file wins and the other doc must be fixed.

| Q | Decision | Consequence in the plan |
|---|----------|-------------------------|
| Q1 | Sources: Greenhouse, Lever, Ashby, supported company career pages, other ATS where permitted. LinkedIn/Naukri later via authorized APIs, email alerts or user URLs. **No hardcoded company list.** Dynamic company discovery/registration. **Company Discovery is separate from Job Discovery**; companies are discovered and monitored even with zero openings. | New module `company-discovery` (doc 07 §CD), new tables (doc 08 §3A), new UI page `/companies`, ADR-015. Job sources for ATS boards are *derived* from registered company career pages. New milestone M4. |
| Q2 | Gemini first, free-tier key exists. Provider abstraction, configurable models, env credentials, quota handling, retries, caching, usage tracking. **Non-AI functionality must keep working when Gemini is unavailable.** | Degraded-mode spec (doc 11 §10), NFR-DEG-1, tests T-DEG. |
| Q3 | No hardcoded search provider → `SearchProvider` abstraction. Initially: official company sites + public information only. Store evidence URL, timestamp, confidence. Never fabricate. | Doc 07 §intelligence, ADR-016; no news provider in v1 (explicit `unknown`). |
| Q4 | Auto-submission OFF by default. Three levels: **L1** discovery/evaluation, **L2** application preparation with user approval, **L3** policy-controlled auto-submit (future). **Implement only L1 and L2 now.** Legal/contract/consent/sensitive always need explicit authorization. | `autonomy_level` setting (1 or 2 selectable; 3 shown as "Not available yet", no code path). Standing/auto-submit policy removed from v1 (doc 10 §6). ADR-018. See Q14 (open) for what "L2 submission" means. |
| Q5 | Telegram bot + email integrations; user supplies credentials. Job alerts, application updates, configurable notifications, dedupe. Credentials stored securely, never hardcoded/logged. | Doc 13 §3 (env-only secrets, file perms check, never returned by API). Channels M13. |
| Q6 | Default PRD weights, editable in dashboard. Eligibility separate from suitability. Explain every score. | Unchanged design; doc 14 settings weights editor. |
| Q7 | User configures CTC, roles, locations, relocation, work arrangement, notice period etc. manually in dashboard. Nothing hardcoded/assumed. Missing required info → human review. | Doc 03 FR-PRE; all personal fields nullable; mapper treats null as `unknown` → review. |
| Q8 | User uploads existing PDF resume. **No resume generation, rewriting, tailoring or modification.** Implement PDF upload, version management, preview, selection, attachment to portals, **original file preserved.** | Module `resume` becomes **Resume Manager** only (doc 07). Removed: tailoring, AI rewrite, claim validator, templates, DOCX/PDF generation, resume parsing/import into profile, deps `docx`, `pdf-parse`, `mammoth`. ADR-017. |
| Q9 | Retention defaults (configurable): job snapshots 180d; company evidence 180d; failed-automation screenshots 30d; temp browser files deleted after workflow completion; application records until manually deleted; application audit history until its records are deleted; AI execution logs 90d; resume PDFs until manually deleted. Redact sensitive info in logs & screenshots where possible. | Doc 16 §9 retention table, `maintenance.retention` job, `system_settings` keys `retention.*`; screenshot redaction (doc 12 §6). |
| Q10 | **WSL2 Ubuntu primary dev environment**; Playwright inside WSL2; keep portable; native Windows later. | Docs 01, 05, 12, 16 updated; ADR-019. Repo working tree should live on the WSL ext4 filesystem. |
| Q11 | Audit existing PostgreSQL first; reuse if suitable; else lightest reliable setup; avoid Docker just for Postgres. | Audit done (doc 01 §3). Decision: native PostgreSQL 16 in WSL2 via apt (Docker not used). |
| Q12 | EEO/diversity: always human review; never infer/auto-answer demographic or sensitive questions; allow manual answer, decline-to-answer, or blank when permitted. | Category `eeo`/`sensitive` → **no AI call at all**, always review request with options [Provide answer, Decline to answer (if option exists), Leave blank (if not required)]. |

## Additional requirements (all adopted)
- HITL is a core subsystem (doc 10, M9).
- Full traceability: sources, evidence, AI decisions, confidence, user corrections, automation actions → doc 08 §12 traceability matrix, new `user_corrections` and AI-request entity links.
- Job dedup + **duplicate application prevention** (`applications.dedupe_key`, doc 08).
- Unknown stays `unknown` — never fabricated (type-level `Unknown` representation, doc 05 §9).
- Failure recovery: browser crash, network interruption, API quota exhaustion, partially completed applications (doc 10 §9–10).
- Respect access restrictions; never bypass CAPTCHA/auth/anti-bot.

## Environment audit conclusions (2026-11-10)
- WSL2 distro `Ubuntu-D` (Ubuntu 24.04.4, systemd enabled, 7.8 GB RAM visible, ~948 GB free). No Node in WSL yet (the `npm` seen in WSL is the Windows one leaking via PATH — do not use). No PostgreSQL in WSL.
- Windows has PostgreSQL 18 service running (`listen_addresses='*'`, port 5432). Reusing it from WSL is possible but not recommended (listens on all interfaces; cross-OS networking; state outside the dev environment).
- Docker Desktop exists but is stopped → not used.

## Open items created by these decisions
See [18](18-risks-and-open-decisions.md): Q13 (repo location), Q14 (meaning of L2 submit), Q15 (IMAP monitoring), Q16 (company discovery inputs).
