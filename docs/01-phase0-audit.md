# 01 — Phase 0: Repository & Environment Audit

Audit date: 2026-11-10. Machine: Windows 11 (user's personal laptop).

## 1. Repository
- Location: `E:\personal\career-copilot` — **new, empty repo** (`git init` done, `.gitignore` and `README.md` only). Nothing to reuse or protect.
- Sibling projects in `E:\personal` (e.g. `talentra-database`, `interview-prep`, `reachinbox-email-scheduler`, `personal-file-task-assistant`) are **unrelated and MUST NOT be modified or imported**. They may be consulted read-only for ideas only if the user asks.

## 2. Toolchain detected
| Tool | Version | Verdict |
|------|---------|---------|
| Node.js | v22.21.1 | ✅ LTS, meets Next.js 15 / Playwright / pg-boss needs |
| npm | 10.9.4 | ✅ Use npm (no pnpm detected; avoids extra install) |
| Git | 2.46.1 | ✅ |
| PostgreSQL client (`psql`) | 18.1 | ✅ client present. **Unverified:** whether a Postgres *server* is running locally. M0 task verifies. |
| Docker | 29.3.1 | ✅ available as fallback to run Postgres (single container `postgres:17-alpine`) |
| Python | 3.11.0 | ⛔ Not used (ADR-008) |
| WSL2 Ubuntu | **not verified** (first audit command was interrupted) | M0 task verifies with `wsl -l -v`. Project MUST run natively on Windows too. |

## 3. Decisions driven by the audit
1. **Native Windows Node + local Postgres** is the primary dev path; WSL2 is optional and supported (no Windows-only APIs; use `node:path`, no shell scripts required — use npm scripts + `tsx`).
2. Postgres: prefer the already-installed Postgres 18 server if running; else `docker compose up db` (compose file provided, single service, 256MB memory limit hint). Both are valid; connection is `DATABASE_URL` only.
3. Resource limits: one Node process for web+API, one for worker, one on-demand Chromium. No Redis/Kafka/containers beyond optional Postgres.
4. No existing code → greenfield scaffold in M0.

## 4. Reuse / change / missing / unsuitable
- Reuse: nothing.
- Missing: everything (scaffold, DB, UI, workers).
- Technically unsuitable: Python (not needed); microservices; Redis queues.

## 5. Open verification items for M0 (agent must run and record results here)
- [ ] `wsl -l -v` result
- [ ] Postgres 18 server running? (`pg_isready`) which port, which superuser
- [ ] Free disk on E: and RAM (`Get-PSDrive E`, `Get-CimInstance Win32_ComputerSystem`)
- [ ] Chromium download via `npx playwright install chromium` succeeds
