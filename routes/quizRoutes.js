/* eslint-env node */
'use strict';

const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');

// All module and quiz endpoints
router.get('/modules', quizController.getAllModules);
router.get('/', quizController.getAllQuizzes);
router.get('/assigned/:employeeId', quizController.getAssignedQuizzesForEmployee);
router.get('/:quizId/questions', quizController.getQuizQuestions);
router.get('/employee/:employeeId', quizController.getEmployeeQuizResults);

router.post('/assign', quizController.assignQuizToEmployee);
router.post('/create', quizController.createQuiz);
router.post('/:quizId/submit', quizController.submitQuiz);

module.exports = router;