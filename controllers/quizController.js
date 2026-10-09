'use strict';

const pool = require('../config/db');
const sendEmail = require('../utils/mailer');
const logAction = require('../utils/auditLogger');
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

// GET /api/quizzes — Employees ONLY receive UNCOMPLETED assigned quizzes (status = 'Pending')
exports.getAllQuizzes = async (req, res) => {
  try {
    // If user is Employee or an employee_id query is passed, strictly filter by QuizAssignments
    const isEmployee = req.user?.role === 'Employee';
    const targetEmpId = isEmployee ? req.user.id : req.query.employee_id || null;

    if (targetEmpId) {
      const [assigned] = await pool.execute(
        `SELECT q.id, q.module_id, q.title, q.pass_score, tm.title AS module_title, tm.content AS module_content,
                qa.assigned_at, qa.status AS assignment_status,
                (SELECT COUNT(*) FROM QuizQuestions qq WHERE qq.quiz_id = q.id) AS question_count
         FROM QuizAssignments qa
         INNER JOIN Quizzes q ON q.id = qa.quiz_id
         LEFT JOIN TrainingModules tm ON tm.id = q.module_id
         WHERE qa.employee_id = ? AND qa.status = 'Pending'
         ORDER BY qa.assigned_at DESC`,
        [targetEmpId]
      );
      return res.status(200).json(assigned);
    }

    // Admins see all quizzes in the platform
    const [allQuizzes] = await pool.execute(
      `SELECT q.id, q.module_id, q.title, q.pass_score, tm.title AS module_title, tm.content AS module_content,
              (SELECT COUNT(*) FROM QuizQuestions qq WHERE qq.quiz_id = q.id) AS question_count
       FROM Quizzes q
       LEFT JOIN TrainingModules tm ON tm.id = q.module_id
       ORDER BY q.id ASC`
    );
    return res.status(200).json(allQuizzes);
  } catch (err) {
    console.error('[GetAllQuizzes Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch quizzes.' });
  }
};

// GET /api/quizzes/assigned/:employeeId
exports.getAssignedQuizzesForEmployee = async (req, res) => {
  const { employeeId } = req.params;
  try {
    const [assigned] = await pool.execute(
      `SELECT q.id, q.module_id, q.title, q.pass_score, tm.title AS module_title, tm.content AS module_content,
              qa.assigned_at, qa.status AS assignment_status,
              (SELECT COUNT(*) FROM QuizQuestions qq WHERE qq.quiz_id = q.id) AS question_count
         FROM QuizAssignments qa
         INNER JOIN Quizzes q ON q.id = qa.quiz_id
         LEFT JOIN TrainingModules tm ON tm.id = q.module_id
         WHERE qa.employee_id = ? AND qa.status = 'Pending'
         ORDER BY qa.assigned_at DESC`,
      [employeeId]
    );
    return res.status(200).json(assigned);
  } catch (err) {
    console.error('[GetAssignedQuizzes Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch assigned quizzes.' });
  }
};

// GET /api/quizzes/employee/:employeeId
exports.getEmployeePersonalData = async (req, res) => {
  const { employeeId } = req.params;
  try {
    const [empRows] = await pool.execute(
      'SELECT id, name, email, department, risk_level, approval_status FROM Employees WHERE id = ? LIMIT 1',
      [employeeId]
    );
    const [results] = await pool.execute(
      `SELECT qr.*, q.title AS quiz_title, q.pass_score
       FROM QuizResults qr
       INNER JOIN Quizzes q ON q.id = qr.quiz_id
       WHERE qr.employee_id = ?
       ORDER BY qr.completed_at DESC`,
      [employeeId]
    );
    return res.status(200).json({
      employee: empRows[0] || null,
      results,
    });
  } catch (err) {
    console.error('[GetEmployeePersonalData Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch employee quiz data.' });
  }
};

// GET /api/quizzes/:quizId/questions & GET /api/quizzes/:id
exports.getQuizQuestions = async (req, res) => {
  const quizId = req.params.quizId || req.params.id;
  try {
    const [quizRows] = await pool.execute(
      `SELECT q.id, q.title, q.pass_score, q.module_id, tm.title AS module_title, tm.content AS module_content
       FROM Quizzes q
       LEFT JOIN TrainingModules tm ON tm.id = q.module_id
       WHERE q.id = ? LIMIT 1`,
      [quizId]
    );
    if (quizRows.length === 0) return res.status(404).json({ error: 'Quiz not found.' });

    const [questions] = await pool.execute(
      'SELECT id, quiz_id, question, option_a, option_b, option_c, option_d FROM QuizQuestions WHERE quiz_id = ? ORDER BY id ASC',
      [quizId]
    );

    return res.status(200).json({ quiz: quizRows[0], questions });
  } catch (err) {
    console.error('[GetQuizQuestions Error]:', err.message);
    return res.status(500).json({ error: 'Failed to load quiz questions.' });
  }
};
exports.getQuizById = exports.getQuizQuestions;

// POST /api/quizzes/assign
exports.assignQuizToEmployee = async (req, res) => {
  const { employee_id, quiz_id } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  if (!employee_id || !quiz_id) {
    return res.status(400).json({ error: 'employee_id and quiz_id are required.' });
  }

  try {
    const [emp] = await pool.execute('SELECT * FROM Employees WHERE id = ? LIMIT 1', [employee_id]);
    const [quiz] = await pool.execute('SELECT * FROM Quizzes WHERE id = ? LIMIT 1', [quiz_id]);

    if (emp.length === 0 || quiz.length === 0) {
      return res.status(404).json({ error: 'Employee or Quiz not found.' });
    }

    await pool.execute(
      `INSERT INTO QuizAssignments (employee_id, quiz_id, assigned_by, status)
       VALUES (?, ?, ?, 'Pending')
       ON DUPLICATE KEY UPDATE status = 'Pending', assigned_at = NOW()`,
      [employee_id, quiz_id, req.user?.id || null]
    );

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const trainingLink = `${baseUrl}/employee?assigned_quiz=${quiz_id}&target_email=${encodeURIComponent(emp[0].email)}`;

    await sendEmail({
      to: emp[0].email,
      subject: `Assigned Security Awareness Quiz: "${quiz[0].title}"`,
      html: `
        <div style="font-family:Inter,Segoe UI,sans-serif;padding:24px;border:1px solid #e2e8f0;border-radius:12px;max-width:540px;">
          <h2 style="color:#0f172a;margin-top:0;">Mandatory Security Assessment</h2>
          <p>Hello <strong>${emp[0].name}</strong>,</p>
          <p>You have been assigned: <strong>${quiz[0].title}</strong>.</p>
          <div style="margin:24px 0;">
            <a href="${trainingLink}" style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;">
              Launch Training Portal
            </a>
          </div>
          <p style="font-size:12px;color:#64748b;">Direct Link: ${trainingLink}</p>
        </div>
      `,
    });

    await logAction(
      req.user?.id || null,
      'QUIZ_ASSIGNED',
      { employeeId: employee_id, employeeEmail: emp[0].email, quizId, quizTitle: quiz[0].title },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: 'Admin' }
    );

    return res.status(200).json({
      message: `Quiz "${quiz[0].title}" assigned and emailed to ${emp[0].email}.`,
      trainingPortalLink: trainingLink,
    });
  } catch (err) {
    console.error('[AssignQuiz Error]:', err.message);
    return res.status(500).json({ error: 'Failed to assign quiz.' });
  }
};

// POST /api/quizzes/:quizId/submit
exports.submitQuiz = async (req, res) => {
  const quizId = req.params.quizId || req.params.id;
  const { employee_id, answers } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const targetEmployeeId = employee_id || (req.user?.role === 'Employee' ? req.user.id : null);

  if (!targetEmployeeId || !answers) {
    return res.status(400).json({ error: 'Employee ID and answers are required.' });
  }

  try {
    const [quiz] = await pool.execute('SELECT * FROM Quizzes WHERE id = ? LIMIT 1', [quizId]);
    if (quiz.length === 0) return res.status(404).json({ error: 'Quiz not found.' });

    const [questions] = await pool.execute(
      'SELECT id, correct_option FROM QuizQuestions WHERE quiz_id = ? ORDER BY id ASC',
      [quizId]
    );

    let correctCount = 0;
    questions.forEach((q) => {
      const submitted = answers[q.id];
      if (submitted && String(submitted).toUpperCase() === String(q.correct_option).toUpperCase()) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= (quiz[0].pass_score || 70);

    await pool.execute(
      'INSERT INTO QuizResults (quiz_id, employee_id, score, passed) VALUES (?, ?, ?, ?)',
      [quizId, targetEmployeeId, score, passed ? 1 : 0]
    );

    // If passed, mark as Completed so it disappears from the active list
    if (passed) {
      await pool.execute(
        "UPDATE QuizAssignments SET status = 'Completed' WHERE employee_id = ? AND quiz_id = ?",
        [targetEmployeeId, quizId]
      );
    }

    const updatedRisk = await recalculateEmployeeRisk(targetEmployeeId);

    const [empRow] = await pool.execute('SELECT email FROM Employees WHERE id = ? LIMIT 1', [targetEmployeeId]);
    const empEmail = empRow[0]?.email || `employee_${targetEmployeeId}`;

    await logAction(
      null,
      'QUIZ_ATTEMPT_SUBMITTED',
      { employeeId: targetEmployeeId, quizId: Number(quizId), score, passed, newRiskLevel: updatedRisk },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: empEmail, role: 'Employee' }
    );

    return res.status(200).json({
      message: passed
        ? `Passed with ${score}%! Assessment completed.`
        : `Scored ${score}%. Minimum ${quiz[0].pass_score}% required to pass.`,
      score,
      correctCount,
      totalQuestions: questions.length,
      passed,
      newRiskLevel: updatedRisk,
    });
  } catch (err) {
    console.error('[SubmitQuiz Error]:', err.message);
    return res.status(500).json({ error: 'Failed to evaluate quiz submission.' });
  }
};

// GET /api/quizzes/results/:employeeId
exports.getEmployeeQuizResults = async (req, res) => {
  try {
    const [results] = await pool.execute(
      `SELECT qr.*, q.title AS quiz_title, q.pass_score
       FROM QuizResults qr
       INNER JOIN Quizzes q ON q.id = qr.quiz_id
       WHERE qr.employee_id = ?
       ORDER BY qr.completed_at DESC`,
      [req.params.employeeId]
    );
    return res.status(200).json(results);
  } catch (err) {
    console.error('[GetEmployeeQuizResults Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch quiz results.' });
  }
};

// POST /api/quizzes/create
exports.createQuiz = async (req, res) => {
  const { title, module_title, module_content, pass_score, questions } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  if (!title || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Quiz title and at least one question are required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [modResult] = await conn.execute(
      'INSERT INTO TrainingModules (title, content) VALUES (?, ?)',
      [module_title || title, module_content || `Comprehensive training module for ${title}.`]
    );
    const moduleId = modResult.insertId;

    const [quizResult] = await conn.execute(
      'INSERT INTO Quizzes (module_id, title, pass_score) VALUES (?, ?, ?)',
      [moduleId, title, Number(pass_score) || 70]
    );
    const quizId = quizResult.insertId;

    for (const q of questions) {
      await conn.execute(
        `INSERT INTO QuizQuestions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [quizId, q.question, q.option_a, q.option_b, q.option_c, q.option_d, (q.correct_option || 'A').toUpperCase()]
      );
    }

    await conn.commit();

    await logAction(
      req.user?.id || null,
      'QUIZ_CREATED',
      { quizId, title, questionCount: questions.length },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: req.user?.role || 'Admin' }
    );

    return res.status(201).json({ message: 'Quiz created successfully.', quizId });
  } catch (err) {
    await conn.rollback();
    console.error('[CreateQuiz Error]:', err.message);
    return res.status(500).json({ error: 'Failed to create quiz.' });
  } finally {
    conn.release();
  }
};
exports.createQuizWithModule = exports.createQuiz;