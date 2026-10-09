'use strict';

const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/trackingController');

// 1x1 Transparent Pixel & CSS Beacon Open Tracker
router.get('/open/:token', trackingController.trackOpen);

// Webmail "View in Browser" Open Tracker (100% reliable on localhost)
router.get('/view/:token', trackingController.trackViewInBrowser);

// Phishing Link Click Redirect Tracker
router.get('/click/:token', trackingController.trackClick);

module.exports = router;