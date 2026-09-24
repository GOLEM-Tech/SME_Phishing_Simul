const express = require('express');

const router = express.Router();

const trainingController = require('../controllers/trainingController');

router.get('/modules', trainingController.getAllModules);
router.get('/modules/:id', trainingController.getModuleById);
router.get('/progress/:employeeId', trainingController.getEmployeeProgress);

module.exports = router;