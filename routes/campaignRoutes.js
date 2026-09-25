// Campaign routes — maps RESTful endpoints to controller handlers
'use strict';

const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');

// Create draft campaign
router.post('/', campaignController.createCampaign);

// Retrieve all campaigns (supports pagination via query params)
router.get('/', campaignController.getCampaigns);

// Retrieve single campaign by primary key
router.get('/:id', campaignController.getCampaignById);

// Update campaign metadata (state-restricted inside controller)
router.put('/:id', campaignController.updateCampaign);

// Delete campaign (non-running records only — enforced in controller)
router.delete('/:id', campaignController.deleteCampaign);

// Deep-copy duplication — produces independent campaign clone
router.post('/:id/duplicate', campaignController.duplicateCampaign);

module.exports = router;
