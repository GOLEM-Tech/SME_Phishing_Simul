// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Initialize Express app
const app = express();

// Standard Middleware
app.use(cors()); // Allows your frontend to communicate with this backend
app.use(express.json()); // Parses incoming JSON payloads

// Basic Health Check Route (Just to verify the server is running)
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Server is up and running!' });
});

// Set the port
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});