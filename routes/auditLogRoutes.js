// routes/auditLogRoutes.js
const express = require('express');
const router = express.Router();
const passport = require('passport');
const { getAuditLogs } = require('../controllers/auditLogController');

// All audit log endpoints require Admin JWT authentication
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  getAuditLogs
);

module.exports = router;