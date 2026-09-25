'use strict';

// DB pool — all queries parameterized, no raw string interpolation
const db = require('../config/db');

// Valid statuses and allowed transition map
const VALID_STATUSES = ['Draft', 'Scheduled', 'Running', 'Completed'];

const ALLOWED_TRANSITIONS = {
  Draft: ['Scheduled', 'Running'],
  Scheduled: ['Running'],
  Running: ['Completed'],
  Completed: [],
};

// Validate status transition, throw if illegal
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

// POST /campaigns
async function createCampaign(req, res, next) {
  try {
    const {
      name,
      description,
      scheduled_at,
      subject,
      body,
      template_id,
      landing_page_id,
    } = req.body;

    if (!name || !subject || !body) {
      return res.status(400).json({ error: 'name, subject, and body are required' });
    }

    const [result] = await db.execute(
      `INSERT INTO Campaigns
        (name, description, status, scheduled_at, subject, body, template_id, landing_page_id, created_by, created_at, updated_at)
       VALUES (?, ?, 'Draft', ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        name,
        description ?? null,
        scheduled_at ?? null,
        subject,
        body,
        template_id ?? null,
        landing_page_id ?? null,
        req.user?.id ?? null,
      ]
    );

    return res.status(201).json({ campaign_id: result.insertId, status: 'Draft' });
  } catch (err) {
    next(err);
  }
}

// GET /campaigns — supports ?status=&page=&limit=
async function getCampaigns(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const offset = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));

    const conditions = [];
    const params = [];

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status filter. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      conditions.push('status = ?');
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await db.execute(
      `SELECT campaign_id, name, description, status, scheduled_at, subject, template_id, landing_page_id, created_by, created_at, updated_at
       FROM Campaigns
       ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM Campaigns ${where}`,
      params
    );

    return res.status(200).json({ total, page: parseInt(page), limit: pageSize, campaigns: rows });
  } catch (err) {
    next(err);
  }
}

// GET /campaigns/:id — fetches campaign + recipients via join
async function getCampaignById(req, res, next) {
  try {
    const { id } = req.params;

    const [[campaign]] = await db.execute(
      `SELECT campaign_id, name, description, status, scheduled_at, subject, body, template_id, landing_page_id, created_by, created_at, updated_at
       FROM Campaigns
       WHERE campaign_id = ?`,
      [id]
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const [recipients] = await db.execute(
      `SELECT cr.recipient_id, cr.employee_id, e.name AS employee_name, e.email,
              cr.status AS delivery_status, cr.sent_at, cr.opened_at, cr.clicked_at, cr.submitted_at
       FROM CampaignRecipients cr
       JOIN Employees e ON e.employee_id = cr.employee_id
       WHERE cr.campaign_id = ?`,
      [id]
    );

    return res.status(200).json({ ...campaign, recipients });
  } catch (err) {
    next(err);
  }
}

// PUT /campaigns/:id — updates mutable fields; status changes routed through transition check
async function updateCampaign(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, scheduled_at, subject, body, template_id, landing_page_id, status } = req.body;

    const [[existing]] = await db.execute(
      'SELECT campaign_id, status FROM Campaigns WHERE campaign_id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Status change goes through state machine gate
    if (status !== undefined && status !== existing.status) {
      assertTransition(existing.status, status);
    }

    const resolvedStatus = status !== undefined ? status : existing.status;

    await db.execute(
      `UPDATE Campaigns
       SET name          = COALESCE(?, name),
           description   = COALESCE(?, description),
           scheduled_at  = COALESCE(?, scheduled_at),
           subject       = COALESCE(?, subject),
           body          = COALESCE(?, body),
           template_id   = COALESCE(?, template_id),
           landing_page_id = COALESCE(?, landing_page_id),
           status        = ?,
           updated_at    = NOW()
       WHERE campaign_id = ?`,
      [
        name ?? null,
        description ?? null,
        scheduled_at ?? null,
        subject ?? null,
        body ?? null,
        template_id ?? null,
        landing_page_id ?? null,
        resolvedStatus,
        id,
      ]
    );

    return res.status(200).json({ message: 'Campaign updated', campaign_id: parseInt(id), status: resolvedStatus });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
}

// DELETE /campaigns/:id — only Draft or Scheduled deletable
async function deleteCampaign(req, res, next) {
  try {
    const { id } = req.params;

    const [[existing]] = await db.execute(
      'SELECT campaign_id, status FROM Campaigns WHERE campaign_id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!['Draft', 'Scheduled'].includes(existing.status)) {
      return res.status(400).json({
        error: `Cannot delete campaign in '${existing.status}' status. Only 'Draft' or 'Scheduled' campaigns may be deleted.`,
      });
    }

    // Recipients cascade assumed via FK ON DELETE CASCADE; explicit delete as safety net
    await db.execute('DELETE FROM CampaignRecipients WHERE campaign_id = ?', [id]);
    await db.execute('DELETE FROM Campaigns WHERE campaign_id = ?', [id]);

    return res.status(200).json({ message: 'Campaign deleted', campaign_id: parseInt(id) });
  } catch (err) {
    next(err);
  }
}

// POST /campaigns/:id/duplicate — deep-copy with transactional rollback
async function duplicateCampaign(req, res, next) {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;

    await conn.beginTransaction();

    // Fetch source campaign
    const [[source]] = await conn.execute(
      `SELECT name, description, scheduled_at, subject, body, template_id, landing_page_id, created_by
       FROM Campaigns
       WHERE campaign_id = ?`,
      [id]
    );

    if (!source) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ error: 'Source campaign not found' });
    }

    // Fetch all recipient employee IDs from source
    const [sourceRecipients] = await conn.execute(
      'SELECT employee_id FROM CampaignRecipients WHERE campaign_id = ?',
      [id]
    );

    // Insert duplicate campaign — always starts as Draft
    const [insertResult] = await conn.execute(
      `INSERT INTO Campaigns
        (name, description, status, scheduled_at, subject, body, template_id, landing_page_id, created_by, created_at, updated_at)
       VALUES (?, ?, 'Draft', ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        `${source.name} (Copy)`,
        source.description ?? null,
        source.scheduled_at ?? null,
        source.subject,
        source.body,
        source.template_id ?? null,
        source.landing_page_id ?? null,
        req.user?.id ?? source.created_by ?? null,
      ]
    );

    const newCampaignId = insertResult.insertId;

    // Re-map recipients to new campaign ID if any exist
    if (sourceRecipients.length > 0) {
      const recipientValues = sourceRecipients.map((r) => [newCampaignId, r.employee_id, 'Pending']);

      // Bulk insert via prepared loop to maintain parameterized safety
      for (const row of recipientValues) {
        await conn.execute(
          `INSERT INTO CampaignRecipients (campaign_id, employee_id, status) VALUES (?, ?, ?)`,
          row
        );
      }
    }

    await conn.commit();
    conn.release();

    return res.status(201).json({
      message: 'Campaign duplicated',
      source_campaign_id: parseInt(id),
      new_campaign_id: newCampaignId,
      recipients_copied: sourceRecipients.length,
      status: 'Draft',
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
  duplicateCampaign,
};
