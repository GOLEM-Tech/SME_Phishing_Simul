'use strict';

const pool = require('../config/db');
const { sendTrainingAssignmentEmail } = require('../utils/mailer');
const auditLogger = require('../utils/auditLogger');

async function recordAudit(userId, action, details, ip) {
  try {
    const fn = typeof auditLogger === 'function' ? auditLogger : auditLogger?.logAudit;
    if (typeof fn === 'function') {
      await fn(userId, action, details, ip);
    }
  } catch (err) {
    console.warn('Audit warning:', err.message);
  }
}

/**
 * GET /api/quizzes
 * Lists all Quizzes joined with their TrainingModule details and exact question counts.
 */
exports.getAllQuizzes = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        q.id,
        q.module_id,
        q.title,
        q.pass_score,
        tm.title AS module_title,
        tm.content AS content,
        (SELECT COUNT(*) FROM QuizQuestions qq WHERE qq.quiz_id = q.id) AS question_count
      FROM Quizzes q
      INNER JOIN TrainingModules tm ON tm.id = q.module_id
      ORDER BY q.id ASC
    `);

    return res.status(200).json({
      success: true,
      quizzes: rows
    });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching quizzes.'
    });
  }
};

/**
 * GET /api/quizzes/:id
 * Returns a specific quiz and all of its MCQ questions.
 */
exports.getQuizById = async (req, res) => {
  const quizId = parseInt(req.params.id, 10);
  if (!Number.isInteger(quizId) || quizId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid quiz ID.' });
  }

  try {
    const [quizRows] = await pool.execute(
      `SELECT q.id, q.module_id, q.title, q.pass_score, tm.title AS module_title, tm.content
       FROM Quizzes q
       INNER JOIN TrainingModules tm ON tm.id = q.module_id
       WHERE q.id = ? LIMIT 1`,
      [quizId]
    );

    if (quizRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    const [questionRows] = await pool.execute(
      `SELECT id, quiz_id, question, option_a, option_b, option_c, option_d
       FROM QuizQuestions
       WHERE quiz_id = ?
       ORDER BY id ASC`,
      [quizId]
    );

    return res.status(200).json({
      success: true,
      quiz: quizRows[0],
      questions: questionRows
    });
  } catch (error) {
    console.error('Error loading quiz details:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * POST /api/quizzes/create
 * Admin endpoint to create a TrainingModule, Quiz, and ANY number of MCQ Questions at once.
 */
exports.createQuizWithModule = async (req, res) => {
  const { moduleTitle, moduleContent, quizTitle, passScore = 70, questions = [] } = req.body;

  if (!moduleTitle || !quizTitle) {
    return res.status(400).json({
      success: false,
      message: 'Both moduleTitle and quizTitle are required.'
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [modResult] = await connection.execute(
      'INSERT INTO TrainingModules (title, content) VALUES (?, ?)',
      [moduleTitle.trim(), (moduleContent || 'Interactive Security Awareness Module').trim()]
    );
    const moduleId = modResult.insertId;

    const [quizResult] = await connection.execute(
      'INSERT INTO Quizzes (module_id, title, pass_score) VALUES (?, ?, ?)',
      [moduleId, quizTitle.trim(), parseInt(passScore, 10) || 70]
    );
    const quizId = quizResult.insertId;

    let insertedQuestions = 0;
    for (const q of questions) {
      if (q.question && q.option_a && q.option_b) {
        await connection.execute(
          `INSERT INTO QuizQuestions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            quizId,
            q.question.trim(),
            q.option_a.trim(),
            q.option_b.trim(),
            (q.option_c || 'None of the above').trim(),
            (q.option_d || 'All of the above').trim(),
            String(q.correct_option || 'A').trim().toUpperCase().charAt(0)
          ]
        );
        insertedQuestions++;
      }
    }

    await connection.commit();
    await recordAudit(req.user?.id || 1, 'QUIZ_CREATED', { quizId, quizTitle, insertedQuestions }, req.ip);

    return res.status(201).json({
      success: true,
      message: `Created "${quizTitle}" with ${insertedQuestions} MCQ question(s).`,
      data: { moduleId, quizId, insertedQuestions }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating quiz module:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create quiz module.'
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/quizzes/assign
 * Assigns a Quiz to specific employee(s), a department, or all High/Critical-Risk employees,
 * and dispatches a real email notification to every target via Nodemailer!
 */
exports.assignQuizToEmployees = async (req, res) => {
  const { quizId, targetType, employeeId, department } = req.body;

  if (!quizId) {
    return res.status(400).json({ success: false, message: 'Please select a quiz to assign.' });
  }

  try {
    // 1. Fetch Quiz & Module details
    const [quizRows] = await pool.execute(
      `SELECT q.id, q.title AS quiz_title, q.pass_score, tm.title AS module_title,
              (SELECT COUNT(*) FROM QuizQuestions qq WHERE qq.quiz_id = q.id) AS question_count
       FROM Quizzes q
       INNER JOIN TrainingModules tm ON tm.id = q.module_id
       WHERE q.id = ? LIMIT 1`,
      [quizId]
    );

    if (quizRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Selected quiz not found.' });
    }
    const quiz = quizRows[0];

    // 2. Resolve Target Employees (Supports 4-tier risk levels!)
    let targetEmployees = [];
    if (targetType === 'employee' && employeeId) {
      const [rows] = await pool.execute(
        'SELECT id, name, email, department, risk_level FROM Employees WHERE id = ?',
        [employeeId]
      );
      targetEmployees = rows;
    } else if (targetType === 'department' && department) {
      const [rows] = await pool.execute(
        'SELECT id, name, email, department, risk_level FROM Employees WHERE department = ?',
        [department]
      );
      targetEmployees = rows;
    } else if (targetType === 'high_risk') {
      const [rows] = await pool.execute(
        `SELECT id, name, email, department, risk_level
         FROM Employees
         WHERE risk_level LIKE '%High%' OR risk_level LIKE '%CRITICAL%' OR risk_level LIKE '%40%' OR risk_level LIKE '%100%'`
      );
      targetEmployees = rows;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid assignment target.' });
    }

    if (targetEmployees.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No employees matched the selected target criteria.'
      });
    }

    // 3. Send Email Notification to each assigned employee
    const emailed = [];
    const failed = [];

    for (const emp of targetEmployees) {
      try {
        await sendTrainingAssignmentEmail({
          to: emp.email,
          employeeName: emp.name,
          quizTitle: quiz.quiz_title,
          moduleTitle: quiz.module_title,
          passScore: quiz.pass_score,
          questionCount: quiz.question_count || 7,
          riskLevel: emp.risk_level
        });
        emailed.push(emp.email);
      } catch (mailErr) {
        console.error(`Failed to send quiz email to ${emp.email}:`, mailErr.message);
        failed.push({ email: emp.email, error: mailErr.message });
      }
    }

    await recordAudit(
      req.user?.id || 1,
      'TRAINING_QUIZ_ASSIGNED',
      { quizId: quiz.id, quizTitle: quiz.quiz_title, targetType, emailedCount: emailed.length },
      req.ip
    );

    return res.status(200).json({
      success: true,
      message: `Assigned "${quiz.quiz_title}" and dispatched ${emailed.length} email notification(s)!`,
      summary: {
        quizTitle: quiz.quiz_title,
        totalTargeted: targetEmployees.length,
        emailedCount: emailed.length,
        emailedTo: emailed,
        failures: failed
      }
    });
  } catch (error) {
    console.error('Error assigning quiz:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while assigning quiz.'
    });
  }
};

/**
 * GET /api/quizzes/employee/:employeeId
 * Looks up the live Employee row by email (if ?email= provided) or ID so Admin Dashboard
 * and Employee Portal always display the exact same employee details!
 */
exports.getEmployeePersonalData = async (req, res) => {
  const employeeId = parseInt(req.params.employeeId, 10) || 1;
  const emailQuery = req.query.email ? String(req.query.email).trim().toLowerCase() : null;

  try {
    let empRows = [];
    if (emailQuery) {
      const [byEmail] = await pool.execute(
        'SELECT id, name, email, department, risk_level, created_at FROM Employees WHERE LOWER(email) = ? LIMIT 1',
        [emailQuery]
      );
      empRows = byEmail;
    }

    if (empRows.length === 0) {
      const [byId] = await pool.execute(
        'SELECT id, name, email, department, risk_level, created_at FROM Employees WHERE id = ? LIMIT 1',
        [employeeId]
      );
      empRows = byId;
    }

    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const liveEmployee = empRows[0];

    const [results] = await pool.execute(
      `SELECT qr.id, qr.quiz_id, qr.score, qr.passed, qr.completed_at, q.title AS quiz_title, q.pass_score
       FROM QuizResults qr
       INNER JOIN Quizzes q ON q.id = qr.quiz_id
       WHERE qr.employee_id = ?
       ORDER BY qr.completed_at DESC`,
      [liveEmployee.id]
    );

    return res.status(200).json({
      success: true,
      employee: liveEmployee,
      quizHistory: results
    });
  } catch (error) {
    console.error('Error fetching employee personal progress:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * POST /api/quizzes/:id/submit
 * Grades quiz submission, records QuizResults, and steps down Employee risk_level across the 4-tier scale:
 * CRITICAL VERY HIGH (100% Risk) -> High (40% Risk) -> Low (15% Risk) -> Perfect (0% Risk)
 */
exports.submitQuiz = async (req, res) => {
  const quizId = parseInt(req.params.id, 10);
  const { employee_id, employee_email, answers } = req.body;

  if (!Number.isInteger(quizId) || !answers || typeof answers !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'quizId and answers object are required.'
    });
  }

  try {
    let resolvedEmpId = parseInt(employee_id, 10) || 1;
    if (employee_email) {
      const [empRows] = await pool.execute(
        'SELECT id FROM Employees WHERE LOWER(email) = ? LIMIT 1',
        [String(employee_email).trim().toLowerCase()]
      );
      if (empRows.length > 0) {
        resolvedEmpId = empRows[0].id;
      }
    }

    const [quizRows] = await pool.execute('SELECT id, pass_score FROM Quizzes WHERE id = ? LIMIT 1', [quizId]);
    if (quizRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    const passScore = quizRows[0].pass_score || 70;
    const [questions] = await pool.execute(
      'SELECT id, correct_option FROM QuizQuestions WHERE quiz_id = ?',
      [quizId]
    );

    if (questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Quiz has no questions to grade.' });
    }

    let correctCount = 0;
    for (const q of questions) {
      const submittedOption = String(answers[q.id] || '').trim().toUpperCase();
      if (submittedOption === String(q.correct_option).trim().toUpperCase()) {
        correctCount++;
      }
    }

    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= passScore ? 1 : 0;

    await pool.execute(
      'INSERT INTO QuizResults (quiz_id, employee_id, score, passed) VALUES (?, ?, ?, ?)',
      [quizId, resolvedEmpId, score, passed]
    );

    let newRiskLevel = null;
    if (passed) {
      await pool.execute(
        `UPDATE Employees 
         SET risk_level = CASE 
           WHEN risk_level LIKE '%100%' OR risk_level LIKE '%CRITICAL%' THEN 'High (40% Risk)'
           WHEN risk_level LIKE '%40%' OR risk_level = 'High' THEN 'Low (15% Risk)'
           ELSE 'Perfect (0% Risk)'
         END
         WHERE id = ?`,
        [resolvedEmpId]
      );

      const [updatedEmp] = await pool.execute('SELECT risk_level FROM Employees WHERE id = ?', [resolvedEmpId]);
      newRiskLevel = updatedEmp[0]?.risk_level || 'Perfect (0% Risk)';
    }

    return res.status(200).json({
      success: true,
      score,
      correctCount,
      totalQuestions: questions.length,
      passed: Boolean(passed),
      passScore,
      newRiskLevel,
      message: passed
        ? `Passed (${correctCount}/${questions.length} correct)! Your Risk Score improved to ${newRiskLevel}.`
        : `Scored ${score}% (${correctCount}/${questions.length}). Minimum ${passScore}% required to pass.`
    });
  } catch (error) {
    console.error('Error grading quiz:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};