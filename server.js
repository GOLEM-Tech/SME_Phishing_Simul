/* eslint-env node */
'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('./config/passport');

const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const reportRoutes = require('./routes/reportRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const templateRoutes = require('./routes/templateRoutes');
const landingRoutes = require('./routes/landingRoutes');
const aiRoutes = require('./routes/aiRoutes');
const quizRoutes = require('./routes/quizRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');

const app = express();

// Standard Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// Static assets (JS, CSS, images) — index: false so "/" routes to /login
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/audit-logs', auditLogRoutes);

// Phishing Landing Page Clones & Interceptors (/login/:slug, /landing-page)
app.use('/', landingRoutes);

// --- Dedicated Multi-Page Application HTML Routes (Issue #1) ---
app.get('/', (req, res) => {
  // Preserve OAuth query parameters if callback hits root
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/login${query}`);
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/employee', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'employee.html'));
});

app.get('/onboarding', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'onboarding.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'SME Phishing Simulator is running.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`  ├── Employee / Unified Login : http://localhost:${PORT}/login`);
  console.log(`  ├── Admin SOC Login          : http://localhost:${PORT}/admin-login`);
  console.log(`  ├── Admin SOC Console        : http://localhost:${PORT}/admin`);
  console.log(`  └── Employee Training Portal : http://localhost:${PORT}/employee`);
});