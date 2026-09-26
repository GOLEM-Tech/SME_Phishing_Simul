'use strict';

const express = require('express');
const router = express.Router();
const passport = require('passport');
const multer = require('multer');
const path = require('path');
const employeeController = require('../controllers/employeeController');
const auditMiddleware = require('../middleware/auditMiddleware');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Only .csv files are allowed.'));
    }
    cb(null, true);
  }
});

// Protect all employee routes with JWT via Passport
router.use(passport.authenticate('jwt', { session: false }));
if (typeof auditMiddleware === 'function') {
  router.use(auditMiddleware);
}

// Pending OAuth Approvals routes
router.get('/pending', employeeController.getPendingEmployees);
router.put('/:id/approve', employeeController.approveEmployee);

// Standard Employee CRUD & CSV Import
router.post('/upload-csv', upload.single('file'), employeeController.uploadCSV);
router.post('/', employeeController.createEmployee);
router.get('/', employeeController.getAllEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.put('/:id', employeeController.updateEmployee);
router.delete('/:id', employeeController.deleteEmployee);

module.exports = router;  