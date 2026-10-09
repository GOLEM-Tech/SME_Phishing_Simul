'use strict';

const crypto = require('crypto');
const pool = require('../config/db');
const sendEmail = require('../utils/mailer');

/**
 * Builds the complete phishing simulation HTML with 3-way Open Tracking:
 *  1. Top "View in Browser" link (/api/track/view/:token)
 *  2. Inline CSS background-image open beacon (/api/track/open/:token?m=css)
 *  3. Standard 1x1 transparent GIF pixel (/api/track/open/:token?m=img)
 */
function buildTrackedEmailHtml(rawHtml, recipient, token, baseUrl) {
  const cleanBase = (process.env.PUBLIC_TUNNEL_URL || baseUrl || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const cb = Date.now();

  const clickUrl = `${cleanBase}/api/track/click/${encodeURIComponent(token)}`;
  const openImgUrl = `${cleanBase}/api/track/open/${encodeURIComponent(token)}?cb=${cb}&m=img`;
  const openCssUrl = `${cleanBase}/api/track/open/${encodeURIComponent(token)}?cb=${cb}&m=css`;
  const viewInBrowserUrl = `${cleanBase}/api/track/view/${encodeURIComponent(token)}`;

  let processedHtml = String(rawHtml || '<p>Please review your account security notification.</p>');

  processedHtml = processedHtml
    .replace(/\{\{\s*name\s*\}\}/gi, recipient.name || 'Employee')
    .replace(/\{\{\s*EmployeeName\s*\}\}/gi, recipient.name || 'Employee')
    .replace(/\{\{\s*email\s*\}\}/gi, recipient.email || '')
    .replace(/\{\{\s*department\s*\}\}/gi, recipient.department || 'General')
    .replace(/\{\{\s*tracking_url\s*\}\}/gi, clickUrl)
    .replace(/\{\{\s*tracking_link\s*\}\}/gi, clickUrl)
    .replace(/\{\{\s*PhishingLink\s*\}\}/gi, clickUrl)
    .replace(/\{\{\s*link\s*\}\}/gi, clickUrl);

  if (!processedHtml.includes(clickUrl)) {
    processedHtml += `
      <div style="margin:24px 0;">
        <a href="${clickUrl}" style="background:#2563eb;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">
          Verify Account Activity
        </a>
      </div>
    `;
  }

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background-image:url('${openCssUrl}');background-repeat:no-repeat;background-position:-9999px -9999px;">
      <div style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:8px 14px;font-size:11px;color:#64748b;text-align:right;">
        Having trouble viewing this message or images blocked?
        <a href="${viewInBrowserUrl}" style="color:#2563eb;text-decoration:underline;font-weight:600;">View this email in your browser</a>
      </div>
      <div style="padding:16px 8px;">
        ${processedHtml}
      </div>
      <img src="${openImgUrl}" alt="" width="1" height="1" border="0" style="height:1px !important;width:1px !important;border-width:0 !important;margin:0 !important;padding:0 !important;opacity:0;" />
    </div>
  `;
}

/**
 * Dispatches a campaign to all target employees and logs 'Delivered' events.
 */
async function dispatchCampaignEmails(campaignId, options = {}) {
  // 1. Fetch Campaign and linked Template safely
  const [campRows] = await pool.execute(
    `SELECT c.*, et.subject, et.body_html, et.sender_name, et.sender_email, lp.slug AS landing_slug
     FROM Campaigns c
     LEFT JOIN EmailTemplates et ON et.id = c.template_id
     LEFT JOIN LandingPages lp ON lp.id = c.landing_page_id
     WHERE c.id = ? LIMIT 1`,
    [campaignId]
  );

  if (campRows.length === 0) {
    throw new Error(`Campaign #${campaignId} not found.`);
  }

  const campaign = campRows[0];

  // 2. Fetch Staged Recipients who have NOT been sent yet (sent_at IS NULL)
  let [recipients] = await pool.execute(
    `SELECT cr.id AS recipient_id, cr.tracking_token, cr.sent_at,
            e.id AS employee_id, e.name AS employee_name, e.email AS employee_email, e.department
     FROM CampaignRecipients cr
     INNER JOIN Employees e ON e.id = cr.employee_id
     WHERE cr.campaign_id = ? AND cr.sent_at IS NULL`,
    [campaignId]
  );

  // Fallback: If no recipients are pending, auto-enroll approved employees
  if (recipients.length === 0) {
    console.log(`[Campaign Dispatch] No pending staged recipients for #${campaignId}. Auto-enrolling approved employees...`);
    
    let empQuery = "SELECT id, name, email, department FROM Employees WHERE COALESCE(approval_status, 'Approved') = 'Approved'";
    const empParams = [];

    if (options.department && options.department !== 'ALL') {
      empQuery += ' AND department = ?';
      empParams.push(options.department);
    }

    const [allApproved] = await pool.execute(empQuery, empParams);

    for (const emp of allApproved) {
      const token = crypto.randomBytes(24).toString('hex');
      await pool.execute(
        `INSERT INTO CampaignRecipients (campaign_id, employee_id, tracking_token, sent_at)
         VALUES (?, ?, ?, NULL)
         ON DUPLICATE KEY UPDATE tracking_token = VALUES(tracking_token), sent_at = NULL`,
        [campaignId, emp.id, token]
      );
    }

    const [reloaded] = await pool.execute(
      `SELECT cr.id AS recipient_id, cr.tracking_token, cr.sent_at,
              e.id AS employee_id, e.name AS employee_name, e.email AS employee_email, e.department
       FROM CampaignRecipients cr
       INNER JOIN Employees e ON e.id = cr.employee_id
       WHERE cr.campaign_id = ? AND cr.sent_at IS NULL`,
      [campaignId]
    );
    recipients = reloaded;
  }

  if (recipients.length === 0) {
    throw new Error('No valid approved target recipients found to dispatch.');
  }

  const baseUrl = process.env.PUBLIC_TUNNEL_URL || process.env.BASE_URL || 'http://localhost:3000';
  await pool.execute("UPDATE Campaigns SET status = 'Running' WHERE id = ?", [campaignId]);

  let sentCount = 0;
  const successes = [];
  const failures = [];

  for (const r of recipients) {
    const token = r.tracking_token || crypto.randomBytes(24).toString('hex');
    const empObj = {
      name: r.employee_name,
      email: r.employee_email,
      department: r.department
    };

    const trackedHtml = buildTrackedEmailHtml(
      campaign.body_html || '<p>Please review your mandatory security update: {{link}}</p>',
      empObj,
      token,
      baseUrl
    );

    const emailSubject = (campaign.subject || `Urgent Notice: ${campaign.name}`)
      .replace(/\{\{\s*name\s*\}\}/gi, r.employee_name)
      .replace(/\{\{\s*EmployeeName\s*\}\}/gi, r.employee_name);

    try {
      await sendEmail({
        to: r.employee_email,
        subject: emailSubject,
        html: trackedHtml,
        fromName: options.fromName || campaign.sender_name || 'Corporate IT Security',
        fromAlias: options.fromAlias || 'security-alert',
      });

      await pool.execute(
        'UPDATE CampaignRecipients SET sent_at = NOW(), tracking_token = ? WHERE id = ?',
        [token, r.recipient_id]
      );

      await pool.execute(
        `INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent)
         VALUES (?, 'Delivered', '127.0.0.1', 'SMTP-Dispatcher')`,
        [r.recipient_id]
      );

      sentCount++;
      successes.push({ email: r.employee_email, recipientId: r.recipient_id });
      console.log(`[Campaign Dispatch] ✅ Successfully sent to ${r.employee_email}`);
    } catch (err) {
      console.error(`[Campaign Dispatch] ❌ Failed sending to ${r.employee_email}:`, err.message);
      failures.push({ email: r.employee_email, error: err.message });
    }
  }

  await pool.execute("UPDATE Campaigns SET status = 'Completed' WHERE id = ?", [campaignId]);

  return {
    campaignId,
    campaignName: campaign.name,
    sentCount,
    successes,
    failures
  };
}

module.exports = {
  buildTrackedEmailHtml,
  dispatchCampaignEmails,
};