# Career Copilot — Known Limitations & Architectural Boundaries

> **Authoritative Reference:** Doc 17 §M14, Doc 02 PRD, Doc 13 §8, Doc 16 §9  
> **Target Audience:** Operators, developers, and users of Career Copilot

This document provides a frank, transparent assessment of the operational boundaries, non-goals, and known failure modes of Career Copilot. Understanding these boundaries ensures realistic expectations and safe operation.

---

## 1. Single-Tenant, Single-User Architecture

Career Copilot is intentionally architected as a **single-tenant desktop companion**, running locally under the user's control.
- **Not a Multi-Tenant SaaS:** The database schema, session management, and configuration models are bound to a single candidate profile. There is no multi-organization isolation, tenant routing, or role-based access control (RBAC).
- **Security Boundary:** The primary security boundary is the local operating system account and loopback interface (`127.0.0.1`). Exposing Career Copilot directly to the public internet without an authenticating reverse proxy or VPN is explicitly unsupported and unsafe.

---

## 2. Strict Zero-CAPTCHA Evasion Policy

Per ethical design principles and system security invariants (Doc 00 §3, Doc 13 §8):
- **Never Solves or Bypasses Anti-Bot Shields:** Career Copilot does **not** attempt to solve, evade, or automate reCAPTCHA, hCaptcha, Cloudflare Turnstile, Arkose Labs, or any proof-of-work challenge.
- **Immediate Safe Halt:** Upon encountering an anti-bot challenge during application filling:
  1. The browser automation immediately halts and captures a diagnostic screenshot.
  2. The workflow transitions to `blocked` (`BLOCKED_BY_PORTAL`).
  3. A notification is dispatched via Telegram/desktop alert requesting the candidate to perform a headed takeover via WSLg or manually submit.
- **Why this is intentional:** Bypassing bot protections risks applicant IP bans, violates platform terms of service, and jeopardizes candidate reputations with prospective employers.

---

## 3. Headed Takeover Environment Requirements

The headed browser takeover mechanism relies on graphical display forwarding:
- **Windows 11 WSL2:** Seamlessly supported out-of-the-box via native **WSLg** (`DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`).
- **Headless Linux Servers / VPS:** Environments without an active X11 display server or Wayland compositor cannot launch headed Chromium. In such environments, attempted headed takeovers will raise `HEADED_UNAVAILABLE`, requiring the candidate to complete the submission directly in their standard desktop web browser.

---

## 4. ATS DOM Brittleness & Form Field Matching

Career Copilot includes robust, dedicated drivers for the top 4 Applicant Tracking Systems:
- **Greenhouse**
- **Lever**
- **Ashby**
- **SmartRecruiters**

However:
- **Custom CSS / Enterprise Overhauls:** Companies frequently customize their career portals using arbitrary third-party form builders, custom iframes, or React/Shadow DOM widgets that deviate from standard ATS markup.
- **Graceful Fallback:** When a required field selector cannot be resolved with high confidence, the automation **never guesses**. It pauses and routes the specific field to the Human-in-the-Loop Review Center (`/reviews`).
- **Unmapped ATS Portals:** Proprietary or legacy portal engines (e.g. Workday, Taleo, SuccessFactors) are supported only through generic heuristics or require candidate-driven form assistance.

---

## 5. Submission Protocol: At-Most-Once Guarantee

To prevent catastrophic duplicates (e.g. applying twice for the same job requisition, which can result in immediate disqualification by ATS screening algorithms):
- **Single-Submit Invariant:** Automated form submission is attempted **at most ONCE** per application attempt.
- **Timeout Ambiguity:** If a network timeout, socket hangup, or browser crash occurs *after* the final submit button has been clicked but *before* confirmation DOM confirmation is received, the system **never retries the submit POST automatically**.
- Instead, the application state is locked with reason `SUBMIT_TIMEOUT_UNCERTAIN`, requiring the user to verify their email inbox for an ATS acknowledgment before re-attempting or marking as submitted.

---

## 6. AI Quotas & Rate Limits

The AI extraction and synthesis pipeline uses Google Gemini models:
- **Free-Tier Limits:** Standard Gemini free API keys are subject to strict rate limits (15 RPM, 1,000,000 tokens/minute). Rapidly ingesting dozens of high-volume RSS feeds or bulk career pages can temporarily trigger HTTP 429 quota exhaustion.
- **Degraded Mode Resilience:** When rate limits or 503 provider outages occur, jobs are marked `pending_ai` (degraded mode) rather than failed. Background workers drain this backlog automatically using exponential backoff once quotas reset.

---

## 7. Storage, Retention & Backups

- **Local-Only by Default:** All resume PDF files, profile versions, evaluation logs, and SQLite/PostgreSQL records are stored entirely on the local machine (`DATA_DIR`).
- **No Cloud Sync:** Career Copilot does not upload data to any proprietary cloud service. To prevent data loss from local disk failure, users **must** configure `BACKUP_MIRROR_DIR` pointing to an external hard drive, NAS, or cloud-synced directory (such as OneDrive or Google Drive).
- **Pruning Invariant:** Automated data retention pruning cleans up old job snapshots (180 days), temporary browser screenshots (30 days), and AI logs (90 days). In contrast, **applications, application events, and uploaded resume PDFs are permanently preserved** and can only be deleted via explicit, confirmation-guarded purge (`npm run data:purge`).

---

## 8. Email Monitoring Limits

Email parsing for application updates, interview requests, and rejections:
- Requires standard IMAP access with dedicated application passwords (e.g. Google App Passwords).
- Corporate Single Sign-On (SSO) email systems or personal accounts that disallow IMAP/SMTP cannot be polled directly; updates for these accounts must be recorded manually via the Web UI.
