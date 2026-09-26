'use strict';

const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const authController = require('../controllers/authController');

// Helper to issue JWT and redirect OAuth users with their role & onboarding status
function handleOAuthCallbackRedirect(req, res) {
  const user = req.user;
  const payload = {
    id: user.id,
    employeeId: user.employeeId || user.id,
    email: user.email,
    role: user.role || 'Employee'
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET || 'super_secret_key', {
    expiresIn: '8h'
  });

  const encodedToken = encodeURIComponent(`Bearer ${token}`);
  const encodedUser = encodeURIComponent(JSON.stringify(user));

  return res.redirect(`/?oauth_token=${encodedToken}&oauth_user=${encodedUser}`);
}

// Standard credential routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Password recovery routes
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// OAuth Employee Department Selection (Onboarding)
router.post(
  '/oauth-onboarding',
  passport.authenticate('jwt', { session: false }),
  authController.completeOAuthOnboarding
);

// Google OAuth 2.0 Routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/?oauth_error=true' }),
  handleOAuthCallbackRedirect
);

// GitHub OAuth 2.0 Routes
router.get('/github', passport.authenticate('github', { scope: ['user:email'], session: false }));
router.get(
  '/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/?oauth_error=true' }),
  handleOAuthCallbackRedirect
);

// Protected verification route
router.get(
  '/protected',
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    res.status(200).json({
      message: 'Access granted to protected resource.',
      user: req.user
    });
  }
);

module.exports = router;