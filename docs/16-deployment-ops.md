# 16 — Deployment & Operations Guide

## 1. Prerequisites (Windows 11)
Node ≥ 22, npm ≥ 10, Git, PostgreSQL ≥ 15 (server) OR Docker Desktop. WSL2 optional.

## 2. Database setup
Option A (local server): create role+db:
```
psql -U postgres -c "CREATE ROLE career LOGIN PASSWORD '<choose>';"
psql -U postgres -c "CREATE DATABASE career_copilot OWNER career;"
psql -U postgres -c "CREATE DATABASE career_copilot_test OWNER career;"
```
Option B: `docker compose up -d db` (`postgres:17-alpine`, volume `pgdata`, port 5432 bound to 127.0.0.1, `mem_limit: 512m`).
Set `DATABASE_URL=postgres://career:<pw>@127.0.0.1:5432/career_copilot` and `TEST_DATABASE_URL=…/career_copilot_test`.

## 3. Environment variables (`.env.example`)
```
NODE_ENV=development
APP_ORIGIN=http://127.0.0.1:3000
APP_SECRET=            # 32+ random bytes hex
DATABASE_URL=
TEST_DATABASE_URL=
DATA_DIR=./data
LOG_LEVEL=info
TZ_DEFAULT=Asia/Kolkata
GEMINI_API_KEY=
BROWSER_HEADLESS=true
BROWSER_MAX_CONCURRENCY=1
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SMTP_HOST= SMTP_PORT= SMTP_USER= SMTP_PASS= SMTP_FROM=
IMAP_HOST= IMAP_PORT= IMAP_USER= IMAP_PASS= IMAP_FOLDER=INBOX
```
`verify:env` validates formats and prints which optional features are enabled.

## 4. Run
```
npm install
npx playwright install chromium
npm run db:migrate
npm run dev:all        # web on 127.0.0.1:3000 + worker (concurrently)
```
Production-like local: `npm run build && npm run start:all`.
Auto-start on login (Windows): Task Scheduler task "CareerCopilot" running `npm run start:all` at logon (document exact XML/command in this file at M13); or WSL2 + systemd user service / `pm2` (optional, document if used).

## 5. Offline honesty
UI shows worker status from `worker_heartbeats`. When PC is off or asleep: nothing runs. On restart: scheduler runs "catch-up" discovery immediately if last run older than interval, and monitoring polls email since last UID. Dashboard shows "Last discovery: <time>" and "Gap detected: machine offline from X to Y".

## 6. Backup & restore
`npm run backup` → `data/backups/<ts>/{db.sql.gz-equivalent via pg_dump -Fc, files.zip}` retaining last 14. `npm run restore -- <path>` (requires confirm flag). Scheduled via the queue (`maintenance.backup` daily) when `pg_dump` is on PATH, else UI warns.

## 7. Migrations
`npm run db:generate` (after schema edit) → review SQL → `npm run db:migrate`. Forward-only; never edit applied migration. pg-boss manages its own schema on start.

## 8. Moving to a VPS
Same build; set `APP_ORIGIN` to https URL; put behind Caddy/Nginx with TLS; bind app to 127.0.0.1; `BROWSER_HEADLESS=true`; "continue manually" flows need a different channel (noVNC or running locally) — document as limitation; managed Postgres via `DATABASE_URL`; `DATA_DIR` on persistent volume; systemd units for web+worker.

## 9. Operations
Health: `/api/health`. Logs: JSON to stdout + `data/logs/app.log` rotated daily (7 days). Disk guard: warn when `data/` > configured GB. Retention: screenshots 30 days, snapshots keep last 10 per listing, ai_requests 90 days (maintenance jobs).

## 10. Troubleshooting table
| Symptom | Check |
|---------|-------|
| Worker offline banner | `npm run dev:worker` running? DB reachable? |
| Jobs not analyzed | AI budget page, GEMINI_API_KEY, failed queue jobs in Activity |
| Browser step fails | screenshot in application Logs tab; `npx playwright install chromium` |
| Port in use | change `PORT` and `APP_ORIGIN` |
