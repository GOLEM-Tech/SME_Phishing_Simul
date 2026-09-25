'use strict';

const pool = require('../config/db');

const VALID_STATUSES = ['Draft', 'Scheduled', 'Running', 'Completed'];

const ALLOWED_TRANSITIONS = {
  Draft: ['Scheduled', 'Running'],
  Scheduled: ['Running'],
  Running: ['Completed'],
  Completed: []
};

function assertTransition(current, next) {
  if (!ALLOWED_TRANSITIONS[current]) {
    const err = new Error(`Unknown current status: ${current}`);
    err.status = 400;
    throw err;
  }
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    const err = new Error(
      `Invalid transition: '${current}' -> '${next}'. Allowed: [${ALLOWED_TRANSITIONS[current].join(', ') || 'none'}]`
    );
    err.status = 400;
    throw err;
  }
}

// POST /api/campaigns
async function createCampaign(req, res, next) {
  try {
    const { name, description, scheduled_at, template_id, landing_page_id } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Campaign name is required.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO Campaigns
        (name, description, status, scheduled_at, template_id, landing_page_id, created_by)
       VALUES (?, ?, 'Draft', ?, ?, ?, ?)`,
      [
        name,
        description ?? null,
        scheduled_at ?? null,
        template_id ?? null,
        landing_page_id ?? null,
        req.user?.id ?? null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Campaign created successfully.',
      campaign_id: result.insertId,
      status: 'Draft'
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/campaigns
async function getCampaigns(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const conditions = [];
    const params = [];

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status filter. Must be one of: ${VALID_STATUSES.join(', ')}`
        });
      }
      conditions.push('status = ?');
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.execute(
      `SELECT id, name, description, status, scheduled_at, template_id, landing_page_id, created_by, created_at
       FROM Campaigns
       ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM Campaigns ${where}`,
      params
    );

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      limit: pageSize,
      campaigns: rows
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/campaigns/:id
async function getCampaignById(req, res, next) {
  try {
    const { id } = req.params;

    const [[campaign]] = await pool.execute(
      `SELECT id, name, description, status, scheduled_at, template_id, landing_page_id, created_by, created_at
       FROM Campaigns
       WHERE id = ?`,
      [id]
    );

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found.' });
    }

    // Join with correct Employees schema (e.id, e.name, e.email)
    const [recipients] = await pool.execute(
      `SELECT cr.id AS recipient_id, cr.employee_id, e.name AS employee_name, e.email AS employee_email,
              cr.tracking_token, cr.sent_at
       FROM CampaignRecipients cr
       JOIN Employees e ON e.id = cr.employee_id
       WHERE cr.campaign_id = ?`,
      [id]
    );

    return res.status(200).json({ success: true, ...campaign, recipients });
  } catch (err) {
    next(err);
  }
}

// PUT /api/campaigns/:id
async function updateCampaign(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, scheduled_at, template_id, landing_page_id, status } = req.body;

    const [[existing]] = await pool.execute('SELECT id, status FROM Campaigns WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Campaign not found.' });
    }

    if (status !== undefined && status !== existing.status) {
      assertTransition(existing.status, status);
    }

    const resolvedStatus = status !== undefined ? status : existing.status;

    await pool.execute(
      `UPDATE Campaigns
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           scheduled_at = COALESCE(?, scheduled_at),
           template_id = COALESCE(?, template_id),
           landing_page_id = COALESCE(?, landing_page_id),
           status = ?
       WHERE id = ?`,
      [
        name ?? null,
        description ?? null,
        scheduled_at ?? null,
        template_id ?? null,
        landing_page_id ?? null,
        resolvedStatus,
        id
      ]
    );

    return res.status(200).json({
      success: true,
      message: 'Campaign updated successfully.',
      campaign_id: parseInt(id, 10),
      status: resolvedStatus
    });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
}

// DELETE /api/campaigns/:id
async function deleteCampaign(req, res, next) {
  try {
    const { id } = req.params;

    const [[existing]] = await pool.execute('SELECT id, status FROM Campaigns WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Campaign not found.' });
    }

    if (!['Draft', 'Scheduled'].includes(existing.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete campaign in '${existing.status}' status. Only 'Draft' or 'Scheduled' campaigns may be deleted.`
      });
    }

    await pool.execute('DELETE FROM CampaignRecipients WHERE campaign_id = ?', [id]);
    await pool.execute('DELETE FROM Campaigns WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Campaign deleted successfully.',
      campaign_id: parseInt(id, 10)
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/campaigns/:id/duplicate
async function duplicateCampaign(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    await conn.beginTransaction();

    const [[source]] = await conn.execute(
      `SELECT name, description, scheduled_at, template_id, landing_page_id, created_by
       FROM Campaigns
       WHERE id = ?`,
      [id]
    );

    if (!source) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ success: false, error: 'Source campaign not found.' });
    }

    const [sourceRecipients] = await conn.execute(
      'SELECT employee_id FROM CampaignRecipients WHERE campaign_id = ?',
      [id]
    );

    const [insertResult] = await conn.execute(
      `INSERT INTO Campaigns
        (name, description, status, scheduled_at, template_id, landing_page_id, created_by)
       VALUES (?, ?, 'Draft', ?, ?, ?, ?)`,
      [
        `${source.name} (Copy)`,
        source.description ?? null,
        source.scheduled_at ?? null,
        source.template_id ?? null,
        source.landing_page_id ?? null,
        req.user?.id ?? source.created_by ?? null
      ]
    );

    const newCampaignId = insertResult.insertId;

    if (sourceRecipients.length > 0) {
      const crypto = require('crypto');
      for (const r of sourceRecipients) {
        const freshToken = crypto.randomBytes(32).toString('hex');
        await conn.execute(
          'INSERT INTO CampaignRecipients (campaign_id, employee_id, tracking_token) VALUES (?, ?, ?)',
          [newCampaignId, r.employee_id, freshToken]
        );
      }
    }

    await conn.commit();
    conn.release();

    return res.status(201).json({
      success: true,
      message: 'Campaign duplicated successfully.',
      source_campaign_id: parseInt(id, 10),
      new_campaign_id: newCampaignId,
      recipients_copied: sourceRecipients.length,
      status: 'Draft'
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    next(err);
  }
}

module.exports = {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  duplicateCampaign
};
