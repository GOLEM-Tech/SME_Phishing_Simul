'use strict';

const express = require('express');
const pool = require('../config/db');
const logAction = require('../utils/auditLogger');
const { recalculateEmployeeRisk } = require('../utils/riskEngine');

const router = express.Router();

function resolveClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
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

async function persistCredentialEvent(token, clientIP, userAgent, landingSlug = 'office365') {
  if (!token) return null;

  const [recipients] = await pool.execute(
    `SELECT cr.id, cr.campaign_id, cr.employee_id,
            e.name AS employee_name, e.email AS employee_email, e.department,
            c.name AS campaign_name
     FROM CampaignRecipients cr
     INNER JOIN Employees e ON e.id = cr.employee_id
     INNER JOIN Campaigns c ON c.id = cr.campaign_id
     WHERE cr.tracking_token = ?
     LIMIT 1`,
    [token]
  );

  if (recipients.length === 0) return null;

  const recipient = recipients[0];

  await pool.execute(
    "INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, 'Submitted', ?, ?)",
    [recipient.id, clientIP, userAgent]
  );

  const newRisk = await recalculateEmployeeRisk(recipient.employee_id);

  await logAction(
    null,
    'CREDENTIALS_SUBMITTED',
    {
      campaignId: recipient.campaign_id,
      campaignName: recipient.campaign_name,
      employeeId: recipient.employee_id,
      employeeEmail: recipient.employee_email,
      department: recipient.department,
      landingSlug,
      newRiskLevel: newRisk || 'CRITICAL VERY HIGH (100% Risk)',
    },
    clientIP,
    { actorEmail: recipient.employee_email, role: 'Employee' }
  );

  return recipient;
}

// ----------------------------------------------------------------------------
// CLONE 1: MICROSOFT OFFICE 365
// ----------------------------------------------------------------------------
function renderOffice365(token) {
  const safeToken = escapeHTML(token || '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>Sign in to your account</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #e9ecef; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; width: 420px; padding: 40px; box-shadow: 0 4px 14px rgba(0,0,0,0.1); border-radius: 4px; }
    .logo { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; font-size: 20px; font-weight: 600; color: #505050; }
    .grid { display: grid; grid-template-columns: 9px 9px; gap: 2px; }
    .grid span { width: 9px; height: 9px; display: block; }
    h1 { font-size: 24px; margin: 0 0 12px; color: #1b1b1b; }
    input { width: 100%; border: none; border-bottom: 1px solid #666; padding: 8px 0; margin-bottom: 20px; font-size: 15px; outline: none; }
    input:focus { border-bottom: 2px solid #0067b8; }
    button { background: #0067b8; color: #fff; border: none; min-width: 108px; padding: 8px 24px; font-size: 15px; cursor: pointer; float: right; }
    button:hover { background: #005da6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="grid"><span style="background:#f25022"></span><span style="background:#7fba00"></span><span style="background:#00a4ef"></span><span style="background:#ffb900"></span></div>
      <span>Microsoft</span>
    </div>
    <h1>Sign in</h1>
    <form method="POST" action="/login/office365">
      <input type="hidden" name="token" value="${safeToken}" />
      <input type="email" name="email" placeholder="Email, phone, or Skype" required />
      <input type="password" name="password" placeholder="Password" required />
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// CLONE 2: GOOGLE WORKSPACE
// ----------------------------------------------------------------------------
function renderGoogle(token) {
  const safeToken = escapeHTML(token || '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>Sign in – Google Accounts</title>
  <style>
    body { font-family: 'Roboto', Arial, sans-serif; background: #f0f4f9; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 24px; width: 440px; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); text-align: center; }
    h1 { font-size: 24px; color: #1f1f1f; margin: 16px 0 8px; font-weight: 500; }
    p { font-size: 14px; color: #444746; margin: 0 0 28px; }
    input { width: 100%; height: 50px; border: 1px solid #747775; border-radius: 4px; padding: 0 14px; font-size: 15px; box-sizing: border-box; margin-bottom: 16px; outline: none; }
    input:focus { border: 2px solid #0b57d0; }
    button { background: #0b57d0; color: #fff; border: none; border-radius: 20px; padding: 10px 24px; cursor: pointer; font-size: 14px; font-weight: 500; float: right; margin-top: 10px; }
    button:hover { background: #0842a0; }
  </style>
</head>
<body>
  <div class="card">
    <svg width="40" height="40" viewBox="0 0 24 24" style="margin:auto">
      <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"/>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"/>
      <path fill="#FBBC05" d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"/>
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 20.9 7.4 24 12 24z"/>
    </svg>
    <h1>Sign in</h1>
    <p>to continue to Google Workspace</p>
    <form method="POST" action="/login/google">
      <input type="hidden" name="token" value="${safeToken}" />
      <input type="email" name="email" placeholder="Email or phone" required />
      <input type="password" name="password" placeholder="Enter your password" required />
      <button type="submit">Next</button>
    </form>
  </div>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// CLONE 3: AXIS BANK NETBANKING
// ----------------------------------------------------------------------------
function renderAxisBank(token) {
  const safeToken = escapeHTML(token || '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>Axis Bank Internet Banking</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f5f7; margin: 0; }
    .header { background: #97144d; color: #fff; padding: 16px 36px; font-size: 20px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
    .box { width: 420px; margin: 50px auto; background: #fff; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-top: 4px solid #97144d; padding: 32px; box-sizing: border-box; }
    h2 { font-size: 18px; color: #97144d; margin-top: 0; }
    label { font-size: 12px; color: #555; display: block; margin: 12px 0 4px; font-weight: bold; }
    input { width: 100%; height: 38px; border: 1px solid #ccc; border-radius: 4px; padding: 0 10px; box-sizing: border-box; }
    button { width: 100%; background: #97144d; color: #fff; border: none; height: 42px; border-radius: 4px; font-size: 15px; font-weight: bold; margin-top: 20px; cursor: pointer; }
    button:hover { background: #7a0e3c; }
  </style>
</head>
<body>
  <div class="header">
    <span>AXIS BANK</span>
    <span style="font-size:12px;font-weight:normal;">256-Bit Encrypted Portal</span>
  </div>
  <div class="box">
    <h2>Internet Banking Login</h2>
    <form method="POST" action="/login/axisbank">
      <input type="hidden" name="token" value="${safeToken}" />
      <label>Login ID / Customer ID</label>
      <input type="text" name="email" placeholder="Customer ID or registered email" required />
      <label>Password / MPIN</label>
      <input type="password" name="password" placeholder="••••••••" required />
      <button type="submit">Proceed to Secure Login</button>
    </form>
  </div>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// CLONE 4: JIO 5G SIM E-KYC
// ----------------------------------------------------------------------------
function renderJio(token) {
  const safeToken = escapeHTML(token || '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>MyJio 5G e-KYC Verification</title>
  <style>
    body { font-family: sans-serif; background: linear-gradient(135deg, #0a2885, #0f3cc9); min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .card { background: #fff; width: 400px; padding: 32px; border-radius: 20px; text-align: center; box-shadow: 0 12px 30px rgba(0,0,0,0.3); }
    .badge { width: 56px; height: 56px; background: #0f3cc9; color: #fff; border-radius: 50%; font-size: 22px; font-weight: bold; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
    .warn { background: #fee2e2; color: #dc2626; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 20px; display: inline-block; margin-bottom: 8px; }
    h2 { font-size: 18px; margin: 8px 0; color: #111; }
    input { width: 100%; height: 42px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 12px; margin-bottom: 12px; box-sizing: border-box; }
    button { width: 100%; height: 44px; background: #0f3cc9; color: #fff; border: none; border-radius: 22px; font-size: 15px; font-weight: bold; cursor: pointer; }
    button:hover { background: #0a2885; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Jio</div>
    <div class="warn">MANDATORY TRAI E-KYC</div>
    <h2>Jio True 5G SIM Verification</h2>
    <form method="POST" action="/login/jio">
      <input type="hidden" name="token" value="${safeToken}" />
      <input type="text" name="phone" placeholder="10-digit Jio Number" required />
      <input type="email" name="email" placeholder="Registered Corporate Email" required />
      <input type="password" name="password" placeholder="Account PIN or Password" required />
      <button type="submit">Verify Now</button>
    </form>
  </div>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// CLONE 5: MRBREAST YOUTUBE COLLAB
// ----------------------------------------------------------------------------
function renderMrBreast(token) {
  const safeToken = escapeHTML(token || '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>MrBreast Video Shoot Invitation</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #0b0f19; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .card { background: #131b2e; border: 2px solid #00d2ff; width: 440px; padding: 32px; border-radius: 16px; text-align: center; box-shadow: 0 0 25px rgba(0,210,255,0.2); }
    .banner { background: linear-gradient(90deg, #00d2ff, #ff007f); padding: 8px 16px; border-radius: 8px; font-weight: 800; font-size: 16px; display: inline-block; margin-bottom: 12px; }
    input { width: 100%; height: 42px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 0 12px; color: #fff; margin-bottom: 12px; box-sizing: border-box; }
    button { width: 100%; height: 46px; background: linear-gradient(90deg, #00d2ff, #ff007f); color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div class="banner">⚡ MRBREAST PRODUCTIONS ⚡</div>
    <h2>Claim Your Challenge Spot ($50,000)</h2>
    <form method="POST" action="/login/mrbreast">
      <input type="hidden" name="token" value="${safeToken}" />
      <input type="email" name="email" placeholder="YouTube / Google Account Email" required />
      <input type="password" name="password" placeholder="Account Password" required />
      <button type="submit">Verify Channel Ownership</button>
    </form>
  </div>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// DISCLOSURE PAGE RENDERER
// ----------------------------------------------------------------------------
function buildDisclosurePage(platformLabel, slug = 'office365') {
  let quote = 'Always inspect the actual sender address behind a display name mask before entering your SSO credentials.';
  let tip = 'Verify the authentic host domain before submitting corporate authentication records.';

  if (slug.includes('mrbreast')) {
    quote = 'If you notice mistakes in the UI, or if the offer looks extremely AI-generated or too good to be true, it might be a phishing attack. You will never be asked to submit account passwords by any authority or creator over email.';
    tip = 'Legitimate media agencies will never demand personal credentials for promotions.';
  } else if (slug.includes('axis') || slug.includes('bank')) {
    quote = 'Banks and financial institutions will never ask for your NetBanking password, MPIN, or OTP via an email link.';
    tip = 'Navigate directly to your bank bookmark rather than clicking email links.';
  } else if (slug.includes('jio') || slug.includes('sim')) {
    quote = 'Telecom providers never deactivate corporate SIM cards via third-party web forms asking for your account PIN.';
    tip = 'Contact your organizational telecom administrator to resolve carrier alerts.';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>Security Drill Alert</title>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 20px; }
    .card { background: #1e293b; border: 2px solid #ef4444; border-radius: 16px; max-width: 580px; padding: 36px; text-align: center; }
    .badge { background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid #ef4444; padding: 4px 14px; border-radius: 20px; font-weight: bold; font-size: 12px; display: inline-block; margin-bottom: 12px; }
    .quote { background: #0f172a; border-left: 4px solid #38bdf8; padding: 14px; text-align: left; font-style: italic; margin: 18px 0; border-radius: 6px; font-size: 14px; color: #cbd5e1; }
    .btn { display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">SIMULATED PHISHING ATTACK DETECTED</div>
    <h1 style="color:#ef4444;font-size:24px;margin:0 0 10px;">Security Awareness Exercise</h1>
    <p>You submitted credentials on a simulated <strong>${escapeHTML(platformLabel)}</strong> portal run by <strong>SME_Phishing_Simulator</strong>.</p>
    <div class="quote">"${escapeHTML(quote)}"<br/><br/><span style="font-style:normal;font-size:12px;color:#38bdf8;">💡 ${escapeHTML(tip)}</span></div>
    <p style="font-size:13px;color:#94a3b8;">🔒 <strong>Zero-Credential Guarantee:</strong> Plaintext passwords, MPINs, and PINs were immediately expunged from memory and never saved to the database.</p>
    <a class="btn" href="/employee">Go to Employee Training Portal &rarr;</a>
  </div>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// GET ROUTES (Matches all variations of clone URLs)
// ----------------------------------------------------------------------------
router.get(['/landing-page', '/login/office365'], (req, res) => res.send(renderOffice365(req.query.token)));
router.get(['/login/google', '/login/gmail'], (req, res) => res.send(renderGoogle(req.query.token)));
router.get(['/login/axisbank', '/login/axis-bank'], (req, res) => res.send(renderAxisBank(req.query.token)));
router.get(['/login/jio', '/login/jio-5g'], (req, res) => res.send(renderJio(req.query.token)));
router.get('/login/mrbreast', (req, res) => res.send(renderMrBreast(req.query.token)));

// ----------------------------------------------------------------------------
// POST INTERCEPTION HANDLER
// ----------------------------------------------------------------------------
router.post(
  [
    '/landing-page',
    '/login/office365',
    '/login/google',
    '/login/gmail',
    '/login/axisbank',
    '/login/axis-bank',
    '/login/jio',
    '/login/jio-5g',
    '/login/mrbreast',
  ],
  async (req, res) => {
    if (!req.body || typeof req.body !== 'object') req.body = {};

    delete req.body.password;
    delete req.body.confirm_password;
    delete req.body.pin;
    delete req.body.mpin;

    const token = typeof req.body.token === 'string' ? req.body.token.trim() : null;
    const clientIP = resolveClientIP(req);
    const userAgent = req.headers['user-agent'] || 'UNKNOWN';

    const p = req.path.toLowerCase();
    let slug = 'office365';
    let label = 'Microsoft Office 365';

    if (p.includes('google') || p.includes('gmail')) {
      slug = 'google';
      label = 'Google Workspace';
    } else if (p.includes('axis')) {
      slug = 'axisbank';
      label = 'Axis Bank NetBanking';
    } else if (p.includes('jio')) {
      slug = 'jio';
      label = 'Jio 5G SIM e-KYC';
    } else if (p.includes('mrbreast')) {
      slug = 'mrbreast';
      label = 'MrBreast YouTube Collab';
    }

    if (token) {
      try {
        await persistCredentialEvent(token, clientIP, userAgent, slug);
      } catch (err) {
        console.error('[LandingInterception Error]:', err.message);
      }
    }

    return res.status(200).send(buildDisclosurePage(label, slug));
  }
);

module.exports = router;