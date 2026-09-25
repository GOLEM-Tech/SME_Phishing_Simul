// controllers/auditLogController.js
const pool = require('../config/db');

/**
 * GET /api/audit-logs
 * Retrieves paginated audit logs with actor details.
 * Query params: ?page=1&limit=20
 */
const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    // Fetch total count for pagination metadata
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) AS total FROM AuditLogs'
    );
    const totalRecords = countResult[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    // Fetch paginated records joining Users to get actor details
    // Note: In mysql2/promise, LIMIT and OFFSET parameters should be passed as integers or cast
    const query = `
      SELECT 
        a.id,
        a.user_id,
        u.name AS user_name,
        u.email AS user_email,
        a.action,
        a.details,
        a.ip_address,
        a.created_at
      FROM AuditLogs a
      LEFT JOIN Users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;

    // String conversion or numeric parameters in pool.query/execute
    const [rows] = await pool.query(query, [limit, offset]);

    return res.status(200).json({
      success: true,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit
      },
      data: rows
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving audit logs.'
    });
  }
};

module.exports = {
  getAuditLogs
};