'use strict';

const express = require('express');
const pool = require('../config/db');
const { recalculateEmployeeRisk } = require('../utils/riskEngine');

const router = express.Router();

// Auto-seed all 5 Landing Pages into MySQL on startup so foreign keys 1..5 always exist
(async function seedLandingPages() {
  const pages = [
    [1, 'Microsoft Office 365 Login Clone', 'office365', '<h2>Sign in to Microsoft 365</h2>'],
    [2, 'Google Workspace Sign-In Clone', 'gmail', '<h2>Sign in with Google</h2>'],
    [3, 'Axis Bank NetBanking Portal Clone', 'axisbank', '<h2>Axis Bank Internet Banking</h2>'],
    [4, 'Jio 5G SIM e-KYC Activation Clone', 'jio', '<h2>Jio 5G SIM Verification</h2>'],
    [5, 'MrBreast YouTube Collab Invitation Clone', 'mrbreast', '<h2>MrBreast Creator Collab Portal</h2>']
  ];

  try {
    for (const [id, name, slug, html] of pages) {
      await pool.execute(
        `INSERT INTO LandingPages (id, name, slug, html_content)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), slug = VALUES(slug)`,
        [id, name, slug, html]
      );
    }
  } catch (err) {
    console.warn('[LandingPages Auto-Seed Notice]:', err.message);
  }
})();

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

async function persistCredentialEvent(token, clientIP, userAgent) {
  const [recipients] = await pool.execute(
    'SELECT id, campaign_id, employee_id FROM CampaignRecipients WHERE tracking_token = ? LIMIT 1',
    [token]
  );

  if (recipients.length === 0) return null;

  const recipient = recipients[0];

  // Record 'Submitted' interaction event
  await pool.execute(
    "INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, 'Submitted', ?, ?)",
    [recipient.id, clientIP, userAgent]
  );

  // Escalate employee risk to 'CRITICAL VERY HIGH (100% Risk)'
  await recalculateEmployeeRisk(recipient.employee_id);

  return recipient;
}

// ============================================================================
// 1. MICROSOFT OFFICE 365 CLONE (/login/office365)
// ============================================================================
function buildOffice365Clone(token) {
  const safeToken = escapeHTML(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sign in to your account</title>
  <style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background: linear-gradient(135deg, #f3f2f1 0%, #e1dfdd 100%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #ffffff; width: 440px; padding: 44px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); box-sizing: border-box; }
    .ms-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; font-size: 21px; font-weight: 600; color: #5e5e5e; }
    .ms-grid { display: grid; grid-template-columns: 10px 10px; gap: 2px; }
    .ms-grid span { width: 10px; height: 10px; display: block; }
    h1 { font-size: 24px; font-weight: 600; margin: 0 0 8px; color: #1b1b1b; }
    p.sub { font-size: 13px; color: #1b1b1b; margin: 0 0 20px; }
    .field { width: 100%; height: 36px; border: none; border-bottom: 1px solid #666; margin-bottom: 20px; padding: 6px 2px; box-sizing: border-box; font-size: 15px; outline: none; }
    .field:focus { border-bottom: 2px solid #0067b8; }
    .links { font-size: 13px; color: #0067b8; text-decoration: none; display: block; margin-bottom: 24px; }
    .btn-row { display: flex; justify-content: flex-end; }
    .btn { background: #0067b8; color: #fff; border: none; min-width: 108px; height: 32px; cursor: pointer; font-size: 15px; font-weight: 500; }
    .btn:hover { background: #005da6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="ms-logo">
      <div class="ms-grid">
        <span style="background:#f25022"></span><span style="background:#7fba00"></span>
        <span style="background:#00a4ef"></span><span style="background:#ffb900"></span>
      </div>
      <span>Microsoft</span>
    </div>
    <h1>Sign in</h1>
    <p class="sub">to continue to Microsoft 365 &amp; Outlook</p>
    <form method="POST" action="/login/office365">
      <input type="hidden" name="token" value="${safeToken}" />
      <input class="field" type="email" name="email" placeholder="Email, phone, or Skype" required />
      <input class="field" type="password" name="password" placeholder="Password" required />
      <a class="links" href="#">Can't access your account?</a>
      <div class="btn-row">
        <button type="submit" class="btn">Sign in</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

// ============================================================================
// 2. GOOGLE WORKSPACE CLONE (/login/gmail)
// ============================================================================
function buildGmailClone(token) {
  const safeToken = escapeHTML(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sign in – Google Accounts</title>
  <style>
    body { font-family: 'Google Sans', Roboto, Arial, sans-serif; background: #f0f4f9; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 28px; width: 450px; padding: 48px 40px 36px; box-sizing: border-box; box-shadow: 0 4px 12px rgba(0,0,0,0.05); text-align: center; }
    h1 { font-size: 24px; font-weight: 400; margin: 16px 0 8px; color: #1f1f1f; }
    p.sub { font-size: 16px; color: #444746; margin: 0 0 32px; }
    .field { width: 100%; height: 54px; border: 1px solid #747775; border-radius: 4px; margin-bottom: 16px; padding: 0 16px; box-sizing: border-box; font-size: 16px; outline: none; }
    .field:focus { border: 2px solid #0b57d0; }
    .footer-row { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; }
    .link { color: #0b57d0; font-size: 14px; font-weight: 500; text-decoration: none; }
    .btn { background: #0b57d0; color: #fff; border: none; border-radius: 20px; padding: 10px 24px; cursor: pointer; font-weight: 500; font-size: 14px; }
    .btn:hover { background: #0842a0; }
  </style>
</head>
<body>
  <div class="card">
    <svg width="48" height="48" viewBox="0 0 24 24" style="margin:0 auto">
      <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"/>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"/>
      <path fill="#FBBC05" d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"/>
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 20.9 7.4 24 12 24z"/>
    </svg>
    <h1>Sign in</h1>
    <p class="sub">Use your Google Workspace Account</p>
    <form method="POST" action="/login/gmail">
      <input type="hidden" name="token" value="${safeToken}" />
      <input class="field" type="email" name="email" placeholder="Email or phone" required />
      <input class="field" type="password" name="password" placeholder="Enter your password" required />
      <div class="footer-row">
        <a class="link" href="#">Forgot password?</a>
        <button type="submit" class="btn">Next</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

// ============================================================================
// 3. AXIS BANK INTERNET BANKING CLONE (/login/axisbank)
// ============================================================================
function buildAxisBankClone(token) {
  const safeToken = escapeHTML(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Axis Bank Internet Banking | Login</title>
  <style>
    body { font-family: 'Lato', 'Segoe UI', Arial, sans-serif; background: #f4f5f7; margin: 0; min-height: 100vh; display: flex; flex-direction: column; }
    .topbar { background: #97144d; color: #fff; padding: 16px 48px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(151,20,77,0.3); }
    .brand { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
    .brand-tri { width: 0; height: 0; border-left: 14px solid transparent; border-right: 14px solid transparent; border-bottom: 24px solid #fff; }
    .wrap { flex: 1; display: flex; justify-content: center; align-items: center; padding: 32px; }
    .card { background: #fff; width: 430px; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); overflow: hidden; border-top: 5px solid #97144d; }
    .tabs { display: flex; background: #fdf2f6; border-bottom: 1px solid #ebd0dc; font-size: 14px; font-weight: 600; color: #97144d; }
    .tab { flex: 1; text-align: center; padding: 14px; border-bottom: 3px solid #97144d; }
    .body { padding: 32px; }
    label { display: block; font-size: 13px; color: #4a5568; font-weight: 600; margin-bottom: 6px; }
    .field { width: 100%; height: 42px; border: 1px solid #cbd5e0; border-radius: 6px; padding: 0 12px; margin-bottom: 18px; box-sizing: border-box; font-size: 14px; }
    .field:focus { border-color: #97144d; outline: none; }
    .btn { width: 100%; background: #97144d; color: #fff; border: none; height: 44px; border-radius: 6px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 6px; }
    .btn:hover { background: #7c0f3e; }
    .sec-note { margin-top: 18px; font-size: 12px; color: #718096; text-align: center; }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand"><div class="brand-tri"></div><span>AXIS BANK</span></div>
    <span style="font-size:13px; opacity:0.9;">256-Bit SSL Secured NetBanking</span>
  </header>
  <div class="wrap">
    <div class="card">
      <div class="tabs"><div class="tab">Login with Customer ID / PAN Verification</div></div>
      <div class="body">
        <form method="POST" action="/login/axisbank">
          <input type="hidden" name="token" value="${safeToken}" />
          <label>Customer ID / Registered Email</label>
          <input class="field" type="text" name="email" placeholder="Enter 9-digit Customer ID or Email" required />
          <label>Internet Banking Password / MPIN</label>
          <input class="field" type="password" name="password" placeholder="Enter Password / 6-digit MPIN" required />
          <label>Registered Mobile Number (For KYC Sync)</label>
          <input class="field" type="text" name="phone" placeholder="+91 98XXXXXXXX" required />
          <button type="submit" class="btn">Proceed to Secure Login</button>
        </form>
        <div class="sec-note">Mandatory RBI KYC Re-verification Portal</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================================
// 4. JIO 5G SIM CARD ACTIVATION / E-KYC CLONE (/login/jio)
// ============================================================================
function buildJioClone(token) {
  const safeToken = escapeHTML(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MyJio 5G e-KYC | SIM Card Activation & Verification</title>
  <style>
    body { font-family: 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0a2885 0%, #0f3cc9 100%); margin: 0; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
    .card { background: #fff; width: 430px; border-radius: 24px; padding: 36px; box-shadow: 0 16px 36px rgba(0,0,0,0.3); box-sizing: border-box; text-align: center; }
    .jio-badge { width: 64px; height: 64px; background: #0f3cc9; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; margin: 0 auto 16px; letter-spacing: -0.5px; box-shadow: 0 4px 12px rgba(15,60,201,0.4); }
    .tag { background: #fee2e2; color: #dc2626; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 99px; display: inline-block; margin-bottom: 10px; }
    h1 { font-size: 21px; color: #111827; margin: 0 0 8px; font-weight: 800; }
    p { font-size: 13.5px; color: #4b5563; margin: 0 0 24px; line-height: 1.5; }
    label { display: block; text-align: left; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 6px; }
    .field { width: 100%; height: 44px; border: 1.5px solid #d1d5db; border-radius: 12px; padding: 0 14px; margin-bottom: 16px; box-sizing: border-box; font-size: 14px; }
    .field:focus { border-color: #0f3cc9; outline: none; }
    .btn { width: 100%; height: 46px; background: #0f3cc9; color: #fff; border: none; border-radius: 99px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(15,60,201,0.35); }
    .btn:hover { background: #0a2885; }
  </style>
</head>
<body>
  <div class="card">
    <div class="jio-badge">Jio</div>
    <div class="tag">URGENT SIM SUSPENSION WARNING</div>
    <h1>Jio True 5G e-KYC Activation</h1>
    <p>Your corporate Jio SIM card will be deactivated within <strong>24 hours</strong> due to pending TRAI e-KYC verification. Complete instant verification below:</p>
    <form method="POST" action="/login/jio">
      <input type="hidden" name="token" value="${safeToken}" />
      <label>10-Digit Jio Mobile Number</label>
      <input class="field" type="text" name="phone" placeholder="Enter 10-digit Jio Number" required />
      <label>Corporate Email ID</label>
      <input class="field" type="email" name="email" placeholder="employee@company.com" required />
      <label>MyJio Account PIN / SIM Verification Password</label>
      <input class="field" type="password" name="password" placeholder="Enter PIN or Password" required />
      <button type="submit" class="btn">Verify e-KYC &amp; Keep SIM Active</button>
    </form>
  </div>
</body>
</html>`;
}

// ============================================================================
// 5. MRBREAST YOUTUBE VIDEO INVITATION CLONE (/login/mrbreast)
// ============================================================================
function buildMrBreastClone(token) {
  const safeToken = escapeHTML(token);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MrBreast Official Creator Collab & $50,000 Challenge Invite</title>
  <style>
    body { font-family: 'Montserrat', 'Segoe UI', sans-serif; background: radial-gradient(circle at top, #1e1b4b 0%, #090d16 100%); color: #fff; margin: 0; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
    .card { background: #111827; border: 3px solid #00d2ff; border-radius: 24px; width: 460px; padding: 36px; box-shadow: 0 0 35px rgba(0,210,255,0.25); box-sizing: border-box; text-align: center; }
    .beast-banner { background: linear-gradient(90deg, #00d2ff 0%, #ff007f 100%); color: #fff; font-weight: 900; font-size: 22px; padding: 10px 18px; border-radius: 14px; display: inline-block; margin-bottom: 16px; letter-spacing: 1px; text-transform: uppercase; }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 10px; color: #f9fafb; }
    p { font-size: 13.5px; color: #9ca3af; margin: 0 0 22px; line-height: 1.5; }
    .prize-box { background: rgba(255,0,127,0.12); border: 1px dashed #ff007f; padding: 12px; border-radius: 12px; color: #f472b6; font-weight: 700; font-size: 13px; margin-bottom: 20px; }
    label { display: block; text-align: left; font-size: 12px; font-weight: 700; color: #d1d5db; margin-bottom: 6px; }
    .field { width: 100%; height: 42px; background: #1f2937; border: 1px solid #374151; border-radius: 10px; padding: 0 14px; color: #fff; margin-bottom: 14px; box-sizing: border-box; font-size: 14px; }
    .field:focus { border-color: #00d2ff; outline: none; }
    .btn { width: 100%; height: 48px; background: linear-gradient(90deg, #00d2ff 0%, #ff007f 100%); color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 900; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 6px; }
    .btn:hover { opacity: 0.92; }
  </style>
</head>
<body>
  <div class="card">
    <div class="beast-banner">⚡ MRBREAST PRODUCTIONS ⚡</div>
    <h1>You Are Invited to Our Next Main Channel Video!</h1>
    <p>Congratulations! Your email was randomly selected for the upcoming <strong>"Last To Leave Circle Wins $50,000"</strong> challenge shoot &amp; guaranteed $2,500 appearance bonus.</p>
    <div class="prize-box">🎁 Spot Reserved — Confirm Google / YouTube Account Within 15 Minutes</div>
    <form method="POST" action="/login/mrbreast">
      <input type="hidden" name="token" value="${safeToken}" />
      <label>YouTube / Google Account Email</label>
      <input class="field" type="email" name="email" placeholder="Enter your Google / Corporate Email" required />
      <label>Account Password (To Verify Channel Ownership)</label>
      <input class="field" type="password" name="password" placeholder="Enter your password" required />
      <label>Phone / Discord Tag (For Flight &amp; Production Team)</label>
      <input class="field" type="text" name="phone" placeholder="e.g. +91 98XXXXXX or user#1234" required />
      <button type="submit" class="btn">Claim My Video Spot &amp; Bonus →</button>
    </form>
  </div>
</body>
</html>`;
}

// ============================================================================
// EDUCATIONAL DISCLOSURE PAGE (SHOWN AFTER ANY CREDENTIAL/DATA SUBMISSION)
// ============================================================================
function buildDisclosurePage(platformLabel) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Security Awareness Alert</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #1e293b; border: 2px solid #ef4444; border-radius: 16px; max-width: 580px; padding: 40px; text-align: center; box-shadow: 0 12px 32px rgba(0,0,0,0.6); }
    h1 { color: #ef4444; margin-bottom: 14px; font-size: 1.7rem; }
    p { color: #cbd5e1; line-height: 1.6; font-size: 1rem; margin-bottom: 14px; }
    .alert-badge { background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.4); padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; display: inline-block; margin-bottom: 16px; }
    .portal-btn { display: inline-block; margin-top: 12px; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <div class="alert-badge">CRITICAL RISK EVENT — 100% COMPROMISE</div>
    <h1>Caught Lacking! This Was a Phishing Drill</h1>
    <p>The <strong>${escapeHTML(platformLabel)}</strong> page you just submitted data to was a controlled security simulation run by <strong>SME_Phishing_Simulator</strong>.</p>
    <p style="color: #fca5a5; font-weight: bold; background: #450a0a; border: 1px solid #dc2626; padding: 12px; border-radius: 8px;">
      Your Profile Risk Score has been escalated to: CRITICAL VERY HIGH (100% Risk)
    </p>
    <p style="color: #ffffff; font-weight: bold; background: #0f172a; padding: 12px; border-radius: 8px; font-size: 0.9rem;">
      Zero-Credential Storage Guarantee: Any password, PIN, or phone number you typed was immediately expunged from server memory and was NEVER stored.
    </p>
    <a class="portal-btn" href="/">Go to Employee Training Portal to Lower Risk Score →</a>
  </div>
</body>
</html>`;
}

// GET clone routes for all 5 landing pages
router.get(['/landing-page', '/login/office365'], (req, res) => {
  res.send(buildOffice365Clone(req.query.token));
});

router.get('/login/gmail', (req, res) => {
  res.send(buildGmailClone(req.query.token));
});

router.get('/login/axisbank', (req, res) => {
  res.send(buildAxisBankClone(req.query.token));
});

router.get('/login/jio', (req, res) => {
  res.send(buildJioClone(req.query.token));
});

router.get('/login/mrbreast', (req, res) => {
  res.send(buildMrBreastClone(req.query.token));
});

// POST interception handlers for all 5 clones
router.post(['/landing-page', '/login/office365', '/login/gmail', '/login/axisbank', '/login/jio', '/login/mrbreast'], async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    req.body = {};
  }

  // Immediately purge all sensitive fields from memory
  delete req.body.password;
  delete req.body.confirm_password;
  delete req.body.passwd;
  delete req.body.pass;
  delete req.body.pin;
  delete req.body.mpin;
  delete req.body.otp;
  delete req.body.phone;

  const token = typeof req.body.token === 'string' ? req.body.token.trim() : null;
  const clientIP = resolveClientIP(req);
  const userAgent = req.headers['user-agent'] || 'UNKNOWN';

  if (token) {
    try {
      await persistCredentialEvent(token, clientIP, userAgent);
    } catch (err) {
      console.error('[LandingInterception] Event record error:', err.message);
    }
  }

  const labelMap = {
    '/login/gmail': 'Google Workspace',
    '/login/axisbank': 'Axis Bank NetBanking',
    '/login/jio': 'Jio 5G SIM e-KYC Portal',
    '/login/mrbreast': 'MrBreast YouTube Collab Invitation',
    '/login/office365': 'Microsoft Office 365',
    '/landing-page': 'Microsoft Office 365'
  };

  const platform = labelMap[req.path] || 'Simulated Login Portal';
  return res.status(200).send(buildDisclosurePage(platform));
});

module.exports = router;