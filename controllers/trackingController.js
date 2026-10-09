'use strict';

const pool = require('../config/db');
const logAction = require('../utils/auditLogger');
const { recalculateEmployeeRisk } = require('../utils/riskEngine');

const getRecipientContext = async (token) => {
  const [rows] = await pool.execute(
    `SELECT cr.id AS recipient_id, cr.employee_id, cr.campaign_id, cr.tracking_token,
            e.name AS employee_name, e.email AS employee_email, e.department,
            c.name AS campaign_name, c.template_id, c.landing_page_id,
            lp.slug AS landing_slug,
            et.subject AS email_subject, et.body_html AS email_body
     FROM CampaignRecipients cr
     INNER JOIN Employees e ON e.id = cr.employee_id
     INNER JOIN Campaigns c ON c.id = cr.campaign_id
     LEFT JOIN LandingPages lp ON lp.id = c.landing_page_id
     LEFT JOIN EmailTemplates et ON et.id = c.template_id
     WHERE cr.tracking_token = ?
     LIMIT 1`,
    [token]
  );

  return rows.length > 0 ? rows[0] : null;
};

async function recordOpenEventIfNeeded(data, ip, userAgent, method = 'pixel') {
  if (!data || !data.recipient_id) return null;

  // Record 'Opened' event in EmailEvents if not already recorded within the last 5 seconds
  const [existingOpen] = await pool.execute(
    "SELECT id FROM EmailEvents WHERE recipient_id = ? AND event_type = 'Opened' LIMIT 1",
    [data.recipient_id]
  );

  if (existingOpen.length === 0) {
    await pool.execute(
      'INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
      [data.recipient_id, 'Opened', ip, userAgent]
    );
  }

  // Always recalculate risk so 'Perfect (0% Risk)' immediately becomes 'Low (15% Risk)'
  const newRisk = await recalculateEmployeeRisk(data.employee_id);

  if (existingOpen.length === 0) {
    await logAction(
      null,
      'EMAIL_OPENED',
      {
        campaignId: data.campaign_id,
        campaignName: data.campaign_name,
        employeeId: data.employee_id,
        employeeEmail: data.employee_email,
        detectionMethod: method,
        newRiskLevel: newRisk || 'Low (15% Risk)',
      },
      ip,
      { actorEmail: data.employee_email, role: 'Employee' }
    );
  }

  return newRisk;
}

// GET /api/track/open/:token
// Serves 1x1 transparent GIF & logs 'Opened' -> 'Low (15% Risk)'
exports.trackOpen = async (req, res) => {
  const { token } = req.params;
  const method = req.query.m || 'pixel';
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const userAgent = req.get('User-Agent') || 'Unknown';

  try {
    const data = await getRecipientContext(token);
    if (data) {
      await recordOpenEventIfNeeded(data, ip, userAgent, method);
    }
  } catch (err) {
    console.error('[TrackOpen] Error recording open event:', err.message);
  } finally {
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
      'base64'
    );
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
    });
    res.end(pixel);
  }
};

// GET /api/track/view/:token
// "View Email in Browser" mirror endpoint — works 100% locally even if Gmail blocks localhost images!
exports.trackViewInBrowser = async (req, res) => {
  const { token } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const userAgent = req.get('User-Agent') || 'Unknown';

  try {
    const data = await getRecipientContext(token);
    if (!data) {
      return res.status(404).send('<h3>Simulation message not found or expired.</h3>');
    }

    await recordOpenEventIfNeeded(data, ip, userAgent, 'browser_view');

    const baseUrl = process.env.PUBLIC_TUNNEL_URL || process.env.BASE_URL || 'http://localhost:3000';
    const clickUrl = `${baseUrl}/api/track/click/${encodeURIComponent(token)}`;

    let renderedBody = data.email_body || '<p>Please verify your corporate account.</p>';
    renderedBody = renderedBody
      .replace(/\{\{\s*name\s*\}\}/gi, data.employee_name || 'Employee')
      .replace(/\{\{\s*email\s*\}\}/gi, data.employee_email || '')
      .replace(/\{\{\s*department\s*\}\}/gi, data.department || 'General')
      .replace(/\{\{\s*tracking_url\s*\}\}/gi, clickUrl)
      .replace(/\{\{\s*link\s*\}\}/gi, clickUrl);

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${data.email_subject || 'Corporate Notification'}</title>
      </head>
      <body style="background:#f1f5f9;font-family:Inter,Segoe UI,Arial,sans-serif;padding:32px;margin:0;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.05);">
          <div style="background:#0f172a;color:#94a3b8;padding:10px 20px;font-size:12px;display:flex;justify-content:space-between;">
            <span>🔒 Secure Webmail Viewer — Recipient: <strong style="color:#fff;">${data.employee_email}</strong></span>
            <span>Status: Verified Delivery</span>
          </div>
          <div style="padding:28px;">
            ${renderedBody}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[TrackViewInBrowser] Error:', err.message);
    return res.status(500).send('Error rendering message preview.');
  }
};

// GET /api/track/click/:token
// Triggered when employee clicks phishing link -> Logs 'Opened' (if missing) + 'Clicked' -> 'High (40% Risk)'
exports.trackClick = async (req, res) => {
  const { token } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const userAgent = req.get('User-Agent') || 'Unknown';

  let destination = `/landing-page?token=${encodeURIComponent(token)}`;

  try {
    const data = await getRecipientContext(token);
    if (data?.recipient_id) {
      // Ensure 'Opened' is logged first if their email client blocked images
      await recordOpenEventIfNeeded(data, ip, userAgent, 'implicit_on_click');

      await pool.execute(
        'INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [data.recipient_id, 'Clicked', ip, userAgent]
      );

      const newRisk = await recalculateEmployeeRisk(data.employee_id);

      await logAction(
        null,
        'LINK_CLICKED',
        {
          campaignId: data.campaign_id,
          campaignName: data.campaign_name,
          employeeId: data.employee_id,
          employeeEmail: data.employee_email,
          landingSlug: data.landing_slug || 'default',
          newRiskLevel: newRisk || 'High (40% Risk)',
        },
        ip,
        { actorEmail: data.employee_email, role: 'Employee' }
      );

      if (data.landing_slug) {
        destination = `/login/${data.landing_slug}?token=${encodeURIComponent(token)}`;
      }
    }
  } catch (err) {
    console.error('[TrackClick] Error recording click event:', err.message);
  }

  return res.redirect(destination);
};