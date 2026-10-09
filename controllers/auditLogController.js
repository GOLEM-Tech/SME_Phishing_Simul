'use strict';

const pool = require('../config/db');

// GET /api/audit-logs
// Supports ?page=1&limit=50&action=QUIZ_ASSIGNED&role=Admin&search=sess_...
exports.getAuditLogs = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const actionFilter = (req.query.action || '').trim();
  const roleFilter = (req.query.role || '').trim();
  const search = (req.query.search || '').trim();

  const whereClauses = [];
  const params = [];

  if (actionFilter && actionFilter !== 'ALL') {
    whereClauses.push('al.action = ?');
    params.push(actionFilter);
  }

  if (roleFilter && roleFilter !== 'ALL') {
    whereClauses.push('COALESCE(al.role, "Admin") = ?');
    params.push(roleFilter);
  }

  if (search) {
    whereClauses.push(
      '(al.actor_email LIKE ? OR al.session_id LIKE ? OR al.action LIKE ? OR al.details LIKE ? OR al.ip_address LIKE ? OR u.email LIKE ?)'
    );
    const likeTerm = `%${search}%`;
    params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  try {
    const [rows] = await pool.query(
      `SELECT al.id, al.user_id, al.session_id, al.actor_email, al.role, al.action, al.details, al.ip_address, al.created_at,
              u.name AS admin_name, u.email AS admin_email
       FROM AuditLogs al
       LEFT JOIN Users u ON u.id = al.user_id
       ${whereSql}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM AuditLogs al
       LEFT JOIN Users u ON u.id = al.user_id
       ${whereSql}`,
      params
    );

    const [distinctActionRows] = await pool.query(
      'SELECT DISTINCT action FROM AuditLogs ORDER BY action ASC'
    );

    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return res.status(200).json({
      logs: rows,
      total,
      page,
      limit,
      totalPages,
      distinctActions: distinctActionRows.map((r) => r.action),
    });
  } catch (err) {
    console.error('[GetAuditLogs Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
};