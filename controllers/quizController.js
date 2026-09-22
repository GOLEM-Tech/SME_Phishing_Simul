const db = require('../config/db');

/**
 * GET /api/quiz/module/:moduleId
 * Get a quiz and its questions for a training module.
 */
const getQuizByModule = async (req, res) => {
    try {
        const moduleId = Number(req.params.moduleId);

        if (!Number.isInteger(moduleId) || moduleId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid training module ID'
            });
        }

        const [quizzes] = await db.execute(
            `SELECT
                id,
                module_id,
                title,
                pass_score
             FROM Quizzes
             WHERE module_id = ?
             LIMIT 1`,
            [moduleId]
        );

        if (quizzes.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found for this training module'
            });
        }

        const quiz = quizzes[0];

        const [questions] = await db.execute(
            `SELECT
                id,
                question,
                option_a,
                option_b,
                option_c,
                option_d
             FROM QuizQuestions
             WHERE quiz_id = ?
             ORDER BY id ASC`,
            [quiz.id]
        );

        res.status(200).json({
            success: true,
            data: {
                id: quiz.id,
                module_id: quiz.module_id,
                title: quiz.title,
                pass_score: quiz.pass_score,
                questions: questions
            }
        });

    } catch (error) {
        console.error('Error fetching quiz:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to fetch quiz'
        });
    }
};


/**
 * POST /api/quiz/submit
 * Submit quiz answers, calculate the score,
 * and save the result in QuizResults.
 *
 * Expected request body:
 * {
 *   "quiz_id": 117,
 *   "answers": {
 *      "37": "A",
 *      "38": "B",
 *      "39": "A"
 *   }
 * }
 */
const submitQuiz = async (req, res) => {
    try {
        const { quiz_id, answers } = req.body;

        const quizId = Number(quiz_id);

        if (!Number.isInteger(quizId) || quizId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid quiz ID'
            });
        }

        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
            return res.status(400).json({
                success: false,
                message: 'Answers must be provided as an object'
            });
        }

        // Check that the quiz exists.
        const [quizzes] = await db.execute(
            `SELECT
                id,
                title,
                pass_score
             FROM Quizzes
             WHERE id = ?`,
            [quizId]
        );

        if (quizzes.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }

        const quiz = quizzes[0];

        // Get correct answers from the database.
        const [questions] = await db.execute(
            `SELECT
                id,
                correct_option
             FROM QuizQuestions
             WHERE quiz_id = ?
             ORDER BY id ASC`,
            [quizId]
        );

        if (questions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No questions found for this quiz'
            });
        }

        let correctAnswers = 0;

        for (const question of questions) {
            const submittedAnswer = String(answers[question.id] || '')
                .trim()
                .toUpperCase();

            const correctAnswer = String(question.correct_option)
                .trim()
                .toUpperCase();

            if (submittedAnswer === correctAnswer) {
                correctAnswers++;
            }
        }

        const totalQuestions = questions.length;

        const score = Math.round(
            (correctAnswers / totalQuestions) * 100
        );

        const passed = score >= quiz.pass_score;

        // Save quiz result.
        const [result] = await db.execute(
            `INSERT INTO QuizResults
                (quiz_id, score, passed)
             VALUES (?, ?, ?)`,
            [quiz.id, score, passed]
        );

        res.status(200).json({
            success: true,
            message: 'Quiz evaluated and result saved successfully',
            result: {
                result_id: result.insertId,
                quiz_id: quiz.id,
                quiz_title: quiz.title,
                total_questions: totalQuestions,
                correct_answers: correctAnswers,
                score: score,
                pass_score: quiz.pass_score,
                passed: passed
            }
        });

    } catch (error) {
        console.error('Error submitting quiz:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to evaluate quiz'
        });
    }
};


module.exports = {
    getQuizByModule,
    submitQuiz
};