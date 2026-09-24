const express = require('express');

const router = express.Router();

const quizController = require('../controllers/quizController');

// Get quiz for a training module
router.get('/module/:moduleId', quizController.getQuizByModule);

// Submit quiz answers and calculate score
router.post('/submit', quizController.submitQuiz);

module.exports = router;