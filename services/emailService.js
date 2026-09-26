const crypto = require('crypto');
const pool = require('../config/db');
const { sendPhishingSimulationEmail } = require('../utils/mailer');

/**
 * Automatically selects a realistic sender mask and alias tag based on the template name/subject.
 */
function resolveMaskAndAlias(templateName = '', subject = '') {
  const combined = `${templateName} ${subject}`.toLowerCase();

  if (combined.includes('hr') || combined.includes('bonus') || combined.includes('leave') || combined.includes('policy')) {
    return { senderMask: 'HR Compensation & Benefits', senderAlias: 'hr-benefits' };
  }
  if (combined.includes('finance') || combined.includes('invoice') || combined.includes('payroll') || combined.includes('tax')) {
    return { senderMask: 'Finance Accounts Payable', senderAlias: 'finance-billing' };
  }
  if (combined.includes('microsoft') || combined.includes('office') || combined.includes('365')) {
    return { senderMask: 'Microsoft 365 Security Alert', senderAlias: 'ms365-security' };
  }
  if (combined.includes('google') || combined.includes('gmail') || combined.includes('workspace')) {
    return { senderMask: 'Google Workspace Admin', senderAlias: 'google-security' };
  }
  return { senderMask: 'IT Helpdesk Support', senderAlias: 'it-helpdesk' };
}

/**
 * Interpolates placeholders ({{name}}, {{EmployeeName}}, {{tracking_link}}, {{PhishingLink}}, {{department}})
 * and appends the 1x1 transparent tracking pixel.
 */
function compilePhishingHtml(rawHtml, variables, trackingPixelUrl) {
  let compiled = String(rawHtml || '');

  const replacements = {
    '{{name}}': variables.name,
    '{{EmployeeName}}': variables.name,
    '{{email}}': variables.email,
    '{{department}}': variables.department || 'General',
    '{{tracking_link}}': variables.trackingLink,
    '{{PhishingLink}}': variables.trackingLink
  };

  for (const [tag, val] of Object.entries(replacements)) {
    compiled = compiled.split(tag).join(val);
  }

  const pixelTag = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;opacity:0;" alt="" />`;
  if (compiled.includes('</body>')) {
    compiled = compiled.replace('</body>', `${pixelTag}</body>`);
  } else {
    compiled += pixelTag;
  }

  return compiled;
}

/**
 * Dispatches all pending emails for a given Campaign ID using masked aliases.
 */
async function sendBulkCampaignQueue(campaignId, customMaskOptions = {}) {
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const [campaignRows] = await pool.execute(
    `SELECT c.id, c.name, c.status, c.template_id, c.landing_page_id,
            t.name AS template_name, t.subject AS template_subject, t.body_html,
            lp.slug AS landing_slug
     FROM Campaigns c
     LEFT JOIN EmailTemplates t ON t.id = c.template_id
     LEFT JOIN LandingPages lp ON lp.id = c.landing_page_id
     WHERE c.id = ?`,
    [campaignId]
  );

  if (campaignRows.length === 0) {
    throw new Error(`Campaign #${campaignId} not found.`);
  }

  const campaign = campaignRows[0];

  // Fetch recipients assigned to this campaign
  let [recipients] = await pool.execute(
    `SELECT cr.id AS recipient_id, cr.tracking_token, cr.sent_at,
            e.id AS employee_id, e.name AS employee_name, e.email AS employee_email, e.department
     FROM CampaignRecipients cr
     INNER JOIN Employees e ON e.id = cr.employee_id
     WHERE cr.campaign_id = ?`,
    [campaignId]
  );

  // If no recipients were manually staged yet, auto-enroll all active employees so the drill never sends 0
  if (recipients.length === 0) {
    const [allEmployees] = await pool.execute('SELECT id FROM Employees');
    for (const emp of allEmployees) {
      const token = crypto.randomBytes(24).toString('hex');
      await pool.execute(
        'INSERT INTO CampaignRecipients (campaign_id, employee_id, tracking_token) VALUES (?, ?, ?)',
        [campaignId, emp.id, token]
      );
    }
    const [reloaded] = await pool.execute(
      `SELECT cr.id AS recipient_id, cr.tracking_token, cr.sent_at,
              e.id AS employee_id, e.name AS employee_name, e.email AS employee_email, e.department
       FROM CampaignRecipients cr
       INNER JOIN Employees e ON e.id = cr.employee_id
       WHERE cr.campaign_id = ?`,
      [campaignId]
    );
    recipients = reloaded;
  }

  // Determine Sender Mask & Alias
  const autoMask = resolveMaskAndAlias(campaign.template_name, campaign.template_subject);
  const senderMask = customMaskOptions.senderMask || autoMask.senderMask;
  const senderAlias = customMaskOptions.senderAlias || autoMask.senderAlias;

  await pool.execute('UPDATE Campaigns SET status = ? WHERE id = ?', ['Running', campaignId]);

  const successes = [];
  const failures = [];

  for (const r of recipients) {
    const token = r.tracking_token || crypto.randomBytes(24).toString('hex');
    const clickTrackingUrl = `${baseUrl}/api/track/click/${token}`;
    const openPixelUrl = `${baseUrl}/api/track/open/${token}`;

    const compiledSubject = (campaign.template_subject || 'Urgent Security Verification')
      .replace(/\{\{name\}\}/g, r.employee_name)
      .replace(/\{\{EmployeeName\}\}/g, r.employee_name);

    const compiledHtml = compilePhishingHtml(
      campaign.body_html || '<p>Hello {{name}}, please verify your account at <a href="{{tracking_link}}">Portal</a>.</p>',
      {
        name: r.employee_name,
        email: r.employee_email,
        department: r.department,
        trackingLink: clickTrackingUrl
      },
      openPixelUrl
    );

    try {
      await sendPhishingSimulationEmail({
        to: r.employee_email,
        subject: compiledSubject,
        htmlBody: compiledHtml,
        senderMask,
        senderAlias
      });

      await pool.execute(
        'UPDATE CampaignRecipients SET sent_at = NOW(), tracking_token = ? WHERE id = ?',
        [token, r.recipient_id]
      );

      await pool.execute(
        `INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent)
         VALUES (?, 'Delivered', '127.0.0.1', 'SME-SMTP-Dispatcher')`,
        [r.recipient_id]
      );

      successes.push({ recipientId: r.recipient_id, email: r.employee_email, maskUsed: `${senderMask} (+${senderAlias})` });
    } catch (err) {
      console.error(`Failed sending to ${r.employee_email}:`, err.message);
      failures.push({ recipientId: r.recipient_id, email: r.employee_email, error: err.message });
    }
  }

  await pool.execute('UPDATE Campaigns SET status = ? WHERE id = ?', ['Completed', campaignId]);

  return {
    campaignId,
    senderMask,
    senderAlias,
    totalProcessed: recipients.length,
    successes,
    failures
  };
}

module.exports = {
  resolveMaskAndAlias,
  compilePhishingHtml,
  sendBulkCampaignQueue
};
