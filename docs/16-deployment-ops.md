# 16 — Deployment & Operations Guide (WSL2 Ubuntu primary)

Primary environment: **WSL2 Ubuntu 24.04 (`Ubuntu-D`) on Windows 11**, systemd enabled. Native Windows is a later goal (keep code portable: `node:path`, no bash-only scripts in npm scripts).

## 1. One-time WSL setup (user runs, needs sudo)
```bash
# Node 22 LTS via nvm (do NOT use the Windows node/npm that leaks into WSL PATH)
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
source ~/.bashrc && nvm install 22 && nvm use 22
which node npm   # both must be under ~/.nvm, NOT /mnt/c/...
# PostgreSQL 16 native (Ubuntu 24.04 default), no Docker
sudo apt update && sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
# Playwright system deps for Chromium
sudo apt install -y libnss3 libatk-bridge2.0-0 libxkbcommon0 libgbm1 libasound2t64 fonts-liberation
```
Agent MUST NOT run `sudo` commands itself without the user (needs password); it prints the exact commands and waits.
To stop Windows PATH leaking: add to `/etc/wsl.conf` `[interop] appendWindowsPath=false` (optional, recommended) then `wsl --shutdown`.

## 2. Repo location (Q13 resolved)
Develop everything directly inside `E:\personal\career-copilot` (which is `/mnt/e/personal/career-copilot` inside WSL2). Do **not** move or clone the repo elsewhere.
DrvFs (`/mnt/e`) notes:
- Add `.gitattributes` (`* text=auto eol=lf`) so Windows and WSL2 Git never fight over line endings.
- Set `WATCHPACK_POLLING=true` in the `dev` script so Next.js hot-reload works reliably on `/mnt/e`.
- Because Windows DrvFs mounts may not persist POSIX `chmod 600` bits without `metadata` mount options, `verify:env` checks `.env` permissions when on native POSIX filesystems and logs an informational note when on `/mnt/e` DrvFs.

## 3. Database setup (native PostgreSQL 16 in WSL)
```bash
sudo -u postgres psql -c "CREATE ROLE career LOGIN PASSWORD '<choose>';"
sudo -u postgres psql -c "CREATE DATABASE career_copilot OWNER career;"
sudo -u postgres psql -c "CREATE DATABASE career_copilot_test OWNER career;"
```
Keep default `listen_addresses='localhost'` (do not change). `DATABASE_URL=postgres://career:<pw>@127.0.0.1:5432/career_copilot`. The Windows PostgreSQL 18 service is **not used**. Needs extensions: `pgcrypto` or built-in `gen_random_uuid()` (PG ≥13 built in), `pg_trgm` (from contrib) for fuzzy company-name matching.

## 4. Environment variables (`.env.example`)
```
NODE_ENV=development
APP_ORIGIN=http://127.0.0.1:3000
APP_SECRET=              # 32+ random bytes hex
DATABASE_URL=
TEST_DATABASE_URL=
DATA_DIR=./data
LOG_LEVEL=info
GEMINI_API_KEY=
SUBMISSION_ENABLED=false # hard gate #1 for any automated submit (M12); settings toggle is gate #2
BROWSER_HEADLESS=true
BROWSER_MAX_CONCURRENCY=1
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SMTP_HOST=  SMTP_PORT=  SMTP_USER=  SMTP_PASS=  SMTP_FROM=  NOTIFY_EMAIL_TO=
# optional, off unless user opts in (Q15):
IMAP_HOST=  IMAP_PORT=  IMAP_USER=  IMAP_PASS=  IMAP_FOLDER=INBOX
```
`.env` perms must be `chmod 600`; `verify:env` fails with a warning if world-readable. Secrets never go into DB, logs, prompts, or API responses (API returns `configured: true|false`).

## 5. Run
```bash
npm install
npx playwright install chromium
npm run db:migrate
npm run dev:all        # web 127.0.0.1:3000 + worker
```
WSL2 forwards `localhost:3000` to Windows, so open `http://127.0.0.1:3000` in the Windows browser.
Headed browser ("continue manually"): needs WSLg (Windows 11). Verify at M0 with `npx playwright open about:blank` (`BROWSER_HEADLESS=false`). If WSLg is unavailable the manual-handover feature is shown as unavailable (not faked); the user opens the portal URL in their own browser instead.

## 6. Auto-start & keep-alive (document exact commands at M14)
WSL2 stops when idle. Options: (a) Windows Task Scheduler task at logon running `wsl -d Ubuntu-D -- bash -lc "cd /mnt/e/personal/career-copilot && npm run start:all"` (keeps WSL alive while the process runs); (b) systemd user service inside WSL started by (a). UI honesty: worker status pill + "Gap detected: machine/WSL offline from X to Y"; on restart, catch-up discovery runs if last run older than interval.

## 7. Backup & restore
`npm run backup` → `data/backups/<ts>/{db.dump (pg_dump -Fc), files.tar.gz}` retain last 14. `npm run restore -- <path> --yes`. Scheduled daily via queue (`maintenance.backup`) when `pg_dump` exists. Resume PDFs are in `files.tar.gz`. Optionally copy backups to `/mnt/e/...` (Windows disk) via configured `BACKUP_MIRROR_DIR`.

## 8. Migrations
`npm run db:generate` → review SQL → `npm run db:migrate`. Forward-only. pg-boss creates its own schema on start.

## 9. Retention (configurable defaults; Q9) — job `maintenance.retention` daily
| Data | Default | Setting key | Notes |
|------|---------|-------------|-------|
| Job listing snapshots (`job_snapshots`) | 180 days | `retention.jobSnapshotsDays` | always keep the latest snapshot per listing |
| Company research evidence (`evidence` subject=company) | 180 days | `retention.companyEvidenceDays` | evidence referenced by an existing evaluation/application is **archived (body dropped, hash+url kept)**, not hard-deleted, so traces stay valid |
| Failed-automation screenshots | 30 days | `retention.screenshotsDays` | files + rows |
| Temporary browser files (contexts, downloads, tmp state) | delete when workflow completes/cancels/fails terminally | — (not configurable down) | cleanup in `finally` + startup sweep of orphans |
| Application records | until manually deleted | — | no auto-delete |
| Application audit history/events | until the application is deleted | — | cascade on manual delete |
| AI execution logs (`ai_requests`, AI rows of `agent_execution_logs`) | 90 days | `retention.aiLogsDays` | `ai_cache` pruned at same age |
| Other execution logs | 90 days (same key family `retention.execLogsDays`) | | |
| Resume PDFs | until manually deleted | — | manual delete requires confirm and is blocked if the version is attached to an active (non-terminal) application |
Retention job logs counts deleted; never deletes anything not covered above. Manual "Delete application" also removes its events, answers, screenshots, form fields (confirm dialog lists what is removed).

## 10. Moving to a VPS later
Same build; HTTPS reverse proxy (Caddy), `APP_ORIGIN` https, Postgres via `DATABASE_URL`, `DATA_DIR` persistent; headed handover unavailable (limitation).

## 11. Operations
Health `/api/health`. Logs JSON to stdout + `data/logs/app.log` (daily rotate, 7 days). Disk guard warn on `data/` size.

## 12. Troubleshooting
| Symptom | Check |
|---------|-------|
| `node` points to /mnt/c | PATH leak; use nvm; set appendWindowsPath=false |
| Worker offline banner | worker running? WSL up? DB service `systemctl status postgresql` |
| Jobs not analyzed | AI usage page, `GEMINI_API_KEY`, failed jobs in Activity (non-AI features still work) |
| Browser step fails | screenshot in application Logs tab; `npx playwright install chromium`; deps from §1 |
| Slow install/watch | repo on `/mnt/e`? move to ext4 |
