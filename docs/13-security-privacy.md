# 13 — Security & Privacy Specification

## 1. Assets & threats
Assets: candidate PII, resumes, API keys (Gemini, Telegram, SMTP/IMAP creds), browser state, DB. Threats: other local web pages hitting localhost (CSRF/DNS rebinding), prompt injection from job content, SSRF through URL import, path traversal in file handling, secrets in logs, over-sharing PII to AI/websites, accidental unauthorized submission, malicious uploaded documents, XSS from scraped HTML.

## 2. Access protection (ADR-007)
- Server binds `127.0.0.1` (`next start -H 127.0.0.1`, worker has no HTTP port).
- First run: `/auth/setup` sets passcode (≥12 chars) → argon2id hash. Login → random 32-byte token; store sha256 in `auth_sessions`; cookie `HttpOnly; SameSite=Strict; Path=/; Secure` when HTTPS; 7-day sliding expiry. Rate-limit login: 5 failures → 1 min lockout, doubling.
- CSRF: reject mutating requests whose `Origin`/`Host` mismatch the configured `APP_ORIGIN`; reject non-JSON content types (except multipart upload route which also checks Origin). DNS-rebinding: validate `Host` header ∈ allowed hosts.
- Security headers via `next.config`: CSP (`default-src 'self'`; no inline scripts except Next nonce), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

## 3. Secrets
`.env` (gitignored, `chmod 600`, checked by `verify:env`) holds `DATABASE_URL, GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SMTP_*, IMAP_*` (IMAP opt-in), `APP_SECRET`. `.env.example` has keys with empty values. Credentials are provided by the user; the agent never asks for them in chat or commits them. Secrets are never stored in DB, never sent to AI, never logged, never rendered in UI/API (API returns only `configured: boolean` and a masked suffix). The Telegram bot token (embedded in Bot API URLs) and SMTP password are redacted by key name and value pattern in logs and errors; outbound HTTP error logging records host + path template only. "Test connection" buttons return success/failure only.

## 4. Redaction (`shared/redact.ts`)
Applied in logger serializers, `audit`, `agent_execution_logs`, error responses. Patterns: emails→`a***@d***.com`, phones→`***1234`, bearer/API keys (`AIza…`, `sk-…`, long base64/hex tokens), cookies (`Set-Cookie`, `Cookie`), `password|passcode|token|secret|authorization` keys → `[REDACTED]`, resume text bodies > 200 chars → length only, addresses. Unit tests with fixtures required. Redactor is applied by key and by value pattern.

## 5. Untrusted content handling
All external text treated as data: HTML sanitized (`sanitize-html` — add as dependency, justified) before storing `description_html` and rendering; render with `dangerouslySetInnerHTML` ONLY from sanitized HTML; plain text preferred. AI prompt rules in doc 11 §3. URLs from external content are never followed automatically except through `safeFetch` after SSRF guard.

## 6. SSRF / fetch safety (`safeFetch`)
Resolve DNS, block private/loopback/link-local/metadata IP ranges (IPv4+IPv6) at connect time (check resolved IP), only http/https, max 5 redirects re-validated each hop, 15s timeout, 5 MB response cap, content-type allow-list, custom UA `CareerCopilot/<ver> (personal use)`, honors per-host rate limit & robots.txt. Test-only override for localhost fixtures via explicit injected option (not env in prod).

## 7. Files
Stored under `DATA_DIR` only; names generated server-side (uuid + `.pdf`). Resume upload: **PDF only**, ≤ 10 MB, magic-byte sniff `%PDF-` (not just extension), stored byte-for-byte (never re-encoded), set read-only after write, sha256 recorded, never executed or parsed for content; downloads/preview served via API with `Content-Disposition` (attachment for download; inline only for the preview route with `Content-Type: application/pdf` and CSP `sandbox`), path join guarded (`path.resolve` must stay under root).

## 8. Authorization policy enforcement points (defense in depth)
1. Application module `submitApprovedApplication` re-checks authorization and both gates (env `SUBMISSION_ENABLED` + settings toggle), not only the workflow step.
2. Browser module `submit()` (exists from M12) requires a `SubmitToken` created only by the application module after DB commit of the `intent` row (type-level guard).
3. DB partial unique index prevents a second active submission; `applications.dedupe_key` partial unique prevents duplicate applications.
4. Core review categories (legal, consent, bond, work auth, salary, notice, relocation, background, EEO, sensitive) are code constants, not editable; AI is never called for them.
5. Audit log entry for every authorization grant/revoke and every submission step.
6. Level 3 (standing auto-submit) has no code path in v1.

## 9. Privacy
Data minimization to AI (doc 11 §5); resumes never sent to AI. No telemetry. Backups local only. Screenshots/logs redacted where possible (doc 12 §6). Retention per doc 16 §9. Export & delete: `npm run data:export` (JSON zip) and `data:purge` (typed confirmation). Browser: no profile exposure to pages except fields being filled for that application. Outbound requests to company sites send no personal data (company discovery/probing uses only public URLs).

## 10. Dependency hygiene
`npm audit` in CI-equivalent script; lockfile committed; pin major versions; no postinstall scripts from unknown packages.

## 11. Security acceptance tests (must exist)
Login lockout • CSRF origin reject • Host header reject • redaction patterns (incl. Telegram token URL) • SSRF blocks 127.0.0.1/10.x/169.254.169.254/[::1]/redirect-to-private (also for company probing/career-page fetch) • path traversal blocked • non-PDF/upload magic-byte mismatch rejected • resume bytes unchanged • XSS payload in JD rendered inert • prompt-injection fixture does not alter structured output beyond schema and sets `injection_suspected` • submit without authorization rejected at every layer • EEO/core field never auto-answered • screenshot redaction masks inputs • no secrets in API responses.
