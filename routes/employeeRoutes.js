const express = require('express');
const router = express.Router();
const passport = require('passport');
const multer = require('multer');
const path = require('path');
const employeeController = require('../controllers/employeeController');
const auditMiddleware = require('../middleware/auditMiddleware'); // <-- 1. IMPORT HERE

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
router.use(auditMiddleware); // <-- 2. MOUNT HERE (Captures state changes for authenticated admins)

router.post('/upload-csv', upload.single('file'), employeeController.uploadCSV);
router.post('/', employeeController.createEmployee);
router.get('/', employeeController.getAllEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.put('/:id', employeeController.updateEmployee);
router.delete('/:id', employeeController.deleteEmployee);

module.exports = router;