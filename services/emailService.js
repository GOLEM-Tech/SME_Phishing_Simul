'use strict';

// Nodemailer transport + DB pool
const nodemailer = require('nodemailer');
const db = require('../config/db');

// Reusable pooled SMTP transport — max 5 concurrent sockets, idle timeout 10s
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: parseInt(process.env.SMTP_PORT, 10) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 1000,
  rateLimit: 10,
  socketTimeout: 10000,
  greetingTimeout: 10000,
  connectionTimeout: 10000,
});

/**
 * Replace {{Token}} placeholders in template string.
 * Returns substituted string.
 */
function interpolateTemplate(template, substitutions) {
  return Object.keys(substitutions).reduce((output, key) => {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    return output.replace(pattern, substitutions[key]);
  }, template);
}

/**
 * Send single email. Returns structured result object.
 * Never throws — all errors captured in return value.
 */
async function sendIndividualEmail(toEmail, subject, htmlContent) {
  try {
    const info = await transport.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'Security Team'}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent,
    });

    return {
      success: true,
      messageId: info.messageId,
      recipient: toEmail,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      messageId: null,
      recipient: toEmail,
      timestamp: new Date().toISOString(),
      error: err.message,
    };
  }
}

/**
 * Core bulk dispatch engine.
 * Fetches campaign meta + all recipients, iterates queue,
 * substitutes tokens per recipient, sends, logs outcome per record,
 * finalises campaign status when queue exhausted.
 */
async function sendBulkCampaignQueue(campaignId) {
  const successes = [];
  const failures = [];

  // Fetch campaign metadata
  const [campaignRows] = await db.execute(
    `SELECT id, name, subject, body
     FROM campaigns
     WHERE id = ? AND status IN ('scheduled', 'running')
     LIMIT 1`,
    [campaignId]
  );

  if (campaignRows.length === 0) {
    throw new Error(`Campaign ${campaignId} not found or not in a dispatchable state.`);
  }

  const campaign = campaignRows[0];

  // Mark campaign as running
  await db.execute(
    `UPDATE campaigns SET status = 'running', updated_at = NOW() WHERE id = ?`,
    [campaignId]
  );

  // Fetch all pending recipients for this campaign
  const [recipients] = await db.execute(
    `SELECT cr.id AS recipient_id,
            cr.employee_id,
            cr.tracking_token,
            cr.status,
            e.email,
            e.first_name,
            e.last_name
     FROM campaign_recipients cr
     INNER JOIN employees e ON e.id = cr.employee_id
     WHERE cr.campaign_id = ? AND cr.status = 'pending'`,
    [campaignId]
  );

  if (recipients.length === 0) {
    // No pending targets — mark completed immediately
    await db.execute(
      `UPDATE campaigns SET status = 'completed', updated_at = NOW() WHERE id = ?`,
      [campaignId]
    );
    return { campaignId, successes, failures, totalProcessed: 0 };
  }

  // Process each recipient independently — failure on one does not break loop
  for (const recipient of recipients) {
    try {
      // Build per-recipient substitution map
      const substitutions = {
        EmployeeName: `${recipient.first_name} ${recipient.last_name}`.trim(),
        FirstName: recipient.first_name,
        LastName: recipient.last_name,
        Email: recipient.email,
        TrackingToken: recipient.tracking_token,
        TrackingPixel: `<img src="${process.env.APP_BASE_URL}/track/open/${recipient.tracking_token}" width="1" height="1" style="display:none;" alt="" />`,
        PhishingLink: `${process.env.APP_BASE_URL}/lp/${recipient.tracking_token}`,
      };

      const interpolatedSubject = interpolateTemplate(campaign.subject, substitutions);
      const interpolatedBody = interpolateTemplate(campaign.body, substitutions);

      const result = await sendIndividualEmail(recipient.email, interpolatedSubject, interpolatedBody);

      if (!result.success) {
        // sendIndividualEmail never throws — check success flag explicitly
        throw new Error(result.error || 'Unknown SMTP error');
      }

      // Log success — update recipient record status + message ID
      await db.execute(
        `UPDATE campaign_recipients
         SET status = 'delivered',
             sent_at = NOW(),
             message_id = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [result.messageId, recipient.recipient_id]
      );

      successes.push({
        recipientId: recipient.recipient_id,
        email: recipient.email,
        messageId: result.messageId,
        sentAt: result.timestamp,
      });
    } catch (err) {
      // Isolate failure — log to DB, push to failures array, continue loop
      try {
        await db.execute(
          `UPDATE campaign_recipients
           SET status = 'failed',
               error_message = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [err.message.substring(0, 500), recipient.recipient_id]
        );
      } catch (dbErr) {
        // DB log failure must not suppress loop — record locally only
        console.error(
          `[emailService] DB status update failed for recipient ${recipient.recipient_id}: ${dbErr.message}`
        );
      }

      failures.push({
        recipientId: recipient.recipient_id,
        email: recipient.email,
        error: err.message,
        failedAt: new Date().toISOString(),
      });

      continue;
    }
  }

  // Check if all recipients for this campaign are now in a terminal state
  const [remainingRows] = await db.execute(
    `SELECT COUNT(*) AS pending_count
     FROM campaign_recipients
     WHERE campaign_id = ? AND status = 'pending'`,
    [campaignId]
  );

  const pendingCount = remainingRows[0].pending_count;

  if (pendingCount === 0) {
    // All records processed — advance campaign to completed
    await db.execute(
      `UPDATE campaigns
       SET status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [campaignId]
    );
  }

  return {
    campaignId,
    successes,
    failures,
    totalProcessed: successes.length + failures.length,
    remainingPending: pendingCount,
  };
}

module.exports = {
  sendIndividualEmail,
  sendBulkCampaignQueue,
};
