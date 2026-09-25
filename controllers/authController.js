const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendPasswordResetEmail } = require('../utils/mailer');

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        const [existing] = await pool.execute('SELECT id FROM Users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Email already registered.' });
        }

        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        const [result] = await pool.execute(
            'INSERT INTO Users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [name, email, password_hash, 'Admin']
        );

        res.status(201).json({
            message: 'Admin registered successfully.',
            userId: result.insertId
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const [rows] = await pool.execute('SELECT * FROM Users WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET || 'super_secret_key',
            { expiresIn: '8h' }
        );

        res.status(200).json({
            message: 'Login successful.',
            token: `Bearer ${token}`,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required.' });
        }

        const [users] = await pool.execute('SELECT id, email FROM Users WHERE email = ?', [email]);

        // Return a generic response even if email is missing to prevent user enumeration
        if (users.length === 0) {
            return res.status(200).json({
                message: 'If an account exists with that email, a password reset link has been dispatched.'
            });
        }

        const user = users[0];

        // 32-byte raw token sent in email; SHA-256 hash stored in DB
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        // Token expires in 1 hour
        const expiry = new Date(Date.now() + 60 * 60 * 1000);

        await pool.execute(
            'UPDATE Users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
            [hashedToken, expiry, user.id]
        );

        await sendPasswordResetEmail(user.email, rawToken);

        res.status(200).json({
            message: 'If an account exists with that email, a password reset link has been dispatched.'
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Token and newPassword are required.' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const [users] = await pool.execute(
            'SELECT id FROM Users WHERE reset_token = ? AND reset_token_expiry > NOW()',
            [hashedToken]
        );

        if (users.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired password reset token.' });
        }

        const user = users[0];
        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password and invalidate the token
        await pool.execute(
            'UPDATE Users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
            [newPasswordHash, user.id]
        );

        res.status(200).json({
            message: 'Password has been successfully reset. You may now log in.'
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
};