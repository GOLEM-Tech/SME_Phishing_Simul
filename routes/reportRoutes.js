'use strict';

const express = require('express');
const passport = require('passport');
const reportController = require('../controllers/reportController');

const router = express.Router();

/**
 * Middleware: Allow JWT token from either Authorization header OR ?token= query parameter.
 * This resolves the 401 Unauthorized issue when the browser opens a PDF or CSV in a new window.
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

// Campaign Dashboard Metrics
router.get('/campaign/:id', reportController.getCampaignDashboard);

// Campaign CSV Export
router.get('/campaign/:id/csv', reportController.exportCampaignCSV);

// Campaign PDF Executive Report Stream
router.get('/campaign/:id/pdf', reportController.exportCampaignPDF);

// Employee Training & Assessment Progress Report
router.get('/training-progress', reportController.getEmployeeTrainingProgress);

module.exports = router;