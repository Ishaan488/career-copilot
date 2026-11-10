# 12 — Browser Automation Specification

## 1. Principles
- Playwright, Chromium only, running **inside WSL2 Ubuntu** (Q10). Headless by default (`BROWSER_HEADLESS=true`); "manual handover" opens a **headed** window via WSLg (Windows 11) — verified at M0; if WSLg is unavailable the handover button is disabled with an explanation and the user opens the portal URL in their own browser (never faked).
- Browser module is generic: no DB, no profile knowledge. Application module passes plain data (fill plans).
- Never evade protection: no stealth plugins, no UA spoofing beyond a normal Chromium UA, no proxy rotation, no CAPTCHA solving, no automated login to third-party boards. If blocked → throw `BLOCKED_BY_PORTAL` → workflow pauses → user continues manually.
- Respect robots.txt for page fetching; drivers list `allowedAutomation` booleans and default to prepare-only for unknown portals.
- **No submit capability exists in the browser module until M12**; afterwards `submit()` requires a `SubmitToken` (doc 13 §8).
- Resume attachment: `setInputFiles(originalPath)` with the unmodified uploaded PDF (Q8); record sha256 of the file path given.

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
In v1 (through M11) **all** drivers have `submit: false`. `submit` is enabled per driver only in M12 after fixture tests pass AND a live dry-run (fill without submit) on a real posting the user chooses: greenhouse, lever, ashby. Workday/Darwinbox/Oracle/SuccessFactors have no driver (companies marked `unsupported`; manual path).

## 4. Form extraction
For each visible interactive control: label resolution order `aria-label` → `<label for>` → wrapping label → `aria-labelledby` → preceding text/legend → placeholder; type from `type`/role/tag; options for select/radio/checkbox groups; `required` from `required`/`aria-required`/asterisk; section/legend; file inputs; help text. Hidden/honeypot fields (hidden via CSS, `aria-hidden`, off-screen, `tabindex=-1` text inputs with names like `website`/`url` in honeypot patterns) are **not filled**. `field_key = sha256(normalizedLabel|type|sortedOptions)`. Selector strategy stored as ordered list `[{kind:'role',name},{kind:'label',text},{kind:'css',sel}]`; re-resolution tries in order (portal layout change tolerance); failure → `LAYOUT_CHANGED` error class.

## 5. Fill rules
- Fill via user-like actions (`fill`, `selectOption`, `check`, `setInputFiles`), then dispatch normal events; after fill `readBack` and compare (normalized). Mismatch → retry once → `fill_mismatch`.
- Fill only fields with an `approved|profile` answer. Unknown/unmapped required field → review request, never leave silently blank or guess.
- Checkbox consent/terms/privacy/declaration checkboxes are **never auto-checked** without a matching `application_authorizations` row of kind consent/legal (per-item).
- Dropdown: choose option by exact normalized text equality; fuzzy only produces a *suggestion* requiring review.
- File upload: only the user-selected **original** resume file (`resume_attachments`) and other approved files; verify upload chip/filename appears; record attached sha256.
- EEO/demographic & other core fields: filled only from a human answer; "decline to answer" chosen only when the portal offers that option and the user picked it; "leave blank" only when the field is not required.

## 6. Reliability
- Error classes: `NAVIGATION_TIMEOUT, ELEMENT_NOT_FOUND, LAYOUT_CHANGED, BLOCKED_BY_PORTAL, SESSION_EXPIRED, FILL_MISMATCH, VALIDATION_ERROR_ON_PORTAL, UPLOAD_FAILED, BROWSER_CRASHED, SUBMIT_UNCERTAIN, ALREADY_APPLIED, UNKNOWN`. Retryable: NAVIGATION_TIMEOUT, ELEMENT_NOT_FOUND (once), BROWSER_CRASHED, UPLOAD_FAILED. Not retryable: BLOCKED, LAYOUT_CHANGED (→ pause), SUBMIT_UNCERTAIN (→ unverified).
- On any failure: full-page screenshot + DOM snapshot saved to `data/screenshots/<applicationId>/<ts>-<step>.png`, path in `agent_execution_logs.data`. **Redaction (Q9):** before capture, inject a style that masks all `input, textarea, select` values and elements matching sensitive patterns (email/phone/address/EEO/DOB/CTC/passport/SSN labels) and any `[type=password]` (e.g., `color:transparent; text-shadow:0 0 8px #000; background:#888`); DOM snapshots strip `value` attributes. Retention 30 days. Screenshots are best-effort redacted — doc states "wherever possible".
- **Temp files:** each run uses `data/tmp/browser/<workflowId>/` (user-data dir, downloads, traces). Deleted in `finally` when the workflow completes/cancels/fails terminally, and by a startup sweep of orphans older than 1h. While a workflow is paused for review, no browser or temp files are kept (portal is re-opened on resume).
- Browser crash mid-fill: new context, re-run from `open_portal` using stored answers (idempotent; read-back first). Crash after `clicked` → verification-only recovery.
- Verification evidence kinds: confirmation text match, URL pattern (`/confirmation`, `/thanks`), DOM element, later email.

## 7. Testing surfaces
`fixtures/ats-site/`: a tiny local server (Node http + static HTML, started by tests on random port) that imitates Greenhouse-like multi-field forms, with toggles: slow response, 500 on submit, success page, silent no-response (for timeout), CAPTCHA page, login wall, layout change variant, "already applied" page, honeypot fields, required custom questions, file upload. Labeled clearly as FIXTURE. Drivers' `matches()` has a test-only host allowance (`localhost` only when `NODE_ENV=test`).
