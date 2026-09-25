'use strict';

const express = require('express');
const passport = require('passport');
const campaignController = require('../controllers/campaignController');

const router = express.Router();

// Require Admin JWT for campaign orchestration
router.use(passport.authenticate('jwt', { session: false }));

router.post('/', campaignController.createCampaign);
router.get('/', campaignController.getCampaigns);
router.get('/:id', campaignController.getCampaignById);
router.put('/:id', campaignController.updateCampaign);
router.delete('/:id', campaignController.deleteCampaign);
router.post('/:id/duplicate', campaignController.duplicateCampaign);

module.exports = router;
