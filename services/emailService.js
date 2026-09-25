'use strict';

const crypto = require('crypto');
const pool = require('../config/db');
const { transporter } = require('../utils/mailer');

function interpolateTemplate(template, substitutions) {
  if (typeof template !== 'string') return '';
  return Object.keys(substitutions).reduce((output, key) => {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    return output.replace(pattern, substitutions[key] ?? '');
  }, template);
}

async function sendIndividualEmail(toEmail, subject, htmlContent) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Security Awareness Drill" <security@phishsim.local>',
      to: toEmail,
      subject,
      html: htmlContent
    });

    return {
      success: true,
      messageId: info.messageId,
      recipient: toEmail
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      recipient: toEmail
    };
  }
}

async function sendBulkCampaignQueue(campaignId) {
  const successes = [];
  const failures = [];
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  // 1. Fetch Campaign and linked Template
  const [campaignRows] = await pool.execute(
    `SELECT c.id, c.name, t.subject, t.body_html
     FROM Campaigns c
     JOIN EmailTemplates t ON t.id = c.template_id
     WHERE c.id = ? AND c.status IN ('Scheduled', 'Running', 'Draft')
     LIMIT 1`,
    [campaignId]
  );

  if (campaignRows.length === 0) {
    throw new Error(`Campaign ${campaignId} not found or missing associated template.`);
  }

  const campaign = campaignRows[0];

  // Set status to Running
  await pool.execute("UPDATE Campaigns SET status = 'Running' WHERE id = ?", [campaignId]);

  // 2. Fetch all recipients linked to this campaign
  const [recipients] = await pool.execute(
    `SELECT cr.id AS recipient_id, cr.employee_id, cr.tracking_token, cr.sent_at,
            e.name AS employee_name, e.email
     FROM CampaignRecipients cr
     JOIN Employees e ON e.id = cr.employee_id
     WHERE cr.campaign_id = ? AND cr.sent_at IS NULL`,
    [campaignId]
  );

  for (const recipient of recipients) {
    try {
      // Ensure recipient has a valid tracking token
      let token = recipient.tracking_token;
      if (!token) {
        token = crypto.randomBytes(32).toString('hex');
        await pool.execute(
          'UPDATE CampaignRecipients SET tracking_token = ? WHERE id = ?',
          [token, recipient.recipient_id]
        );
      }

      const trackingPixelUrl = `${baseUrl}/api/track/open/${token}`;
      const trackingClickUrl = `${baseUrl}/api/track/click/${token}`;

      const substitutions = {
        EmployeeName: recipient.employee_name,
        Email: recipient.email,
        TrackingToken: token,
        TrackingPixel: `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`,
        PhishingLink: trackingClickUrl
      };

      const interpolatedSubject = interpolateTemplate(campaign.subject, substitutions);
      const interpolatedBody    = interpolateTemplate(campaign.body_html, substitutions) + substitutions.TrackingPixel;

      const result = await sendIndividualEmail(recipient.email, interpolatedSubject, interpolatedBody);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Mark recipient as sent
      await pool.execute(
        'UPDATE CampaignRecipients SET sent_at = NOW() WHERE id = ?',
        [recipient.recipient_id]
      );

      // Record 'Delivered' event in EmailEvents
      await pool.execute(
        "INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, 'Delivered', '127.0.0.1', 'Mailer Daemon')",
        [recipient.recipient_id]
      );

      successes.push({ recipientId: recipient.recipient_id, email: recipient.email });
    } catch (err) {
      failures.push({ recipientId: recipient.recipient_id, email: recipient.email, error: err.message });
    }
  }

  // If all recipients are sent, mark campaign Completed
  const [[{ pendingCount }]] = await pool.execute(
    'SELECT COUNT(*) AS pendingCount FROM CampaignRecipients WHERE campaign_id = ? AND sent_at IS NULL',
    [campaignId]
  );

  if (pendingCount === 0) {
    await pool.execute("UPDATE Campaigns SET status = 'Completed' WHERE id = ?", [campaignId]);
  }

  return {
    campaignId,
    totalProcessed: successes.length + failures.length,
    successes,
    failures
  };
}

module.exports = {
  sendIndividualEmail,
  sendBulkCampaignQueue
};
