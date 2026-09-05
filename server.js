require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('./config/passport');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Standard Middleware
app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// API Routes
app.use('/api/auth', authRoutes);

// Health Check Route
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Server is up and running!' });
});

app.get('/', (req, res) => {
  res.status(200).send('Phishing Simulation API is active and running.');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});