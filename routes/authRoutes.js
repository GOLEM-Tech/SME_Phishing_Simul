'use strict';

const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const authController = require('../controllers/authController');

// Standard Credential Authentication & Recovery
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Protected Verification Route
router.get(
  '/protected',
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    res.status(200).json({
      message: 'Passport authentication successful. Access granted.',
      user: req.user,
    });
  }
);

// --- Google OAuth Routes ---
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=oauth_failed', session: false }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user.id, role: req.user.role },
      process.env.JWT_SECRET || 'super_secret_key',
      { expiresIn: '8h' }
    );
    res.redirect(`/?oauth_token=Bearer%20${token}`);
  }
);

// --- GitHub OAuth Routes ---
router.get(
  '/github',
  passport.authenticate('github', { scope: ['user:email'], session: false })
);

router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: '/?error=oauth_failed', session: false }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user.id, role: req.user.role },
      process.env.JWT_SECRET || 'super_secret_key',
      { expiresIn: '8h' }
    );
    res.redirect(`/?oauth_token=Bearer%20${token}`);
  }
);

module.exports = router;