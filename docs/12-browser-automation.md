# 12 — Browser Automation Specification

## 1. Principles
- Playwright, Chromium only, headed or headless via `BROWSER_HEADLESS` (default **headed=false**; "continue manually" opens a headed window for the user).
- Browser module is generic: no DB, no profile knowledge. Application module passes plain data (fill plans).
- Never evade protection: no stealth plugins, no UA spoofing beyond a normal Chromium UA, no proxy rotation, no CAPTCHA solving, no automated login to third-party boards. If blocked → throw `BLOCKED_BY_PORTAL` → workflow pauses → user continues manually.
- Respect robots.txt for page fetching (not for user-initiated application forms the user explicitly asked to apply to, but still honor rate limits and ToS-based driver restrictions; drivers list `allowedAutomation` booleans and default to prepare-only for unknown portals).

## 2. Session & isolation
- One **browser context per application attempt**, fresh (no shared cookies), closed after step group. Storage state persisted ONLY if the driver requires login the user performed manually and user consented (`data/browser-state/<atsHost>.json`, 0600-like perms, excluded from logs/git). Default: none.
- Max concurrency 1. Hard timeouts: navigation 30s, action 10s, step total 120s, whole run 15 min.
- Context options: viewport 1366×900, locale from profile, timezone from settings, `acceptDownloads=false`, permissions none, `serviceWorkers: 'block'`.
- Network allow-list assertion: before fill, current URL host must still equal verified domain set; navigation to other hosts (except same-ATS known hosts, e.g. `boards.greenhouse.io`↔`job-boards.greenhouse.io`) → pause.

## 3. PortalDriver interface
```ts
interface PortalDriver {
  id: 'greenhouse'|'lever'|'ashby'|'generic';
  matches(url: URL): boolean;
  capabilities: { extract: true; fill: boolean; submit: boolean; verify: boolean };
  prepare(page): Promise<PrepareResult>;            // cookie banners (accept only "necessary"/dismiss), detect blocks
  detectBlock(page): Promise<null|'captcha'|'login_required'|'access_denied'|'rate_limited'>;
  extractForm(page): Promise<ExtractedForm>;        // pages[], fields[]
  fill(page, plan: FillPlan): Promise<FillReport>;  // per field result
  readBack(page, fields): Promise<Record<fieldKey, unknown>>;
  uploadFile(page, fieldKey, path): Promise<void>;
  findSubmitControl(page): Promise<Locator|null>;
  verifySubmission(page): Promise<{status:'confirmed'|'already_applied'|'not_confirmed'|'unknown'; evidence}>;
}
```
`generic` driver: extract + fill best-effort, **`submit: false`** (prepare-only) — submission on generic portals is manual.
v1 drivers with submit enabled only after M10 tests pass against the local fixture site AND a live dry-run (fill without submit) on a real posting the user chooses: greenhouse, lever, ashby.

## 4. Form extraction
For each visible interactive control: label resolution order `aria-label` → `<label for>` → wrapping label → `aria-labelledby` → preceding text/legend → placeholder; type from `type`/role/tag; options for select/radio/checkbox groups; `required` from `required`/`aria-required`/asterisk; section/legend; file inputs; help text. Hidden/honeypot fields (hidden via CSS, `aria-hidden`, off-screen, `tabindex=-1` text inputs with names like `website`/`url` in honeypot patterns) are **not filled**. `field_key = sha256(normalizedLabel|type|sortedOptions)`. Selector strategy stored as ordered list `[{kind:'role',name},{kind:'label',text},{kind:'css',sel}]`; re-resolution tries in order (portal layout change tolerance); failure → `LAYOUT_CHANGED` error class.

## 5. Fill rules
- Fill via user-like actions (`fill`, `selectOption`, `check`, `setInputFiles`), then dispatch normal events; after fill `readBack` and compare (normalized). Mismatch → retry once → `fill_mismatch`.
- Fill only fields with an `approved|profile` answer. Unknown/unmapped required field → review request, never leave silently blank or guess.
- Checkbox consent/terms/privacy/declaration checkboxes are **never auto-checked** without a matching `application_authorizations` row of kind consent/legal (per-item).
- Dropdown: choose option by exact normalized text equality; fuzzy only produces a *suggestion* requiring review.
- File upload: only `application_documents` approved files; verify upload chip/filename appears.

## 6. Reliability
- Error classes: `NAVIGATION_TIMEOUT, ELEMENT_NOT_FOUND, LAYOUT_CHANGED, BLOCKED_BY_PORTAL, SESSION_EXPIRED, FILL_MISMATCH, VALIDATION_ERROR_ON_PORTAL, UPLOAD_FAILED, BROWSER_CRASHED, SUBMIT_UNCERTAIN, ALREADY_APPLIED, UNKNOWN`. Retryable: NAVIGATION_TIMEOUT, ELEMENT_NOT_FOUND (once), BROWSER_CRASHED, UPLOAD_FAILED. Not retryable: BLOCKED, LAYOUT_CHANGED (→ pause), SUBMIT_UNCERTAIN (→ unverified).
- On any failure: full-page screenshot + DOM snapshot of form (values redacted for sensitive inputs) saved to `data/screenshots/<applicationId>/<ts>-<step>.png`, path stored in `agent_execution_logs.data`.
- Browser crash mid-fill: new context, re-run from `open_portal` using stored answers (idempotent). Crash after `clicked` → verification-only recovery.
- Verification evidence kinds: confirmation text match, URL pattern (`/confirmation`, `/thanks`), DOM element, later email.

## 7. Testing surfaces
`fixtures/ats-site/`: a tiny local server (Node http + static HTML, started by tests on random port) that imitates Greenhouse-like multi-field forms, with toggles: slow response, 500 on submit, success page, silent no-response (for timeout), CAPTCHA page, login wall, layout change variant, "already applied" page, honeypot fields, required custom questions, file upload. Labeled clearly as FIXTURE. Drivers' `matches()` has a test-only host allowance (`localhost` only when `NODE_ENV=test`).
