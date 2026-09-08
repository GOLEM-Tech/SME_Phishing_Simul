require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('./config/passport');
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const trackingRoutes = require('./routes/trackingRoutes');

const app = express();

// Standard Middleware
app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// Serve static testbed from public folder
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/track', trackingRoutes);

// Health Check Route
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Server is up and running!' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});