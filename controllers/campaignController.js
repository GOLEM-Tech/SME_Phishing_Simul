'use strict';

const crypto = require('crypto');
const pool = require('../config/db');
const { sendBulkCampaignQueue } = require('../services/emailService');

/**
 * POST /api/campaigns
 */
async function createCampaign(req, res, next) {
  try {
    let { name, description, scheduled_at, template_id, landing_page_id } = req.body;

    if (!name || name.trim() === '') {
      name = `Drill Campaign #${Date.now().toString().slice(-4)}`;
    }

    const resolvedTemplateId = parseInt(template_id, 10) || 1;
    const resolvedLandingId = parseInt(landing_page_id, 10) || 1;

    const [result] = await pool.execute(
      `INSERT INTO Campaigns
        (name, description, status, scheduled_at, template_id, landing_page_id, created_by)
       VALUES (?, ?, 'Draft', ?, ?, ?, ?)`,
      [
        name.trim(),
        description ?? 'Simulated phishing drill',
        scheduled_at ?? null,
        resolvedTemplateId,
        resolvedLandingId,
        req.user?.id ?? null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Campaign created successfully.',
      campaign_id: result.insertId,
      id: result.insertId,
      status: 'Draft'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/campaigns
 */
async function getCampaigns(req, res, next) {
  try {
    const [campaigns] = await pool.execute(
      `SELECT c.id, c.name, c.description, c.status, c.scheduled_at, c.created_at,
              c.template_id, c.landing_page_id,
              t.name AS template_name,
              lp.name AS landing_page_name
       FROM Campaigns c
       LEFT JOIN EmailTemplates t ON t.id = c.template_id
       LEFT JOIN LandingPages lp ON lp.id = c.landing_page_id
       ORDER BY c.created_at DESC`
    );

    return res.status(200).json({
      success: true,
      count: campaigns.length,
      campaigns
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/campaigns/:id
 */
async function getCampaignById(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID.' });
    }

    const [[campaign]] = await pool.execute(
      `SELECT c.id, c.name, c.description, c.status, c.scheduled_at, c.created_at,
              c.template_id, c.landing_page_id,
              t.name AS template_name, t.subject, t.body_html,
              lp.name AS landing_page_name, lp.slug AS landing_slug
       FROM Campaigns c
       LEFT JOIN EmailTemplates t ON t.id = c.template_id
       LEFT JOIN LandingPages lp ON lp.id = c.landing_page_id
       WHERE c.id = ?`,
      [campaignId]
    );

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found.' });
    }

    return res.status(200).json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/campaigns/:id
 */
async function updateCampaign(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const { name, description, status, scheduled_at, template_id, landing_page_id } = req.body;

    if (Number.isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID.' });
    }

    await pool.execute(
      `UPDATE Campaigns
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           status = COALESCE(?, status),
           scheduled_at = COALESCE(?, scheduled_at),
           template_id = COALESCE(?, template_id),
           landing_page_id = COALESCE(?, landing_page_id)
       WHERE id = ?`,
      [name, description, status, scheduled_at, template_id, landing_page_id, campaignId]
    );

    return res.status(200).json({ success: true, message: 'Campaign updated successfully.' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/campaigns/:id
 */
async function deleteCampaign(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID.' });
    }

    await pool.execute('DELETE FROM Campaigns WHERE id = ?', [campaignId]);
    return res.status(200).json({ success: true, message: 'Campaign deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/campaigns/:id/duplicate
 */
async function duplicateCampaign(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const [[original]] = await pool.execute('SELECT * FROM Campaigns WHERE id = ?', [campaignId]);

    if (!original) {
      return res.status(404).json({ success: false, error: 'Campaign not found.' });
    }

    const [dup] = await pool.execute(
      `INSERT INTO Campaigns (name, description, status, scheduled_at, template_id, landing_page_id, created_by)
       VALUES (?, ?, 'Draft', NULL, ?, ?, ?)`,
      [`${original.name} (Copy)`, original.description, original.template_id, original.landing_page_id, req.user?.id ?? null]
    );

    return res.status(201).json({ success: true, new_campaign_id: dup.insertId });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/campaigns/:id/send
 */
async function sendCampaign(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const { senderMask, senderAlias } = req.body;

    const summary = await sendBulkCampaignQueue(campaignId, { senderMask, senderAlias });

    return res.status(200).json({
      success: true,
      message: `Campaign dispatch finished. Processed ${summary.totalProcessed} recipient(s).`,
      summary
    });
  } catch (err) {
    console.error('Campaign dispatch error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/campaigns/:id/recipients
 */
async function addRecipients(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const { employee_ids, department } = req.body;

    let targetIds = [];
    if (Array.isArray(employee_ids) && employee_ids.length > 0) {
      targetIds = employee_ids.map(id => parseInt(id, 10)).filter(Number.isInteger);
    } else if (typeof department === 'string' && department.trim() !== '') {
      const [rows] = await pool.execute('SELECT id FROM Employees WHERE department = ?', [department.trim()]);
      targetIds = rows.map(r => r.id);
    }

    let inserted = 0;
    for (const empId of targetIds) {
      const [exists] = await pool.execute(
        'SELECT id FROM CampaignRecipients WHERE campaign_id = ? AND employee_id = ?',
        [campaignId, empId]
      );
      if (exists.length === 0) {
        const token = crypto.randomBytes(24).toString('hex');
        await pool.execute(
          'INSERT INTO CampaignRecipients (campaign_id, employee_id, tracking_token) VALUES (?, ?, ?)',
          [campaignId, empId, token]
        );
        inserted++;
      }
    }

    return res.status(200).json({ success: true, assignedCount: inserted });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/campaigns/:id/recipients
 */
async function getRecipients(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const [recipients] = await pool.execute(
      `SELECT cr.id AS recipient_id, cr.employee_id, e.name AS employee_name, e.email AS employee_email, e.department, cr.sent_at
       FROM CampaignRecipients cr
       JOIN Employees e ON e.id = cr.employee_id
       WHERE cr.campaign_id = ?`,
      [campaignId]
    );
    return res.status(200).json({ success: true, count: recipients.length, recipients });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/campaigns/:id/recipients/:recipientId
 */
async function removeRecipient(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const recipientId = parseInt(req.params.recipientId, 10);
    await pool.execute(
      'DELETE FROM CampaignRecipients WHERE id = ? AND campaign_id = ? AND sent_at IS NULL',
      [recipientId, campaignId]
    );
    return res.status(200).json({ success: true, message: 'Recipient removed.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  duplicateCampaign,
  sendCampaign,
  addRecipients,
  getRecipients,
  removeRecipient
};