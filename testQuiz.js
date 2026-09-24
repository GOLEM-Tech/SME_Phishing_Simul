require('dotenv').config();

const express = require('express');
const quizRoutes = require('./routes/quizRoutes');

const app = express();

app.use(express.json());

// Dev 2 Quiz Routes
app.use('/api/quiz', quizRoutes);

const PORT = 3002;

app.listen(PORT, '127.0.0.1', () => {
    console.log('====================================');
    console.log(`Quiz test server is running on http://127.0.0.1:${PORT}`);
    console.log(`Quiz API: http://127.0.0.1:${PORT}/api/quiz/module/1`);
    console.log('====================================');
});