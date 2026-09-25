'use strict';

const express = require('express');
const passport = require('passport');
const aiController = require('../controllers/aiController');

const router = express.Router();

// AI features require Admin JWT authentication
router.use(passport.authenticate('jwt', { session: false }));

// POST /api/ai/generate-email
router.post('/generate-email', aiController.generateEmailTemplate);

// GET /api/ai/risk-analysis
router.get('/risk-analysis', aiController.getRiskAnalysisAndRecommendations);

module.exports = router;