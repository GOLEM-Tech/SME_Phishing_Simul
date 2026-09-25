'use strict';

const express  = require('express');
const pool     = require('../config/db.js');
const notificationService = require('../services/notificationService.js');

const router = express.Router();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves real client IP, honouring X-Forwarded-For set by trusted proxies.
 * Takes the leftmost (originating) entry from the comma-separated list.
 */
function resolveClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || (req.connection && req.connection.remoteAddress) || 'UNKNOWN';
}

/**
 * Minimal HTML-escape for values injected into HTML attribute contexts.
 * Prevents token-based XSS if a crafted token is ever supplied via the URL.
 */
function escapeHTML(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Writes a CREDENTIAL_SUBMISSION event row and updates the recipient record.
 * All DB writes are parameterised. No credential text reaches this function.
 * @param {string} token           - Unique per-recipient tracking token
 * @param {string|null} identifier - Captured username / email string (NOT password)
 * @param {string} clientIP        - Originating IP address
 * @param {string} userAgent       - HTTP User-Agent header value
 * @param {string} occurredAt      - ISO 8601 submission timestamp
 * @returns {{ recipientId: number, campaignId: number, employeeId: number }|null}
 */
async function persistCredentialEvent(token, identifier, clientIP, userAgent, occurredAt) {
  // Resolve recipient row via tracking token
  const [recipients] = await pool.execute(
    `SELECT id, campaign_id, employee_id
       FROM campaign_recipients
      WHERE tracking_token = ?
      LIMIT 1`,
    [token]
  );

  if (recipients.length === 0) {
    // Token not found — orphaned or tampered submission; still serve disclosure
    return null;
  }

  const { id: recipientId, campaign_id: campaignId, employee_id: employeeId } = recipients[0];

  // Insert canonical event record
  await pool.execute(
    `INSERT INTO email_events
       (campaign_recipient_id, campaign_id, employee_id,
        event_type, ip_address, user_agent, captured_identifier, occurred_at)
     VALUES (?, ?, ?, 'CREDENTIAL_SUBMISSION', ?, ?, ?, ?)`,
    [recipientId, campaignId, employeeId, clientIP, userAgent, identifier, occurredAt]
  );

  // Stamp recipient row — idempotent via COALESCE so first-submission timestamp wins
  await pool.execute(
    `UPDATE campaign_recipients
        SET status = 'CREDENTIALS_SUBMITTED',
            credentials_submitted_at = COALESCE(credentials_submitted_at, ?)
      WHERE id = ?`,
    [occurredAt, recipientId]
  );

  return { recipientId, campaignId, employeeId };
}

// ---------------------------------------------------------------------------
// HTML template builders
// ---------------------------------------------------------------------------

/**
 * Office 365 structural login clone.
 * Token is embedded in a hidden field; form POSTs to /login/office365.
 */
function buildOffice365Clone(token) {
  const safeToken = escapeHTML(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in to your account</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
      background: #f3f2f1;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #ffffff;
      width: 440px;
      padding: 44px 44px 32px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.13);
    }
    .ms-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 28px;
    }
    .ms-logo svg { width: 21px; height: 21px; }
    .ms-logo-text {
      font-size: 1.35rem;
      font-weight: 600;
      color: #1b1b1b;
      letter-spacing: -0.01em;
    }
    h1 { font-size: 1.5rem; font-weight: 600; color: #1b1b1b; margin-bottom: 10px; }
    .sign-into { font-size: 0.9rem; color: #323130; margin-bottom: 18px; }
    .field {
      border: 1px solid #8a8886;
      height: 40px;
      width: 100%;
      padding: 0 10px;
      font-size: 0.9375rem;
      font-family: inherit;
      color: #1b1b1b;
      outline: none;
      margin-bottom: 14px;
    }
    .field:focus { border-color: #0067b8; border-bottom-width: 2px; }
    .forgot { font-size: 0.8125rem; margin-bottom: 24px; }
    .forgot a { color: #0067b8; text-decoration: none; }
    .forgot a:hover { text-decoration: underline; }
    .btn-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
    }
    .create-link { font-size: 0.8125rem; color: #0067b8; text-decoration: none; }
    .create-link:hover { text-decoration: underline; }
    .next-btn {
      background: #0067b8;
      color: #fff;
      border: none;
      padding: 0 20px;
      height: 36px;
      font-size: 0.875rem;
      font-family: inherit;
      font-weight: 600;
      cursor: pointer;
      min-width: 108px;
    }
    .next-btn:hover { background: #005a9e; }
    .footer {
      margin-top: 36px;
      font-size: 0.75rem;
      color: #616161;
      display: flex;
      gap: 16px;
    }
    .footer a { color: #0067b8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="ms-logo">
      <svg viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
        <rect x="0"  y="0"  width="10" height="10" fill="#f25022"/>
        <rect x="11" y="0"  width="10" height="10" fill="#7fba00"/>
        <rect x="0"  y="11" width="10" height="10" fill="#00a4ef"/>
        <rect x="11" y="11" width="10" height="10" fill="#ffb900"/>
      </svg>
      <span class="ms-logo-text">Microsoft</span>
    </div>
    <h1>Sign in</h1>
    <p class="sign-into">to continue to Office 365</p>
    <form method="POST" action="/login/office365" autocomplete="on">
      <input type="hidden" name="token" value="${safeToken}" />
      <input class="field" type="email"    name="email"    placeholder="Email, phone, or Skype" autocomplete="username"         required />
      <input class="field" type="password" name="password" placeholder="Password"               autocomplete="current-password" required />
      <p class="forgot"><a href="#">Forgot my password</a></p>
      <div class="btn-row">
        <a href="#" class="create-link">Create one!</a>
        <button type="submit" class="next-btn">Sign in</button>
      </div>
    </form>
    <div class="footer">
      <a href="#">Terms of use</a>
      <a href="#">Privacy &amp; cookies</a>
      <a href="#">...</a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Gmail structural login clone.
 * Token is embedded in a hidden field; form POSTs to /login/gmail.
 */
function buildGmailClone(token) {
  const safeToken = escapeHTML(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in – Google Accounts</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Google Sans', Roboto, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      background: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .card {
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 48px 40px 36px;
      width: 450px;
      text-align: center;
    }
    .g-wordmark {
      font-size: 1.375rem;
      color: #5f6368;
      font-weight: 400;
      letter-spacing: -0.5px;
      margin-bottom: 20px;
    }
    .g-wordmark span.g { color: #4285f4; }
    .g-wordmark span.o1 { color: #ea4335; }
    .g-wordmark span.o2 { color: #fbbc05; }
    .g-wordmark span.gl { color: #4285f4; }
    .g-wordmark span.e { color: #34a853; }
    h1 { font-size: 1.5rem; font-weight: 400; color: #202124; margin-bottom: 8px; }
    .sub { font-size: 1rem; color: #202124; margin-bottom: 28px; }
    .float-wrap {
      position: relative;
      margin-bottom: 20px;
      text-align: left;
    }
    .float-wrap input {
      width: 100%;
      height: 56px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      padding: 20px 12px 4px;
      font-size: 0.9375rem;
      font-family: inherit;
      color: #202124;
      outline: none;
      background: transparent;
    }
    .float-wrap input:focus { border-color: #1a73e8; border-width: 2px; }
    .float-wrap label {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #5f6368;
      font-size: 0.9375rem;
      pointer-events: none;
      transition: 0.15s ease;
      background: #fff;
    }
    .float-wrap input:focus + label,
    .float-wrap input:not(:placeholder-shown) + label {
      top: 4px;
      transform: none;
      font-size: 0.72rem;
      color: #1a73e8;
      padding: 0 4px;
    }
    .forgot-row { text-align: left; margin-bottom: 32px; }
    .forgot-row a { color: #1a73e8; font-size: 0.875rem; font-weight: 500; text-decoration: none; }
    .forgot-row a:hover { text-decoration: underline; }
    .btn-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .create-link {
      color: #1a73e8;
      font-size: 0.875rem;
      font-weight: 500;
      text-decoration: none;
    }
    .create-link:hover { text-decoration: underline; }
    .next-btn {
      background: #1a73e8;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 10px 24px;
      font-size: 0.875rem;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      min-width: 90px;
    }
    .next-btn:hover { background: #1765cc; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
    .g-footer {
      margin-top: 28px;
      font-size: 0.75rem;
      color: #5f6368;
      display: flex;
      gap: 14px;
      justify-content: center;
    }
    .g-footer a { color: #1a73e8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="g-wordmark">
      <span class="g">G</span><span class="o1">o</span><span class="o2">o</span><span class="gl">g</span><span class="e">l</span><span class="o1">e</span>
    </div>
    <h1>Sign in</h1>
    <p class="sub">Use your Google Account</p>
    <form method="POST" action="/login/gmail" autocomplete="on">
      <input type="hidden" name="token" value="${safeToken}" />
      <div class="float-wrap">
        <input type="email"    name="email"    id="g-email"    placeholder=" " autocomplete="username"         required />
        <label for="g-email">Email or phone</label>
      </div>
      <div class="float-wrap">
        <input type="password" name="password" id="g-password" placeholder=" " autocomplete="current-password" required />
        <label for="g-password">Enter your password</label>
      </div>
      <div class="forgot-row"><a href="#">Forgot password?</a></div>
      <div class="btn-row">
        <a href="#" class="create-link">Create account</a>
        <button type="submit" class="next-btn">Next</button>
      </div>
    </form>
    <div class="g-footer">
      <a href="#">Help</a>
      <a href="#">Privacy</a>
      <a href="#">Terms</a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Educational disclosure page served immediately after any form submission.
 * Platform label is injected for context-specific copy.
 */
function buildDisclosurePage(platformLabel) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Security Awareness Alert</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .panel {
      background: #1e293b;
      border: 1px solid #f59e0b;
      border-radius: 10px;
      max-width: 560px;
      width: 100%;
      padding: 44px 40px 36px;
      text-align: center;
    }
    .icon-ring {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: rgba(245, 158, 11, 0.12);
      border: 1.5px solid rgba(245, 158, 11, 0.35);
      margin-bottom: 22px;
    }
    .icon-ring svg { width: 30px; height: 30px; fill: #f59e0b; }
    .pill {
      display: inline-block;
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 20px;
      border: 1px solid rgba(245, 158, 11, 0.3);
      margin-bottom: 18px;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 700;
      color: #f59e0b;
      letter-spacing: -0.01em;
      margin-bottom: 14px;
      line-height: 1.3;
    }
    .body-copy {
      font-size: 0.9rem;
      color: #94a3b8;
      line-height: 1.7;
      margin-bottom: 14px;
    }
    .no-store-note {
      font-size: 0.875rem;
      color: #f8fafc;
      font-weight: 600;
      margin-bottom: 14px;
    }
    hr.sep {
      border: none;
      border-top: 1px solid #334155;
      margin: 24px 0;
    }
    .tips-heading {
      font-size: 0.8rem;
      font-weight: 700;
      color: #cbd5e1;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }
    .tips {
      list-style: none;
      text-align: left;
    }
    .tips li {
      position: relative;
      padding-left: 18px;
      font-size: 0.855rem;
      color: #94a3b8;
      line-height: 1.65;
      margin-bottom: 10px;
    }
    .tips li::before {
      content: '›';
      position: absolute;
      left: 0;
      color: #f59e0b;
      font-weight: 800;
      font-size: 1rem;
      line-height: 1.5;
    }
    .ack-btn {
      display: inline-block;
      margin-top: 28px;
      background: #f59e0b;
      color: #0f172a;
      font-weight: 700;
      font-size: 0.875rem;
      padding: 13px 32px;
      border-radius: 6px;
      text-decoration: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
    }
    .ack-btn:hover { background: #d97706; }
  </style>
</head>
<body>
  <div class="panel">
    <div class="icon-ring">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2 1 21h22L12 2zm0 3.99L20.47 19H3.53L12 5.99zM11 10h2v4h-2zm0 6h2v2h-2z"/>
      </svg>
    </div>
    <div class="pill">Phishing Simulation Exercise</div>
    <h1>This was a simulated phishing attack.</h1>
    <p class="body-copy">
      The <strong style="color:#f8fafc">${escapeHTML(platformLabel)}</strong> login page you
      just submitted credentials on was a controlled security awareness exercise run by your
      organisation — not a real service. These simulations are conducted to measure and
      strengthen the organisation's human security layer.
    </p>
    <p class="no-store-note">Your credentials were not stored, transmitted, or used in any way.</p>
    <p class="body-copy">
      Your interaction has been recorded and remedial security awareness training has been
      automatically assigned to your profile. Completing it will remove this incident from
      your risk record.
    </p>
    <hr class="sep" />
    <p class="tips-heading">How to identify phishing attempts</p>
    <ul class="tips">
      <li>Inspect the full URL in the address bar before entering credentials — spoofed domains often differ by a single character or use a lookalike TLD.</li>
      <li>Legitimate services will never solicit your password through an unsolicited or unexpected email link.</li>
      <li>Verify HTTPS and confirm the domain exactly matches the official service address; a padlock alone is not sufficient.</li>
      <li>When in doubt, navigate directly to the service by typing its known address into your browser rather than following a link.</li>
      <li>Report suspicious emails to your IT Security team immediately — even if you have already clicked.</li>
    </ul>
    <button class="ack-btn" onclick="window.close()">Acknowledge &amp; Close</button>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// GET /login/office365
// Serves the O365 structural clone with the tracking token embedded.
// ---------------------------------------------------------------------------
router.get('/login/office365', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Prevent upstream caching of simulation pages
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  return res.status(200).send(buildOffice365Clone(token));
});

// ---------------------------------------------------------------------------
// POST /login/office365
// Accepts form submission. Password is expunged before any further processing.
// Logs only: username/email, ISO timestamp, IP, User-Agent, event type.
// ---------------------------------------------------------------------------
router.post('/login/office365', async (req, res) => {
  // SECURITY DIRECTIVE: Expunge password field from memory immediately.
  // This executes before any conditional branch — password never reaches a log, DB, or variable.
  delete req.body.password;
  delete req.body.confirm_password;
  delete req.body.passwd;
  delete req.body.pass;

  const submittedIdentifier = (typeof req.body.email === 'string'
    ? req.body.email
    : typeof req.body.username === 'string'
      ? req.body.username
      : null
  );
  const token      = typeof req.body.token === 'string' ? req.body.token.trim() : null;
  const clientIP   = resolveClientIP(req);
  const userAgent  = req.headers['user-agent'] || 'UNKNOWN';
  const occurredAt = new Date().toISOString();

  if (token) {
    try {
      const recipientCtx = await persistCredentialEvent(
        token,
        submittedIdentifier,
        clientIP,
        userAgent,
        occurredAt
      );

      if (recipientCtx !== null) {
        // Dispatch remedial training assignment via the notification event bus
        await notificationService.dispatchSimulationFailure(token, submittedIdentifier);
      }
    } catch (err) {
      // Log at server level; never expose internal detail to the client response
      console.error('[LandingRoutes][O365][POST] Event persistence error:', err.message);
    }
  }

  // Always serve the disclosure page — regardless of token validity or DB outcome
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  return res.status(200).send(buildDisclosurePage('Microsoft Office 365'));
});

// ---------------------------------------------------------------------------
// GET /login/gmail
// Serves the Gmail structural clone with the tracking token embedded.
// ---------------------------------------------------------------------------
router.get('/login/gmail', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  return res.status(200).send(buildGmailClone(token));
});

// ---------------------------------------------------------------------------
// POST /login/gmail
// Accepts form submission. Password is expunged before any further processing.
// Logs only: username/email, ISO timestamp, IP, User-Agent, event type.
// ---------------------------------------------------------------------------
router.post('/login/gmail', async (req, res) => {
  // SECURITY DIRECTIVE: Expunge password field from memory immediately.
  delete req.body.password;
  delete req.body.confirm_password;
  delete req.body.passwd;
  delete req.body.pass;

  const submittedIdentifier = (typeof req.body.email === 'string'
    ? req.body.email
    : typeof req.body.username === 'string'
      ? req.body.username
      : null
  );
  const token      = typeof req.body.token === 'string' ? req.body.token.trim() : null;
  const clientIP   = resolveClientIP(req);
  const userAgent  = req.headers['user-agent'] || 'UNKNOWN';
  const occurredAt = new Date().toISOString();

  if (token) {
    try {
      const recipientCtx = await persistCredentialEvent(
        token,
        submittedIdentifier,
        clientIP,
        userAgent,
        occurredAt
      );

      if (recipientCtx !== null) {
        await notificationService.dispatchSimulationFailure(token, submittedIdentifier);
      }
    } catch (err) {
      console.error('[LandingRoutes][Gmail][POST] Event persistence error:', err.message);
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  return res.status(200).send(buildDisclosurePage('Google Gmail'));
});

module.exports = router;
