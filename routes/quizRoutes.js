'use strict';

const express = require('express');
const quizController = require('../controllers/quizController');

const router = express.Router();

// GET /api/quizzes - List all modules & quizzes
router.get('/', quizController.getAllQuizzes);

// GET /api/quizzes/employee/:employeeId - Get live personal progress for an employee
router.get('/employee/:employeeId', quizController.getEmployeePersonalData);

// POST /api/quizzes/create - Admin creates a new module, quiz, and multiple MCQ questions
router.post('/create', quizController.createQuizWithModule);

// POST /api/quizzes/assign - Admin assigns a quiz to employee/department & sends email
router.post('/assign', quizController.assignQuizToEmployees);

// GET /api/quizzes/:id - Fetch quiz questions
router.get('/:id', quizController.getQuizById);

// POST /api/quizzes/:id/submit - Submit and grade quiz answers
router.post('/:id/submit', quizController.submitQuiz);

module.exports = router;