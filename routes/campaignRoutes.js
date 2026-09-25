'use strict';

const express = require('express');
const passport = require('passport');
const campaignController = require('../controllers/campaignController');

const router = express.Router();

// Require Admin JWT for all campaign operations
router.use(passport.authenticate('jwt', { session: false }));

// Campaign Core CRUD & Dispatch
router.post('/', campaignController.createCampaign);
router.get('/', campaignController.getCampaigns);
router.get('/:id', campaignController.getCampaignById);
router.put('/:id', campaignController.updateCampaign);
router.delete('/:id', campaignController.deleteCampaign);
router.post('/:id/duplicate', campaignController.duplicateCampaign);
router.post('/:id/send', campaignController.sendCampaign);
router.post('/:id/cancel', campaignController.cancelCampaign);

// Target Recipient Management Routes
router.post('/:id/recipients', campaignController.addRecipients);
router.get('/:id/recipients', campaignController.getRecipients);
router.delete('/:id/recipients/:recipientId', campaignController.removeRecipient);

module.exports = router;
