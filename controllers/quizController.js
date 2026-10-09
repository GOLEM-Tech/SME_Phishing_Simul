/* eslint-env node */
'use strict';

const pool = require('../config/db');
const auditLogger = require('../utils/auditLogger');
const { recalculateEmployeeRisk } = require('../utils/riskEngine');

// GET /api/quizzes/modules
exports.getAllModules = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, title, content, created_at FROM TrainingModules ORDER BY id ASC');
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[quizController.getAllModules]:', error);
    return res.status(500).json({ error: 'Failed to fetch training modules.' });
  }
};

// GET /api/quizzes
exports.getAllQuizzes = async (req, res) => {
  try {
    const employeeId = req.query.employee_id || req.query.employeeId;

    if (employeeId) {
      const [assignedRows] = await pool.execute(`
        SELECT 
          q.id,
          q.module_id,
          q.title,
          q.pass_score,
          qa.status,
          qa.assigned_at,
          (SELECT COUNT(*) FROM QuizQuestions qq WHERE qq.quiz_id = q.id) AS question_count
        FROM QuizAssignments qa
        INNER JOIN Quizzes q ON q.id = qa.quiz_id
        WHERE qa.employee_id = ? AND qa.status = 'Pending'
        ORDER BY qa.assigned_at DESC
      `, [employeeId]);

      return res.status(200).json(assignedRows);
    }

    const [rows] = await pool.execute(`
      SELECT 
        q.id,
        q.module_id,
        q.title,
        q.pass_score,
        tm.title AS module_title,
        (SELECT COUNT(*) FROM QuizQuestions qq WHERE qq.quiz_id = q.id) AS question_count
      FROM Quizzes q
      LEFT JOIN TrainingModules tm ON tm.id = q.module_id
      ORDER BY q.id ASC
    `);

    return res.status(200).json(rows);
  } catch (error) {
    console.error('[quizController.getAllQuizzes]:', error);
    return res.status(500).json({ error: 'Failed to fetch quizzes.' });
  }
};

// GET /api/quizzes/assigned/:employeeId
exports.getAssignedQuizzesForEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const [rows] = await pool.execute(`
      SELECT 
        q.id,
        q.module_id,
        q.title,
        q.pass_score,
        qa.status,
        qa.assigned_at,
        (SELECT COUNT(*) FROM QuizQuestions qq WHERE qq.quiz_id = q.id) AS question_count
      FROM QuizAssignments qa
      INNER JOIN Quizzes q ON q.id = qa.quiz_id
      WHERE qa.employee_id = ? AND qa.status = 'Pending'
      ORDER BY qa.assigned_at DESC
    `, [employeeId]);

    return res.status(200).json({ assignedQuizzes: rows, quizzes: rows });
  } catch (error) {
    console.error('[quizController.getAssignedQuizzesForEmployee]:', error);
    return res.status(500).json({ error: 'Failed to fetch assigned quizzes.' });
  }
};

// GET /api/quizzes/:quizId/questions
exports.getQuizQuestions = async (req, res) => {
  try {
    const quizId = parseInt(req.params.quizId, 10);
    const [quizRows] = await pool.execute(`
      SELECT q.id, q.title, q.pass_score, tm.content AS module_content
      FROM Quizzes q
      LEFT JOIN TrainingModules tm ON tm.id = q.module_id
      WHERE q.id = ?
      LIMIT 1
    `, [quizId]);

    if (quizRows.length === 0) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    const [questionRows] = await pool.execute(`
      SELECT id, quiz_id, question, option_a, option_b, option_c, option_d
      FROM QuizQuestions
      WHERE quiz_id = ?
      ORDER BY id ASC
    `, [quizId]);

    return res.status(200).json({
      quiz: quizRows[0],
      questions: questionRows
    });
  } catch (error) {
    console.error('[quizController.getQuizQuestions]:', error);
    return res.status(500).json({ error: 'Failed to fetch quiz questions.' });
  }
};

// POST /api/quizzes/assign
exports.assignQuizToEmployee = async (req, res) => {
  try {
    const employee_id = req.body.employee_id || req.body.employeeId;
    const quiz_id = req.body.quiz_id || req.body.quizId;

    if (!employee_id || !quiz_id) {
      return res.status(400).json({ success: false, message: 'Both employee_id and quiz_id are required.' });
    }

    let assigned_by = req.user?.id || null;
    if (!assigned_by) {
      const [adminRows] = await pool.execute('SELECT id FROM Users LIMIT 1');
      assigned_by = adminRows[0]?.id || 1;
    }

    // Check if assignment exists
    const [existing] = await pool.execute(
      'SELECT id FROM QuizAssignments WHERE employee_id = ? AND quiz_id = ? LIMIT 1',
      [employee_id, quiz_id]
    );

    if (existing.length > 0) {
      await pool.execute(
        'UPDATE QuizAssignments SET status = "Pending", assigned_by = ?, assigned_at = NOW() WHERE id = ?',
        [assigned_by, existing[0].id]
      );
    } else {
      await pool.execute(
        'INSERT INTO QuizAssignments (employee_id, quiz_id, assigned_by, status, assigned_at) VALUES (?, ?, ?, "Pending", NOW())',
        [employee_id, quiz_id, assigned_by]
      );
    }

    const [empRows] = await pool.execute('SELECT email FROM Employees WHERE id = ? LIMIT 1', [employee_id]);
    const empEmail = empRows[0]?.email || '';

    const trainingPortalLink = `${process.env.PUBLIC_TUNNEL_URL || 'http://localhost:3000'}/login?portal=employee&target_email=${encodeURIComponent(empEmail)}&assigned_quiz=${quiz_id}`;

    await auditLogger.log({
      userId: assigned_by,
      sessionId: req.user?.sessionId || 'sess_assign',
      actorEmail: req.user?.email || 'admin@local',
      role: 'Admin',
      action: 'QUIZ_ASSIGNED',
      details: `Assigned Quiz #${quiz_id} to Employee #${employee_id}`,
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(200).json({
      success: true,
      message: `Quiz #${quiz_id} assigned successfully.`,
      trainingPortalLink
    });
  } catch (error) {
    console.error('[quizController.assignQuizToEmployee]:', error);
    return res.status(500).json({ success: false, message: 'Failed to assign quiz.', error: error.message });
  }
};

exports.assignQuiz = exports.assignQuizToEmployee;

// POST /api/quizzes/create
exports.createQuiz = async (req, res) => {
  try {
    const { module_title, module_content, title, pass_score, questions } = req.body;

    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Quiz title and at least one question are required.' });
    }

    let moduleId = 1;
    if (module_title && module_content) {
      const [modRes] = await pool.execute(
        'INSERT INTO TrainingModules (title, content) VALUES (?, ?)',
        [module_title.trim(), module_content.trim()]
      );
      moduleId = modRes.insertId;
    }

    const [quizRes] = await pool.execute(
      'INSERT INTO Quizzes (module_id, title, pass_score) VALUES (?, ?, ?)',
      [moduleId, title.trim(), Number(pass_score) || 70]
    );
    const quizId = quizRes.insertId;

    for (const q of questions) {
      await pool.execute(
        `INSERT INTO QuizQuestions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [quizId, q.question, q.option_a, q.option_b, q.option_c, q.option_d, (q.correct_option || 'A').toUpperCase()]
      );
    }

    await auditLogger.log({
      userId: req.user?.id || 1,
      sessionId: req.user?.sessionId || 'sess_create',
      actorEmail: req.user?.email || 'admin@local',
      role: 'Admin',
      action: 'QUIZ_CREATED',
      details: `Created new Quiz #${quizId} with ${questions.length} questions`,
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(201).json({
      success: true,
      message: 'New Quiz and Training Module created successfully.',
      quizId
    });
  } catch (error) {
    console.error('[quizController.createQuiz]:', error);
    return res.status(500).json({ success: false, message: 'Failed to create quiz.' });
  }
};

// POST /api/quizzes/:quizId/submit
exports.submitQuiz = async (req, res) => {
  try {
    const quizId = parseInt(req.params.quizId, 10);
    const employee_id = req.body.employee_id || req.body.employeeId || req.user?.id;
    const answers = req.body.answers || {};

    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID is required.' });
    }

    const [quizRows] = await pool.execute('SELECT pass_score FROM Quizzes WHERE id = ?', [quizId]);
    if (quizRows.length === 0) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }
    const passScore = quizRows[0].pass_score || 70;

    const [questions] = await pool.execute('SELECT id, correct_option FROM QuizQuestions WHERE quiz_id = ?', [quizId]);
    if (questions.length === 0) {
      return res.status(400).json({ error: 'No questions registered for this quiz.' });
    }

    let correctCount = 0;
    questions.forEach((q) => {
      if (answers[q.id] && String(answers[q.id]).toUpperCase() === String(q.correct_option).toUpperCase()) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= passScore;

    await pool.execute(
      'INSERT INTO QuizResults (quiz_id, employee_id, score, passed, completed_at) VALUES (?, ?, ?, ?, NOW())',
      [quizId, employee_id, score, passed ? 1 : 0]
    );

    if (passed) {
      await pool.execute(
        'UPDATE QuizAssignments SET status = "Completed" WHERE employee_id = ? AND quiz_id = ?',
        [employee_id, quizId]
      );
    }

    let newRiskLevel = 'UNDETERMINED';
    if (typeof recalculateEmployeeRisk === 'function') {
      newRiskLevel = await recalculateEmployeeRisk(employee_id);
    }

    return res.status(200).json({
      success: true,
      passed,
      score,
      newRiskLevel,
      message: passed ? `Congratulations! You passed with ${score}%.` : `Retake recommended. You scored ${score}%. Passing threshold is ${passScore}%.`
    });
  } catch (error) {
    console.error('[quizController.submitQuiz]:', error);
    return res.status(500).json({ error: 'Failed to submit assessment.' });
  }
};

// GET /api/quizzes/employee/:employeeId
exports.getEmployeeQuizResults = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const [rows] = await pool.execute(`
      SELECT 
        qr.id,
        qr.quiz_id,
        q.title AS quiz_title,
        qr.score,
        qr.passed,
        qr.completed_at
      FROM QuizResults qr
      INNER JOIN Quizzes q ON q.id = qr.quiz_id
      WHERE qr.employee_id = ?
      ORDER BY qr.completed_at DESC
    `, [employeeId]);

    return res.status(200).json({ quizHistory: rows });
  } catch (error) {
    console.error('[quizController.getEmployeeQuizResults]:', error);
    return res.status(500).json({ error: 'Failed to fetch employee results.' });
  }
};