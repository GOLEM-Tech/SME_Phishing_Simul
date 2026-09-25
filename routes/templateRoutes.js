// routes/templateRoutes.js
// Email Template Library — route-to-controller bindings

const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');

// Create new simulation template
router.post('/', templateController.createTemplate);

// Retrieve all templates (summary collection)
router.get('/', templateController.getAllTemplates);

// Retrieve single template by ID
router.get('/:id', templateController.getTemplateById);

// Overwrite template metadata/HTML blocks
router.put('/:id', templateController.updateTemplate);

// Permanently remove template from inventory
router.delete('/:id', templateController.deleteTemplate);

// Compile template with sample variables — preview output
router.post('/:id/preview', templateController.previewTemplate);

module.exports = router;
