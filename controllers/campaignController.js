'use strict';

const pool = require('../config/db');
const logAction = require('../utils/auditLogger');
const { dispatchCampaignEmails } = require('../services/emailService');

// GET /api/campaigns
exports.getAllCampaigns = async (req, res) => {
  try {
    const [campaigns] = await pool.execute(
      `SELECT c.*, 
              et.name AS template_name, 
              lp.name AS landing_page_name,
              (SELECT COUNT(*) FROM CampaignRecipients cr WHERE cr.campaign_id = c.id) AS recipient_count
       FROM Campaigns c
       LEFT JOIN EmailTemplates et ON et.id = c.template_id
       LEFT JOIN LandingPages lp ON lp.id = c.landing_page_id
       ORDER BY c.created_at DESC, c.id DESC`
    );
    return res.status(200).json({ campaigns, data: campaigns });
  } catch (err) {
    console.error('[GetAllCampaigns Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch campaigns.' });
  }
};
exports.getCampaigns = exports.getAllCampaigns;

// GET /api/campaigns/:id
exports.getCampaignById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(
      `SELECT c.*, et.name AS template_name, lp.name AS landing_page_name
       FROM Campaigns c
       LEFT JOIN EmailTemplates et ON et.id = c.template_id
       LEFT JOIN LandingPages lp ON lp.id = c.landing_page_id
       WHERE c.id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    return res.status(200).json({ campaign: rows[0], data: rows[0] });
  } catch (err) {
    console.error('[GetCampaignById Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve campaign details.' });
  }
};

// POST /api/campaigns
exports.createCampaign = async (req, res) => {
  const { name, description, template_id, landing_page_id, scheduled_at } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  if (!name) {
    return res.status(400).json({ error: 'Campaign name is required.' });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO Campaigns (name, description, template_id, landing_page_id, status, scheduled_at, created_by)
       VALUES (?, ?, ?, ?, 'Draft', ?, ?)`,
      [
        name.trim(),
        description || 'Simulated phishing awareness campaign',
        Number(template_id) || 1,
        Number(landing_page_id) || 1,
        scheduled_at || null,
        req.user?.id || null,
      ]
    );

    await logAction(
      req.user?.id || null,
      'CAMPAIGN_CREATED',
      {
        campaignId: result.insertId,
        name: name.trim(),
        templateId: Number(template_id) || 1,
        landingPageId: Number(landing_page_id) || 1,
      },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: req.user?.role || 'Admin' }
    );

    return res.status(201).json({
      success: true,
      message: 'Campaign created successfully.',
      id: result.insertId,
      campaign_id: result.insertId,
    });
  } catch (err) {
    console.error('[CreateCampaign Error]:', err.message);
    return res.status(500).json({ error: 'Failed to create campaign.' });
  }
};

// PUT /api/campaigns/:id
exports.updateCampaign = async (req, res) => {
  const { id } = req.params;
  const { name, description, template_id, landing_page_id, status, scheduled_at } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  try {
    const [existing] = await pool.execute('SELECT * FROM Campaigns WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const cur = existing[0];
    await pool.execute(
      `UPDATE Campaigns 
       SET name = ?, description = ?, template_id = ?, landing_page_id = ?, status = ?, scheduled_at = ?
       WHERE id = ?`,
      [
        name !== undefined ? name : cur.name,
        description !== undefined ? description : cur.description,
        template_id !== undefined ? Number(template_id) : cur.template_id,
        landing_page_id !== undefined ? Number(landing_page_id) : cur.landing_page_id,
        status !== undefined ? status : cur.status,
        scheduled_at !== undefined ? scheduled_at : cur.scheduled_at,
        id,
      ]
    );

    await logAction(
      req.user?.id || null,
      'CAMPAIGN_UPDATED',
      { campaignId: Number(id), name: name || cur.name, status: status || cur.status },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: req.user?.role || 'Admin' }
    );

    return res.status(200).json({ message: 'Campaign updated successfully.' });
  } catch (err) {
    console.error('[UpdateCampaign Error]:', err.message);
    return res.status(500).json({ error: 'Failed to update campaign.' });
  }
};

// DELETE /api/campaigns/:id
exports.deleteCampaign = async (req, res) => {
  const { id } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  try {
    const [campRows] = await pool.execute('SELECT name FROM Campaigns WHERE id = ? LIMIT 1', [id]);
    if (campRows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    await pool.execute('DELETE FROM Campaigns WHERE id = ?', [id]);

    await logAction(
      req.user?.id || null,
      'CAMPAIGN_DELETED',
      { campaignId: Number(id), name: campRows[0].name },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: req.user?.role || 'Admin' }
    );

    return res.status(200).json({ message: 'Campaign deleted successfully.' });
  } catch (err) {
    console.error('[DeleteCampaign Error]:', err.message);
    return res.status(500).json({ error: 'Failed to delete campaign.' });
  }
};

// POST /api/campaigns/:id/send
exports.sendCampaign = async (req, res) => {
  const campaignId = Number(req.params.id);
  const { department, fromName, fromAlias } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  try {
    const result = await dispatchCampaignEmails(campaignId, {
      department,
      fromName,
      fromAlias,
    });

    await logAction(
      req.user?.id || null,
      'CAMPAIGN_DISPATCHED',
      {
        campaignId,
        campaignName: result.campaignName,
        recipientsDispatched: result.sentCount,
        fromName: fromName || 'Default',
        fromAlias: fromAlias || 'Default',
      },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: req.user?.role || 'Admin' }
    );

    return res.status(200).json({
      success: true,
      message: `Campaign "${result.campaignName}" dispatched to ${result.sentCount} targets.`,
      ...result,
    });
  } catch (err) {
    console.error('[SendCampaign Error]:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to dispatch campaign.' });
  }
};
exports.launchCampaign = exports.sendCampaign;

// POST /api/campaigns/:id/duplicate
exports.duplicateCampaign = async (req, res) => {
  const { id } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  try {
    const [rows] = await pool.execute('SELECT * FROM Campaigns WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const c = rows[0];
    const newName = `${c.name} (Copy)`;

    const [result] = await pool.execute(
      `INSERT INTO Campaigns (name, description, template_id, landing_page_id, status, scheduled_at, created_by)
       VALUES (?, ?, ?, ?, 'Draft', NULL, ?)`,
      [newName, c.description, c.template_id, c.landing_page_id, req.user?.id || null]
    );

    await logAction(
      req.user?.id || null,
      'CAMPAIGN_DUPLICATED',
      { originalId: Number(id), newId: result.insertId, name: newName },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: req.user?.role || 'Admin' }
    );

    return res.status(201).json({
      message: 'Campaign duplicated successfully.',
      newCampaignId: result.insertId,
    });
  } catch (err) {
    console.error('[DuplicateCampaign Error]:', err.message);
    return res.status(500).json({ error: 'Failed to duplicate campaign.' });
  }
};

// GET /api/campaigns/:id/recipients
exports.getRecipients = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(
      `SELECT cr.id AS recipient_id, cr.employee_id, cr.tracking_token, cr.sent_at,
              e.name AS employee_name, e.email AS employee_email, e.department, e.risk_level
       FROM CampaignRecipients cr
       INNER JOIN Employees e ON e.id = cr.employee_id
       WHERE cr.campaign_id = ?
       ORDER BY cr.id ASC`,
      [id]
    );
    return res.status(200).json({ recipients: rows, count: rows.length });
  } catch (err) {
    console.error('[GetRecipients Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve campaign recipients.' });
  }
};

// POST /api/campaigns/:id/recipients
exports.addRecipients = async (req, res) => {
  const { id } = req.params;
  const { employee_ids } = req.body;
  const crypto = require('crypto');

  if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
    return res.status(400).json({ error: 'employee_ids must be a non-empty array.' });
  }

  try {
    let addedCount = 0;
    for (const empId of employee_ids) {
      const token = crypto.randomBytes(24).toString('hex');
      await pool.execute(
        `INSERT IGNORE INTO CampaignRecipients (campaign_id, employee_id, tracking_token, sent_at)
         VALUES (?, ?, ?, NULL)`,
        [id, empId, token]
      );
      addedCount++;
    }

    return res.status(200).json({ message: `Added ${addedCount} recipients to campaign.` });
  } catch (err) {
    console.error('[AddRecipients Error]:', err.message);
    return res.status(500).json({ error: 'Failed to add recipients.' });
  }
};

// DELETE /api/campaigns/:id/recipients/:recipientId
exports.removeRecipient = async (req, res) => {
  const { id, recipientId } = req.params;
  try {
    await pool.execute(
      'DELETE FROM CampaignRecipients WHERE campaign_id = ? AND id = ?',
      [id, recipientId]
    );
    return res.status(200).json({ message: 'Recipient removed from campaign.' });
  } catch (err) {
    console.error('[RemoveRecipient Error]:', err.message);
    return res.status(500).json({ error: 'Failed to remove recipient.' });
  }
};