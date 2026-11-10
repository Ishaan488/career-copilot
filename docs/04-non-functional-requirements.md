# 04 — Non-Functional Requirements

| ID | Category | Requirement | Verification |
|----|----------|-------------|--------------|
| NFR-REL-1 | Reliability | All workflow progress persisted in Postgres; process memory holds nothing authoritative | Kill-restart test (T-REC-1) |
| NFR-REL-2 | Reliability | Queue jobs idempotent; same job delivered twice yields same result | T-REC-3 |
| NFR-REL-3 | Reliability | Retries: exponential backoff (base 30s, factor 2, jitter ±20%), default max 5; browser steps max 2; **submission 0** | unit + integration |
| NFR-REL-4 | Reliability | Terminal failures visible in UI with error class and remedy | e2e |
| NFR-REL-5 | Reliability | One failing source/adapter/worker type never blocks others | T-DSC-4 |
| NFR-PERF-1 | Performance | Job list (10k rows) loads < 500 ms p95 locally (indexed, paginated 50/page) | perf script |
| NFR-PERF-2 | Performance | Idle RAM: web+worker < 600 MB combined; Chromium launched only on demand, closed after task | manual measure |
| NFR-PERF-3 | Performance | Max 1 concurrent browser context by default (config `BROWSER_MAX_CONCURRENCY=1`) | config test |
| NFR-COST-1 | Cost | AI calls budgeted per day (requests & tokens) via settings; over budget → tasks deferred, user notified | T-AI-5 |
| NFR-COST-2 | Cost | Unchanged JD never re-analyzed (hash cache) | T-AI-4 |
| NFR-SEC-1 | Security | See doc 13. Secrets only in env; redaction on logs; localhost bind | review + tests |
| NFR-PRIV-1 | Privacy | AI prompts include minimal profile subset per task (allow-list per task) | T-AI-7 |
| NFR-OBS-1 | Observability | Structured logs, correlation id (`workflowId`/`jobId`) on every line | review |
| NFR-OBS-2 | Observability | `/api/health` reports db, queue, worker heartbeat age, last discovery | api test |
| NFR-MAIN-1 | Maintainability | Module boundaries enforced by lint/depcruise in CI | `npm run check:deps` |
| NFR-MAIN-2 | Maintainability | Coverage ≥ 90% lines for `domain/` folders; ≥ 70% overall | vitest coverage |
| NFR-PORT-1 | Portability | Runs on Windows native, WSL2, Linux VPS using only `.env` differences | doc 16 |
| NFR-DATA-1 | Data | All timestamps `timestamptz` UTC; UI converts to configured TZ | lint + review |
| NFR-DATA-2 | Data | Migrations forward-only, reviewed SQL; schema matches Drizzle | `drizzle-kit check` |
| NFR-DATA-3 | Data | Nightly local backup `pg_dump` + `data/` files (doc 16) | script test |
| NFR-A11Y-1 | Accessibility | Keyboard navigable, labels on inputs, contrast AA, focus visible | axe in e2e |
| NFR-UX-1 | UX | Every async action shows loading + success/error state | review |
| NFR-LEGAL-1 | Compliance | Respect robots.txt/ToS; no CAPTCHA/login bypass | design + tests |
