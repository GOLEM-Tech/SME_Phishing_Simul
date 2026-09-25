const express = require('express');
const passport = require('passport');
const reportController = require('../controllers/reportController');

const router = express.Router();

// Reporting data is strictly restricted to authenticated administrators
router.use(passport.authenticate('jwt', { session: false }));

// Campaign Dashboard Metrics & Visual Data
router.get('/campaign/:id', reportController.getCampaignDashboard);

// Campaign CSV Export Stream
router.get('/campaign/:id/csv', reportController.exportCampaignCSV);

module.exports = router;