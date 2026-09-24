const express = require('express');
const passport = require('passport');
const reportController = require('../controllers/reportController');

const router = express.Router();

// Reporting data is only available to authenticated administrators.
router.use(passport.authenticate('jwt', { session: false }));

router.get('/campaign/:id', reportController.getCampaignDashboard);

module.exports = router;
