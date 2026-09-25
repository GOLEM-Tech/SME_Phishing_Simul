'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('./config/passport');

// Core Controllers (Needed for background automation engine)
const campaignController = require('./controllers/campaignController');

// Route Handlers
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const reportRoutes = require('./routes/reportRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const templateRoutes = require('./routes/templateRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const landingRoutes = require('./routes/landingRoutes');
const aiRoutes = require('./routes/aiRoutes');

// 1. Initialize Express App
const app = express();

// 2. Standard Parsers & Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required for simulated credential submissions
app.use(passport.initialize());

// 3. Static Testing Console / Frontend Shell
app.use(express.static(path.join(__dirname, 'public')));

// 4. Public Target Interception & Tracking Routes (No JWT)
app.use('/api/track', trackingRoutes);
app.use('/', landingRoutes);

// 5. Protected Administrative, Simulation, and Reporting APIs
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/ai', aiRoutes);

// 6. System Health Check Probe
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Server is up and running!' });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);

  // Background automation worker: runs every 60 seconds to fire scheduled campaigns
  setInterval(() => {
    if (typeof campaignController.runScheduledCampaignsEngine === 'function') {
      campaignController.runScheduledCampaignsEngine();
    }
  }, 60 * 1000);
});

module.exports = server;