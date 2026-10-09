'use strict';

const express = require('express');
const router = express.Router();
const passport = require('passport');
const multer = require('multer');
const path = require('path');
const employeeController = require('../controllers/employeeController');

// Configure temporary disk storage for Multer
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Only .csv files are allowed.'));
    }
    cb(null, true);
  },
});

// Protect all employee endpoints with JWT
router.use(passport.authenticate('jwt', { session: false }));

// CSV Bulk Upload Endpoint
router.post('/upload-csv', upload.single('file'), employeeController.uploadCSV);

// Core CRUD Endpoints
router.post('/', employeeController.createEmployee);
router.get('/', employeeController.getAllEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.put('/:id', employeeController.updateEmployee);
router.delete('/:id', employeeController.deleteEmployee);

module.exports = router;