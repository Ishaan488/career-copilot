import http from 'node:http';
import { AddressInfo } from 'node:net';

export interface AtsFixtureServerOptions {
  port?: number;
}

export class AtsFixtureServer {
  private server: http.Server | null = null;
  private port = 0;

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
        const pathname = url.pathname;

        // Route: Greenhouse fixture
        if (pathname.includes('/greenhouse')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html>
<html>
<head><title>Acme Corp Careers - Senior Engineer (Greenhouse)</title></head>
<body>
  <h1>Apply for Senior Engineer at Acme Corp</h1>
  <form id="application_form" action="/confirmation" method="POST">
    <div class="field">
      <label for="first_name">First Name *</label>
      <input type="text" id="first_name" name="first_name" required />
    </div>
    <div class="field">
      <label for="last_name">Last Name *</label>
      <input type="text" id="last_name" name="last_name" required />
    </div>
    <div class="field">
      <label for="email">Email *</label>
      <input type="email" id="email" name="email" required />
    </div>
    <div class="field">
      <label for="phone">Phone</label>
      <input type="tel" id="phone" name="phone" />
    </div>
    <div class="field">
      <label for="resume">Resume/CV *</label>
      <input type="file" id="resume" name="resume" required />
    </div>
    <div class="field">
      <label for="cover_letter">Cover Letter</label>
      <textarea id="cover_letter" name="cover_letter"></textarea>
    </div>
    <div class="field">
      <label for="salary_expectations">Expected Salary</label>
      <input type="text" id="salary_expectations" name="salary_expectations" />
    </div>
    <div class="field">
      <label for="work_auth">Are you legally authorized to work in this country?</label>
      <select id="work_auth" name="work_auth">
        <option value="">Select an option</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
    <div class="field">
      <label for="gender">Gender (Voluntary Self-Identification)</label>
      <select id="gender" name="gender">
        <option value="">Select</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="decline">Decline to self-identify</option>
      </select>
    </div>
    <div class="field">
      <label for="agree_terms">
        <input type="checkbox" id="agree_terms" name="agree_terms" required />
        I agree to the privacy policy and terms of application *
      </label>
    </div>

    <!-- Honeypot trap: hidden via CSS and tabindex -->
    <div class="trap-field" style="display: none !important;">
      <label for="hp_website">Do not fill this field</label>
      <input type="text" id="hp_website" name="hp_website" tabindex="-1" autocomplete="off" />
    </div>

    <div class="actions">
      <button type="submit" id="submit_app">Submit Application</button>
    </div>
  </form>
</body>
</html>`);
          return;
        }

        // Route: Lever fixture
        if (pathname.includes('/lever')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html>
<html>
<head><title>Beta Corp - Staff Engineer (Lever)</title></head>
<body>
  <div class="application-page">
    <form class="application-form" action="/confirmation" method="POST">
      <label>Full name * <input type="text" name="name" required /></label>
      <label>Email * <input type="email" name="email" required /></label>
      <label>Phone <input type="tel" name="phone" /></label>
      <label>Resume * <input type="file" name="resume" required /></label>
      <label>Current Company <input type="text" name="org" /></label>
      <label>LinkedIn Profile <input type="text" name="urls[LinkedIn]" /></label>
      <button type="submit" data-qa="btn-submit">Submit application</button>
    </form>
  </div>
</body>
</html>`);
          return;
        }

        // Route: Ashby fixture
        if (pathname.includes('/ashby')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html>
<html>
<head><title>Gamma Inc - Engineer (Ashby)</title></head>
<body>
  <form id="ashby-form" action="/confirmation" method="POST">
    <label for="name">Name *</label>
    <input type="text" id="name" name="name" required />
    <label for="email">Email *</label>
    <input type="email" id="email" name="email" required />
    <label for="file">Resume *</label>
    <input type="file" id="file" name="file" required />
    <button type="submit" data-qa="application-submit-button">Submit Application</button>
  </form>
</body>
</html>`);
          return;
        }

        // Route: Generic fixture
        if (pathname.includes('/generic')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html>
<html>
<head><title>Generic Careers Portal</title></head>
<body>
  <form id="generic-form" action="/confirmation" method="POST">
    <label for="candidate_name">Your Name</label>
    <input type="text" id="candidate_name" name="candidate_name" />
    <label for="candidate_email">Your Email</label>
    <input type="email" id="candidate_email" name="candidate_email" />
    <button type="submit">Submit</button>
  </form>
</body>
</html>`);
          return;
        }

        // Route: CAPTCHA block
        if (pathname.includes('/blocked/captcha')) {
          res.writeHead(403, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html>
<html>
<head><title>Just a moment... Bot Check</title></head>
<body>
  <h1>Verify you are human</h1>
  <div class="cf-turnstile"></div>
</body>
</html>`);
          return;
        }

        // Route: Login block
        if (pathname.includes('/blocked/login')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html>
<html>
<head><title>Sign in to your account</title></head>
<body>
  <h1>Please log in to apply for this job</h1>
  <input type="text" placeholder="Username" />
</body>
</html>`);
          return;
        }

        // Route: 403 Access Denied block
        if (pathname.includes('/blocked/access-denied')) {
          res.writeHead(403, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html>
<html>
<head><title>403 Forbidden - Access Denied</title></head>
<body>
  <h1>Access Denied (Error 1020)</h1>
</body>
</html>`);
          return;
        }

        // Route: Already applied
        if (pathname.includes('/status/already-applied')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html>
<html>
<head><title>Application Status</title></head>
<body>
  <h1>You have already submitted an application for this position.</h1>
</body>
</html>`);
          return;
        }

        // Route: Confirmation
        if (pathname.includes('/confirmation')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html>
<html>
<head><title>Thank you!</title></head>
<body>
  <h1>Thank you for applying. Your application has been submitted.</h1>
</body>
</html>`);
          return;
        }

        // 404 fallback
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}`);
      });

      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getBaseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }
}
