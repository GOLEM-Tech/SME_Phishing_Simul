'use strict';

const express = require('express');
const passport = require('passport');
const templateController = require('../controllers/templateController');

const router = express.Router();

// Administrative authentication required
router.use(passport.authenticate('jwt', { session: false }));

router.post('/', templateController.createTemplate);
router.get('/', templateController.getAllTemplates);
router.get('/:id', templateController.getTemplateById);
router.put('/:id', templateController.updateTemplate);
router.delete('/:id', templateController.deleteTemplate);
router.post('/:id/preview', templateController.previewTemplate);

module.exports = router;
