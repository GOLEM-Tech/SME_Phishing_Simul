'use strict';

const db = require('../config/db');
const emailService = require('./emailService');

// Persists a notification record for a given user and role into the notifications table.
async function createNotification(userId, role, title, message, type) {
  try {
    const [result] = await db.execute(
      `INSERT INTO notifications
         (user_id, role, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW())`,
      [userId, role, title, message, type]
    );
    return result.insertId;
  } catch (err) {
    // Log persistence failure without crashing the calling pipeline.
    console.error(`[notificationService] createNotification failed — userId: ${userId}, error: ${err.message}`);
    return null;
  }
}

// Fires when a campaign transmission loop completes. Queries metrics, builds summary, notifies admins.
async function triggerAdminCampaignComplete(campaignId) {
  try {
    // Fetch campaign metadata.
    const [campaignRows] = await db.execute(
      `SELECT c.id, c.name, c.description, c.created_by,
              u.email AS admin_email, u.name AS admin_name
       FROM campaigns c
       INNER JOIN users u ON u.id = c.created_by
       WHERE c.id = ?`,
      [campaignId]
    );

    if (!campaignRows.length) {
      console.error(`[notificationService] triggerAdminCampaignComplete — campaign ${campaignId} not found.`);
      return;
    }

    const campaign = campaignRows[0];

    // Fetch aggregate delivery metrics for the campaign.
    const [metricsRows] = await db.execute(
      `SELECT
         COUNT(*)                                                        AS total_sent,
         SUM(CASE WHEN event_type = 'delivered'  THEN 1 ELSE 0 END)    AS total_delivered,
         SUM(CASE WHEN event_type = 'opened'     THEN 1 ELSE 0 END)    AS total_opened,
         SUM(CASE WHEN event_type = 'clicked'    THEN 1 ELSE 0 END)    AS total_clicked,
         SUM(CASE WHEN event_type = 'submitted'  THEN 1 ELSE 0 END)    AS total_submitted
       FROM email_events
       WHERE campaign_id = ?`,
      [campaignId]
    );

    const metrics = metricsRows[0];

    const openRate =
      metrics.total_delivered > 0
        ? ((metrics.total_opened / metrics.total_delivered) * 100).toFixed(2)
        : '0.00';

    const clickRate =
      metrics.total_delivered > 0
        ? ((metrics.total_clicked / metrics.total_delivered) * 100).toFixed(2)
        : '0.00';

    const submitRate =
      metrics.total_delivered > 0
        ? ((metrics.total_submitted / metrics.total_delivered) * 100).toFixed(2)
        : '0.00';

    // Build executive summary string for dashboard notification panel.
    const summaryTitle   = `Campaign Completed: ${campaign.name}`;
    const summaryMessage =
      `Campaign "${campaign.name}" has completed execution. ` +
      `Total Sent: ${metrics.total_sent} | ` +
      `Delivered: ${metrics.total_delivered} | ` +
      `Opened: ${metrics.total_opened} (${openRate}%) | ` +
      `Clicked: ${metrics.total_clicked} (${clickRate}%) | ` +
      `Credentials Submitted: ${metrics.total_submitted} (${submitRate}%).`;

    // Persist dashboard notification for the admin.
    await createNotification(
      campaign.created_by,
      'admin',
      summaryTitle,
      summaryMessage,
      'campaign_complete'
    );

    // Mark campaign status as completed in the campaigns table.
    await db.execute(
      `UPDATE campaigns SET status = 'completed', updated_at = NOW() WHERE id = ?`,
      [campaignId]
    );

    // Dispatch transactional summary email to the administrator.
    const emailSubject = `[Phishing Simulation] Campaign Completed — ${campaign.name}`;
    const emailBody    =
      `<p>Hello ${campaign.admin_name},</p>` +
      `<p>The phishing simulation campaign <strong>${campaign.name}</strong> has completed.</p>` +
      `<h3>Execution Summary</h3>` +
      `<ul>` +
      `<li><strong>Total Sent:</strong> ${metrics.total_sent}</li>` +
      `<li><strong>Delivered:</strong> ${metrics.total_delivered}</li>` +
      `<li><strong>Opened:</strong> ${metrics.total_opened} (${openRate}%)</li>` +
      `<li><strong>Clicked:</strong> ${metrics.total_clicked} (${clickRate}%)</li>` +
      `<li><strong>Credentials Submitted:</strong> ${metrics.total_submitted} (${submitRate}%)</li>` +
      `</ul>` +
      `<p>Log in to the dashboard to view the full report and employee risk breakdown.</p>`;

    await emailService.sendIndividualEmail({
      to:      campaign.admin_email,
      subject: emailSubject,
      html:    emailBody,
    });

  } catch (err) {
    // Isolated catch — does not surface to HTTP layer.
    console.error(`[notificationService] triggerAdminCampaignComplete failed — campaignId: ${campaignId}, error: ${err.message}`);
  }
}

// Fires on credential submission event. Assigns training, notifies employee via dashboard + email.
async function triggerEmployeeTrainingAssignment(employeeId, campaignId) {
  try {
    // Fetch employee profile.
    const [employeeRows] = await db.execute(
      `SELECT e.id, e.name, e.email, e.user_id
       FROM employees e
       WHERE e.id = ?`,
      [employeeId]
    );

    if (!employeeRows.length) {
      console.error(`[notificationService] triggerEmployeeTrainingAssignment — employee ${employeeId} not found.`);
      return;
    }

    const employee = employeeRows[0];

    // Fetch all active training modules to assign.
    const [moduleRows] = await db.execute(
      `SELECT id, title FROM training_modules WHERE is_active = 1`,
      []
    );

    if (!moduleRows.length) {
      console.warn(`[notificationService] No active training modules found. Skipping assignment for employee ${employeeId}.`);
    }

    // Compute due date: 7 days from assignment.
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const dueDateStr = dueDate.toISOString().slice(0, 19).replace('T', ' ');

    // Insert training assignments — skip duplicates to maintain idempotency.
    for (const module of moduleRows) {
      const [existingRows] = await db.execute(
        `SELECT id FROM training_assignments
         WHERE employee_id = ? AND module_id = ? AND campaign_id = ?`,
        [employeeId, module.id, campaignId]
      );

      if (!existingRows.length) {
        await db.execute(
          `INSERT INTO training_assignments
             (employee_id, module_id, campaign_id, status, due_date, assigned_at)
           VALUES (?, ?, ?, 'pending', ?, NOW())`,
          [employeeId, module.id, campaignId, dueDateStr]
        );
      }
    }

    // Build dashboard notification content for the employee.
    const notificationTitle =
      '⚠️ Action Required: Security Awareness Training Assigned';
    const notificationMessage =
      `You have been enrolled in mandatory security awareness training ` +
      `as part of a recent security exercise. ` +
      `Please complete all assigned modules by ${dueDateStr}. ` +
      `Failure to complete training by the due date will be escalated to your manager.`;

    // Persist dashboard notification for the employee.
    await createNotification(
      employee.user_id,
      'employee',
      notificationTitle,
      notificationMessage,
      'training_assigned'
    );

    // Build structured training enrollment email body.
    const moduleListHtml = moduleRows
      .map((m) => `<li>${m.title}</li>`)
      .join('');

    const emailSubject = '[Action Required] Security Awareness Training Enrollment';
    const emailBody    =
      `<p>Hello ${employee.name},</p>` +
      `<p>As part of your organization's ongoing security awareness program, ` +
      `you have been automatically enrolled in the following mandatory training modules:</p>` +
      `<ul>${moduleListHtml}</ul>` +
      `<p><strong>Due Date:</strong> ${dueDateStr}</p>` +
      `<p>Please log in to your employee dashboard to begin your assigned training at your earliest convenience.</p>` +
      `<p>If you have questions about this enrollment, please contact your system administrator.</p>` +
      `<br/><p><em>This is an automated notification from the Security Awareness Platform.</em></p>`;

    // Dispatch enrollment notification email to the employee.
    await emailService.sendIndividualEmail({
      to:      employee.email,
      subject: emailSubject,
      html:    emailBody,
    });

  } catch (err) {
    // Isolated catch — does not surface to HTTP layer.
    console.error(`[notificationService] triggerEmployeeTrainingAssignment failed — employeeId: ${employeeId}, campaignId: ${campaignId}, error: ${err.message}`);
  }
}

module.exports = {
  createNotification,
  triggerAdminCampaignComplete,
  triggerEmployeeTrainingAssignment,
};
