'use strict';

const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const authController = require('../controllers/authController');

// Standard Credential Authentication & Recovery
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/onboarding', authController.completeOnboarding);

// Protected Verification Route
router.get(
  '/me',
  passport.authenticate('jwt', { session: false }),
  authController.getMe
);

// --- Google OAuth Routes ---
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=oauth_failed', session: false }),
  (req, res) => {
    const sessionId = 'sess_' + crypto.randomBytes(16).toString('hex');
    const token = jwt.sign(
      {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role || 'Employee',
        sessionId,
      },
      process.env.JWT_SECRET || 'super_secret_key',
      { expiresIn: '8h' }
    );

    const redirectPath = req.user.role === 'Admin' ? '/admin' : '/employee';
    res.redirect(`${redirectPath}?oauth_token=Bearer%20${token}&session_id=${sessionId}`);
  }
);

// --- GitHub OAuth Routes ---
router.get(
  '/github',
  passport.authenticate('github', { scope: ['user:email'], session: false })
);

router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: '/login?error=oauth_failed', session: false }),
  (req, res) => {
    const sessionId = 'sess_' + crypto.randomBytes(16).toString('hex');
    const token = jwt.sign(
      {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role || 'Employee',
        sessionId,
      },
      process.env.JWT_SECRET || 'super_secret_key',
      { expiresIn: '8h' }
    );

    const redirectPath = req.user.role === 'Admin' ? '/admin' : '/employee';
    res.redirect(`${redirectPath}?oauth_token=Bearer%20${token}&session_id=${sessionId}`);
  }
);

module.exports = router;