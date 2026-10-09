'use strict';

const fs = require('fs');
const csv = require('csv-parser');
const pool = require('../config/db');
const logAction = require('../utils/auditLogger');

// GET /api/employees
// Supports ?search=...&department=...&risk_level=...&page=1&limit=100
exports.getAllEmployees = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const department = (req.query.department || '').trim();
    const riskLevel = (req.query.risk_level || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push('(name LIKE ? OR email LIKE ? OR department LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (department && department !== 'ALL') {
      conditions.push('department = ?');
      params.push(department);
    }
    if (riskLevel) {
      conditions.push('risk_level LIKE ?');
      params.push(`%${riskLevel}%`);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT id, name, email, department, risk_level, COALESCE(approval_status, 'Approved') AS approval_status, created_at
       FROM Employees
       ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM Employees ${whereSql}`,
      params
    );

    return res.status(200).json({
      employees: rows,
      data: rows,
      total: countRow.total,
      page,
      limit,
    });
  } catch (err) {
    console.error('[GetAllEmployees Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve employees.' });
  }
};

// GET /api/employees/:id
exports.getEmployeeById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, email, department, risk_level, COALESCE(approval_status, 'Approved') AS approval_status, created_at
       FROM Employees
       WHERE id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    return res.status(200).json({ employee: rows[0], data: rows[0] });
  } catch (err) {
    console.error('[GetEmployeeById Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve employee record.' });
  }
};

// POST /api/employees
exports.createEmployee = async (req, res) => {
  const { name, email, department, risk_level } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const [result] = await pool.execute(
      `INSERT INTO Employees (name, email, department, risk_level, approval_status)
       VALUES (?, ?, ?, ?, 'Approved')`,
      [name.trim(), cleanEmail, department || 'General', risk_level || 'Perfect (0% Risk)']
    );

    await logAction(
      req.user?.id || null,
      'EMPLOYEE_CREATED',
      { employeeId: result.insertId, name: name.trim(), email: cleanEmail, department: department || 'General' },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: req.user?.role || 'Admin' }
    );

    return res.status(201).json({
      message: 'Employee created successfully.',
      id: result.insertId,
      employeeId: result.insertId,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An employee with this email already exists.' });
    }
    console.error('[CreateEmployee Error]:', err.message);
    return res.status(500).json({ error: 'Failed to create employee.' });
  }
};

// PUT /api/employees/:id
exports.updateEmployee = async (req, res) => {
  const { id } = req.params;
  const { name, email, department, risk_level, approval_status } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  try {
    const [existingRows] = await pool.execute('SELECT * FROM Employees WHERE id = ? LIMIT 1', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    const existing = existingRows[0];

    const updatedName = name !== undefined ? name : existing.name;
    const updatedEmail = email !== undefined ? email.trim().toLowerCase() : existing.email;
    const updatedDept = department !== undefined ? department : existing.department;
    const updatedRisk = risk_level !== undefined ? risk_level : existing.risk_level;
    const updatedApproval = approval_status !== undefined ? approval_status : existing.approval_status;

    await pool.execute(
      `UPDATE Employees
       SET name = ?, email = ?, department = ?, risk_level = ?, approval_status = ?
       WHERE id = ?`,
      [updatedName, updatedEmail, updatedDept, updatedRisk, updatedApproval, id]
    );

    const actionType =
      approval_status === 'Approved' && existing.approval_status !== 'Approved'
        ? 'EMPLOYEE_APPROVED'
        : 'EMPLOYEE_UPDATED';

    await logAction(
      req.user?.id || null,
      actionType,
      {
        employeeId: Number(id),
        email: updatedEmail,
        department: updatedDept,
        approval_status: updatedApproval,
      },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: req.user?.role || 'Admin' }
    );

    return res.status(200).json({ message: 'Employee updated successfully.' });
  } catch (err) {
    console.error('[UpdateEmployee Error]:', err.message);
    return res.status(500).json({ error: 'Failed to update employee.' });
  }
};

// DELETE /api/employees/:id
exports.deleteEmployee = async (req, res) => {
  const { id } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  try {
    const [empRows] = await pool.execute('SELECT name, email, department FROM Employees WHERE id = ? LIMIT 1', [id]);
    if (empRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    await pool.execute('DELETE FROM Employees WHERE id = ?', [id]);

    await logAction(
      req.user?.id || null,
      'EMPLOYEE_DELETED',
      { employeeId: Number(id), deletedName: empRows[0].name, deletedEmail: empRows[0].email },
      ip,
      { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: req.user?.role || 'Admin' }
    );

    return res.status(200).json({ message: 'Employee deleted successfully.' });
  } catch (err) {
    console.error('[DeleteEmployee Error]:', err.message);
    return res.status(500).json({ error: 'Failed to delete employee.' });
  }
};

// POST /api/employees/upload-csv
exports.uploadCSV = async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded.' });
  }

  const filePath = req.file.path;
  const rows = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => rows.push(data))
    .on('end', async () => {
      let imported = 0;
      try {
        for (const r of rows) {
          const name = (r.name || r.Name || '').trim();
          const email = (r.email || r.Email || '').trim().toLowerCase();
          const department = (r.department || r.Department || 'General').trim();
          const risk = (r.risk_level || r.RiskLevel || 'Perfect (0% Risk)').trim();

          if (name && email) {
            await pool.execute(
              `INSERT INTO Employees (name, email, department, risk_level, approval_status)
               VALUES (?, ?, ?, ?, 'Approved')
               ON DUPLICATE KEY UPDATE name = VALUES(name), department = VALUES(department)`,
              [name, email, department, risk]
            );
            imported++;
          }
        }

        await logAction(
          req.user?.id || null,
          'CSV_ROSTER_IMPORTED',
          { filename: req.file.originalname, rowsProcessed: rows.length, importedCount: imported },
          ip,
          { sessionId: req.user?.sessionId, actorEmail: req.user?.email, role: req.user?.role || 'Admin' }
        );

        fs.unlink(filePath, () => {});
        return res.status(200).json({
          message: `Successfully imported ${imported} employees from CSV.`,
          imported,
        });
      } catch (err) {
        fs.unlink(filePath, () => {});
        console.error('[CSV Import Error]:', err.message);
        return res.status(500).json({ error: 'Failed to import CSV rows.' });
      }
    });
};