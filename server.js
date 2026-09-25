'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('./config/passport');

// Route Handlers
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const reportRoutes = require('./routes/reportRoutes');
const templateRoutes = require('./routes/templateRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const landingRoutes = require('./routes/landingRoutes');

const app = express();

// Standard Parsers & Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// Static Testing Console / Frontend Shell
app.use(express.static(path.join(__dirname, 'public')));

// Core Administrative & Reporting APIs
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/campaigns', campaignRoutes);

// Simulation Landing Pages & Submission Interceptors
app.use('/', landingRoutes);

// Health Check Probe
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Server is up and running!' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
