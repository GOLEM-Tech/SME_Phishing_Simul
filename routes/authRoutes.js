const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');

// Public endpoints
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected verification endpoint
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