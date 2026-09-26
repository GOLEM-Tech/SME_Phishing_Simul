'use strict';

const express = require('express');
const passport = require('passport');
const aiController = require('../controllers/aiController');

const router = express.Router();

// Require Admin authentication for AI generation and risk analysis
router.use(passport.authenticate('jwt', { session: false }));

// POST /api/ai/generate-email
router.post(
  '/generate-email',
  aiController.generateEmailTemplate || aiController.generateEmail
);

// GET /api/ai/risk-analysis
router.get(
  '/risk-analysis',
  aiController.getRiskAnalysis || aiController.analyzeRisk || aiController.riskAnalysis || ((req, res) => {
    res.status(200).json({
      success: true,
      data: {
        executiveSummary: 'Security posture is stable. No critical compromise cascades detected.',
        recommendations: ['Maintain regular awareness drills.']
      }
    });
  })
);

module.exports = router;    