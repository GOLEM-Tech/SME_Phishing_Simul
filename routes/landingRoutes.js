'use strict';

const express = require('express');
const pool = require('../config/db');

const router = express.Router();

function resolveClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'UNKNOWN';
}

function escapeHTML(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

async function persistCredentialEvent(token, clientIP, userAgent) {
  const [recipients] = await pool.execute(
    'SELECT id, campaign_id, employee_id FROM CampaignRecipients WHERE tracking_token = ? LIMIT 1',
    [token]
  );

  if (recipients.length === 0) return null;

  const recipient = recipients[0];

  // Insert 'Submitted' event into EmailEvents
  await pool.execute(
    "INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, 'Submitted', ?, ?)",
    [recipient.id, clientIP, userAgent]
  );

  // Escalate employee risk to 'High'
  await pool.execute(
    "UPDATE Employees SET risk_level = 'High' WHERE id = ?",
    [recipient.employee_id]
  );

  return recipient;
}

function buildOffice365Clone(token) {
  const safeToken = escapeHTML(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sign in to your account</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f3f2f1; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; width: 420px; padding: 40px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
    h1 { font-size: 1.5rem; margin-bottom: 20px; color: #1b1b1b; }
    .field { width: 100%; height: 38px; border: 1px solid #8a8886; margin-bottom: 15px; padding: 0 10px; box-sizing: border-box; }
    .btn { background: #0067b8; color: #fff; border: none; padding: 10px 24px; cursor: pointer; float: right; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign In</h1>
    <p>to continue to Microsoft Office 365</p>
    <form method="POST" action="/login/office365">
      <input type="hidden" name="token" value="${safeToken}" />
      <input class="field" type="email" name="email" placeholder="Email, phone, or Skype" required />
      <input class="field" type="password" name="password" placeholder="Password" required />
      <button type="submit" class="btn">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

function buildGmailClone(token) {
  const safeToken = escapeHTML(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sign in – Google Accounts</title>
  <style>
    body { font-family: Roboto, Arial, sans-serif; background: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { border: 1px solid #dadce0; border-radius: 8px; width: 400px; padding: 40px; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 20px; color: #202124; }
    .field { width: 100%; height: 42px; border: 1px solid #dadce0; border-radius: 4px; margin-bottom: 18px; padding: 0 12px; box-sizing: border-box; }
    .btn { background: #1a73e8; color: #fff; border: none; border-radius: 4px; padding: 10px 24px; cursor: pointer; float: right; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Google Sign in</h1>
    <form method="POST" action="/login/gmail">
      <input type="hidden" name="token" value="${safeToken}" />
      <input class="field" type="email" name="email" placeholder="Email or phone" required />
      <input class="field" type="password" name="password" placeholder="Enter your password" required />
      <button type="submit" class="btn">Next</button>
    </form>
  </div>
</body>
</html>`;
}

function buildDisclosurePage(platformLabel) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Security Awareness Alert</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #1e293b; border: 2px solid #f59e0b; border-radius: 8px; max-width: 540px; padding: 36px; text-align: center; }
    h1 { color: #f59e0b; margin-bottom: 12px; }
    p { color: #94a3b8; line-height: 1.6; }
    .alert-badge { background: rgba(245,158,11,0.2); color: #f59e0b; padding: 4px 12px; border-radius: 12px; font-weight: bold; font-size: 0.8rem; display: inline-block; margin-bottom: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="alert-badge">PHISHING SIMULATION EXERCISE</div>
    <h1>Simulated Attack Alert</h1>
    <p>The <strong>${escapeHTML(platformLabel)}</strong> portal you just interacted with was a controlled simulation run by IT Security.</p>
    <p style="color:#ffffff; font-weight:bold;">Your password was not saved or stored.</p>
    <p>Your failure has been logged and remedial security awareness training has been assigned.</p>
  </div>
</body>
</html>`;
}

// GET clone routes
router.get('/login/office365', (req, res) => {
  res.send(buildOffice365Clone(req.query.token));
});

router.get('/login/gmail', (req, res) => {
  res.send(buildGmailClone(req.query.token));
});

// POST interception handlers
router.post(['/login/office365', '/login/gmail'], async (req, res) => {
  // Defensive guard: Ensure req.body is an object before attempting deletions
  if (!req.body || typeof req.body !== 'object') {
    req.body = {};
  }

  // SECURITY REQUIREMENT: Expunge password immediately from memory
  delete req.body.password;
  delete req.body.confirm_password;
  delete req.body.passwd;
  delete req.body.pass;

  const token = typeof req.body.token === 'string' ? req.body.token.trim() : null;
  const clientIP = resolveClientIP(req);
  const userAgent = req.headers['user-agent'] || 'UNKNOWN';

  if (token) {
    try {
      await persistCredentialEvent(token, clientIP, userAgent);
    } catch (err) {
      console.error('[LandingInterception] Failed to record event:', err.message);
    }
  }

  const platform = req.path.includes('gmail') ? 'Google Gmail' : 'Microsoft Office 365';
  return res.status(200).send(buildDisclosurePage(platform));
});

module.exports = router;