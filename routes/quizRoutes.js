'use strict';

const express = require('express');
const quizController = require('../controllers/quizController');

const router = express.Router();

// GET /api/quizzes - List quizzes (filtered by employee role & assignment status)
router.get('/', quizController.getAllQuizzes);

// GET /api/quizzes/modules - List all 5 curriculum study modules
router.get('/modules', quizController.getAllModules);

// GET /api/quizzes/assigned/:employeeId - List pending assigned quizzes
router.get('/assigned/:employeeId', quizController.getAssignedQuizzesForEmployee);

// GET /api/quizzes/employee/:employeeId - Progress summary for an employee
router.get('/employee/:employeeId', quizController.getEmployeePersonalData);

// GET /api/quizzes/results/:employeeId - Quiz attempt history
router.get('/results/:employeeId', quizController.getEmployeeQuizResults);

// POST /api/quizzes/create - Create quiz and training module
router.post('/create', quizController.createQuiz);

// POST /api/quizzes/assign - Assign quiz to employee & dispatch isolated link
router.post('/assign', quizController.assignQuizToEmployee);

// GET /api/quizzes/:quizId/questions - Get specific quiz questions
router.get('/:quizId/questions', quizController.getQuizQuestions);

// GET /api/quizzes/:id - Alias for quiz questions
router.get('/:id', quizController.getQuizById);

// POST /api/quizzes/:quizId/submit - Grade and record submission
router.post('/:quizId/submit', quizController.submitQuiz);

// POST /api/quizzes/:id/submit - Alias for grading submission
router.post('/:id/submit', quizController.submitQuiz);

module.exports = router;