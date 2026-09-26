'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendPasswordResetEmail } = require('../utils/mailer');
const auditLogger = require('../utils/auditLogger');

async function recordAudit(userId, action, details, ip) {
  try {
    const fn = typeof auditLogger === 'function' ? auditLogger : auditLogger?.logAudit;
    if (typeof fn === 'function') {
      await fn(userId, action, details, ip);
    }
  } catch (err) {
    console.error('Audit log warning:', err.message);
  }
}

/**
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields (name, email, password) are required.'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await pool.execute('SELECT id FROM Users WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered.'
      });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO Users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name.trim(), normalizedEmail, password_hash, 'Admin']
    );

    await recordAudit(result.insertId, 'ADMIN_REGISTERED', { email: normalizedEmail }, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Admin registered successfully.',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      error: error.message
    });
  }
};

/**
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  const { email, password, loginType } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide both email and password.'
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    // 1. Check Admin Users table first
    const [adminRows] = await pool.execute(
      'SELECT id, name, email, password_hash, role FROM Users WHERE LOWER(email) = ? LIMIT 1',
      [normalizedEmail]
    );

    if (adminRows.length > 0) {
      const admin = adminRows[0];
      if (!admin.password_hash) {
        return res.status(401).json({
          success: false,
          message: 'This account uses OAuth SSO. Please sign in with Google or GitHub.'
        });
      }

      const isMatch = await bcrypt.compare(password, admin.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials.' });
      }

      const payload = { id: admin.id, email: admin.email, role: admin.role || 'Admin' };
      const token = jwt.sign(payload, process.env.JWT_SECRET || 'super_secret_key', { expiresIn: '8h' });

      await recordAudit(admin.id, 'ADMIN_LOGIN', { email: admin.email }, req.ip);

      return res.status(200).json({
        success: true,
        message: 'Login successful!',
        token: `Bearer ${token}`,
        user: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role || 'Admin'
        }
      });
    }

    if (loginType === 'admin') {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrator credentials.'
      });
    }

    // 2. Check Employees table for standard User Login
    const [empRows] = await pool.execute(
      'SELECT id, name, email, department, risk_level, approval_status FROM Employees WHERE LOWER(email) = ? LIMIT 1',
      [normalizedEmail]
    );

    if (empRows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    const employee = empRows[0];

    if (employee.approval_status === 'Pending') {
      return res.status(403).json({
        success: false,
        message: 'Your employee profile is currently Pending Admin Approval.'
      });
    }

    const emailPrefix = employee.email.split('@')[0];
    const validEmployeePasswords = ['Employee123!', 'Pass123!', emailPrefix, employee.name];
    if (!validEmployeePasswords.includes(password)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid employee credentials. (Tip: Use Employee123! or your email username).'
      });
    }

    const empPayload = {
      id: employee.id,
      employeeId: employee.id,
      email: employee.email,
      role: 'Employee'
    };
    const token = jwt.sign(empPayload, process.env.JWT_SECRET || 'super_secret_key', { expiresIn: '8h' });

    return res.status(200).json({
      success: true,
      message: 'Employee login successful!',
      token: `Bearer ${token}`,
      user: {
        id: employee.id,
        employeeId: employee.id,
        name: employee.name,
        email: employee.email,
        department: employee.department,
        risk_level: employee.risk_level,
        approval_status: employee.approval_status || 'Approved',
        role: 'Employee'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
};

/**
 * POST /api/auth/oauth-onboarding
 * Allows a newly created OAuth Employee to set their name & department and submit for Admin approval.
 */
exports.completeOAuthOnboarding = async (req, res) => {
  try {
    const employeeId = req.user?.employeeId || req.user?.id;
    const { name, department } = req.body;

    if (!employeeId || !department) {
      return res.status(400).json({
        success: false,
        message: 'Department selection is required.'
      });
    }

    await pool.execute(
      `UPDATE Employees
       SET name = COALESCE(?, name),
           department = ?,
           approval_status = 'Pending'
       WHERE id = ?`,
      [name ? name.trim() : null, department.trim(), employeeId]
    );

    const [updated] = await pool.execute(
      'SELECT id, name, email, department, risk_level, approval_status FROM Employees WHERE id = ? LIMIT 1',
      [employeeId]
    );

    return res.status(200).json({
      success: true,
      message: 'Department saved! Your account is now awaiting Admin approval.',
      employee: {
        ...updated[0],
        employeeId: updated[0].id,
        role: 'Employee',
        needsDepartment: false
      }
    });
  } catch (error) {
    console.error('OAuth onboarding error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save department selection.'
    });
  }
};

/**
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email address is required.' });
  }

  try {
    const [users] = await pool.execute(
      'SELECT id, email FROM Users WHERE LOWER(email) = ? LIMIT 1',
      [String(email).trim().toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched.'
      });
    }

    const user = users[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    await pool.execute(
      'UPDATE Users SET reset_token = ?, reset_token_expiry = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?',
      [hashedToken, user.id]
    );

    await sendPasswordResetEmail(user.email, rawToken);
    await recordAudit(user.id, 'PASSWORD_RESET_REQUESTED', { email: user.email }, req.ip);

    return res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been dispatched.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      error: error.message
    });
  }
};

/**
 * POST /api/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword || String(newPassword).length < 4) {
    return res.status(400).json({
      success: false,
      message: 'Valid reset token and a new password are required.'
    });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(String(token).trim()).digest('hex');

    const [users] = await pool.execute(
      'SELECT id, email FROM Users WHERE reset_token = ? AND reset_token_expiry > NOW() LIMIT 1',
      [hashedToken]
    );

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token.'
      });
    }

    const user = users[0];
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await pool.execute(
      'UPDATE Users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
      [passwordHash, user.id]
    );

    await recordAudit(user.id, 'PASSWORD_RESET_COMPLETED', { email: user.email }, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Password has been successfully reset. You may now sign in.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
};