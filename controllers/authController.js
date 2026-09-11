const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

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