require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('./config/passport');

// Existing Routes
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');

// Dev 2: Training Engine Routes
const trainingRoutes = require('./routes/trainingRoutes');

const app = express();

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// Serve public folder
app.use(express.static(path.join(__dirname, 'public')));

// ===============================
// API ROUTES
// ===============================
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/audit-logs', auditLogRoutes);

// Dev 2: Training
app.use('/api/training', trainingRoutes);

// ===============================
// HEALTH CHECK
// ===============================
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Server is up and running!'
    });
});

// ===============================
// SERVER
// ===============================
const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
    console.log('====================================');
    console.log(`Server is running on http://${HOST}:${PORT}`);
    console.log(`Health check: http://${HOST}:${PORT}/api/health`);
    console.log('====================================');
});

// Show the REAL error if the port cannot be opened
server.on('error', (error) => {
    console.error('====================================');
    console.error('SERVER FAILED TO START');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('====================================');
});