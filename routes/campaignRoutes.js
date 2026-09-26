'use strict';

const express = require('express');
const passport = require('passport');
const campaignController = require('../controllers/campaignController');

const router = express.Router();

// Require Admin JWT for campaign administration
router.use(passport.authenticate('jwt', { session: false }));

// Core Campaign CRUD
router.post('/', campaignController.createCampaign);
router.get('/', campaignController.getCampaigns);
router.get('/:id', campaignController.getCampaignById);
router.put('/:id', campaignController.updateCampaign);
router.delete('/:id', campaignController.deleteCampaign);

// Campaign Dispatch & Duplication
router.post('/:id/send', campaignController.sendCampaign);
router.post('/:id/duplicate', campaignController.duplicateCampaign);

// Recipient Management
router.post('/:id/recipients', campaignController.addRecipients);
router.get('/:id/recipients', campaignController.getRecipients);
router.delete('/:id/recipients/:recipientId', campaignController.removeRecipient);

module.exports = router;
