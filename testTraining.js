require('dotenv').config();

const express = require('express');
const trainingRoutes = require('./routes/trainingRoutes');

const app = express();

app.use(express.json());

// Dev 2 Training Routes
app.use('/api/training', trainingRoutes);

const PORT = 3001;

app.listen(PORT, '127.0.0.1', () => {
    console.log('====================================');
    console.log(`Training test server is running on http://127.0.0.1:${PORT}`);
    console.log(`Training API: http://127.0.0.1:${PORT}/api/training/modules`);
    console.log('====================================');
});

