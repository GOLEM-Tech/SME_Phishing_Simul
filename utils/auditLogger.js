/* eslint-env node */
'use strict';

const pool = require('../config/db');

/**
 * Universal Audit Logging Helper
 * Supports both object parameter ({ userId, action, details, ipAddress, sessionId, actorEmail, role })
 * and positional parameters (userId, action, details, ipAddress).
 */
const logAction = async (...args) => {
  try {
    let userId = null;
    let sessionId = null;
    let actorEmail = null;
    let role = null;
    let action = 'UNKNOWN_ACTION';
    let details = {};
    let ipAddress = '127.0.0.1';

    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      const opts = args[0];
      userId = opts.userId || opts.user_id || null;
      sessionId = opts.sessionId || opts.session_id || null;
      actorEmail = opts.actorEmail || opts.actor_email || null;
      role = opts.role || 'Admin';
      action = opts.action || 'GENERIC_ACTION';
      details = opts.details || {};
      ipAddress = opts.ipAddress || opts.ip_address || '127.0.0.1';
    } else {
      userId = args[0] || null;
      action = args[1] || 'GENERIC_ACTION';
      details = args[2] || {};
      ipAddress = args[3] || '127.0.0.1';
    }

    const formattedDetails = typeof details === 'object' ? JSON.stringify(details) : String(details);

    await pool.execute(
      `INSERT INTO AuditLogs (user_id, session_id, actor_email, role, action, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, sessionId, actorEmail, role, action, formattedDetails, ipAddress]
    );
  } catch (err) {
    // Audit log failures should not crash application processes
    console.warn('[AuditLogger Notice]:', err.message);
  }
};

// Export as both callable function and object with .log/.logAction methods
logAction.log = logAction;
logAction.logAction = logAction;
module.exports = logAction;