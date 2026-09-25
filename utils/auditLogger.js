const pool = require('../config/db');

/**
 * Log an administrative event to AuditLogs
 * @param {number|null} userId - The admin's user ID from req.user
 * @param {string} action - Brief description (e.g., 'EMPLOYEE_CREATED', 'CSV_IMPORTED')
 * @param {string|object} details - Metadata or context about the action
 * @param {string} ipAddress - Client IP
 */
const logAction = async (userId, action, details, ipAddress) => {
  try {
    const formattedDetails = typeof details === 'object' ? JSON.stringify(details) : String(details);
    
    await pool.execute(
      'INSERT INTO AuditLogs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId || null, action, formattedDetails, ipAddress || null]
    );
  } catch (err) {
    // Audit log failures should never crash the main application process
    console.error('Failed to write audit log:', err.message);
  }
};

module.exports = logAction;