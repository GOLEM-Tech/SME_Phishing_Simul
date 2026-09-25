const express = require('express');
const passport = require('passport');
const reportController = require('../controllers/reportController');

const router = express.Router();

// All reporting endpoints require Admin JWT authentication
router.use(passport.authenticate('jwt', { session: false }));

// Campaign Dashboard Metrics & Visual Data
router.get('/campaign/:id', reportController.getCampaignDashboard);

// Campaign CSV Export Stream
router.get('/campaign/:id/csv', reportController.exportCampaignCSV);

// Campaign PDF Executive Report Stream
router.get('/campaign/:id/pdf', reportController.exportCampaignPDF);

module.exports = router;