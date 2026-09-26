const express = require('express');

const router = express.Router();

const riskController = require('../controllers/riskController');

// POST /api/risk/calculate
router.post('/calculate', riskController.calculateRiskScore);

module.exports = router;