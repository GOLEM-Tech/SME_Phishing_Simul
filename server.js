require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

// Standard Middleware
app.use(cors());
app.use(express.json());

// Serve frontend files from the public folder
app.use(express.static('public'));

// Health Check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Server is up and running!'
    });
});

// Port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});