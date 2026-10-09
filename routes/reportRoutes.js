/* eslint-env node */
'use strict';

const express = require('express');
const passport = require('passport');
const reportController = require('../controllers/reportController');

const router = express.Router();

/**
 * Middleware: Allow JWT token from either the Authorization header OR a ?token= query parameter.
 * This ensures PDF and CSV streams trigger seamlessly when launched in fresh tabs or window.open().
 */
router.use((req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    const raw = req.query.token.startsWith('Bearer ') ? req.query.token : `Bearer ${req.query.token}`;
    req.headers.authorization = raw;
  }
  next();
});

// Require Admin JWT authentication
router.use(passport.authenticate('jwt', { session: false }));

// Organization-Wide Executive Overview Routes
router.get('/overview', reportController.getExecutiveOverview);

// Campaign & Aggregated Dashboard Metrics
router.get('/campaign/:id', reportController.getCampaignDashboard);

// CSV Data Exports (Supports both :id and 'all')
router.get('/campaign/:id/csv', reportController.exportCampaignCSV);

// PDF Executive Reports (Supports both :id and 'all')
router.get('/campaign/:id/pdf', reportController.exportCampaignPDF);

// Training Assessment Matrix & Remediation Report
router.get('/training-progress', reportController.getEmployeeTrainingProgress);

module.exports = router;