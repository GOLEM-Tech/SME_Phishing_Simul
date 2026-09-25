const express = require('express');
const passport = require('passport');
const analyticsController = require('../controllers/analyticsController');

const router = express.Router();

// Administrative analytics are restricted via Passport JWT
router.use(passport.authenticate('jwt', { session: false }));

// Temporal heatmap aggregation (Hour vs Day of week)
router.get('/heatmap', analyticsController.getEmailHeatmap);

// Cross-department vulnerability comparison matrix
router.get('/departments', analyticsController.getDepartmentComparative);

module.exports = router;