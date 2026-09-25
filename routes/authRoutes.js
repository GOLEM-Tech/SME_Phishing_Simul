const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');

// Existing Public Endpoints
router.post('/register', authController.register);
router.post('/login', authController.login);

// New Public Account Recovery Endpoints
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Existing Protected Token Verification
router.get(
  '/protected',
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    res.status(200).json({
      message: 'Passport authentication successful. Access granted.',
      user: req.user
    });
  }
);

module.exports = router;