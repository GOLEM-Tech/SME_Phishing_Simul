'use strict';

const express = require('express');
const passport = require('passport');
const campaignController = require('../controllers/campaignController');

const router = express.Router();

// Require JWT authentication for administrative campaign management
router.use(passport.authenticate('jwt', { session: false }));

// Core Campaign CRUD
router.get('/', campaignController.getAllCampaigns);
router.post('/', campaignController.createCampaign);
router.get('/:id', campaignController.getCampaignById);
router.put('/:id', campaignController.updateCampaign);
router.delete('/:id', campaignController.deleteCampaign);

// Campaign Dispatch & Duplication
router.post('/:id/send', campaignController.sendCampaign);
router.post('/:id/launch', campaignController.sendCampaign);
router.post('/:id/duplicate', campaignController.duplicateCampaign);

// Recipient Management
router.get('/:id/recipients', campaignController.getRecipients);
router.post('/:id/recipients', campaignController.addRecipients);
router.delete('/:id/recipients/:recipientId', campaignController.removeRecipient);

module.exports = router;
