'use strict';

const fs = require('fs');
const csv = require('csv-parser');
const pool = require('../config/db');

/**
 * GET /api/employees
 * Returns approved employees with search, department, risk_level filtering & pagination.
 */
exports.getAllEmployees = async (req, res) => {
  try {
    const { search, department, risk_level } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    let baseQuery = "FROM Employees WHERE (approval_status IS NULL OR approval_status = 'Approved')";
    const queryParams = [];

    if (search) {
      baseQuery += ' AND (name LIKE ? OR email LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (department) {
      baseQuery += ' AND department = ?';
      queryParams.push(department);
    }

    if (risk_level) {
      baseQuery += ' AND risk_level = ?';
      queryParams.push(risk_level);
    }

    const [countResult] = await pool.query(`SELECT COUNT(*) AS total ${baseQuery}`, queryParams);
    const totalRecords = countResult[0].total;
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    const dataQuery = `
      SELECT id, name, email, department, risk_level, approval_status, created_at, updated_at
      ${baseQuery}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return res.status(200).json({
      success: true,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit
      },
      employees: rows,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching employees.'
    });
  }
};

/**
 * GET /api/employees/pending
 * Lists OAuth-registered employees awaiting Admin approval.
 */
exports.getPendingEmployees = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, email, department, risk_level, approval_status, created_at
       FROM Employees
       WHERE approval_status = 'Pending'
       ORDER BY created_at DESC`
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      pendingEmployees: rows
    });
  } catch (error) {
    console.error('Error fetching pending employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending OAuth employees.'
    });
  }
};

/**
 * PUT /api/employees/:id/approve
 * Approves a pending OAuth employee and optionally updates their department.
 */
exports.approveEmployee = async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id, 10);
    const { department } = req.body;

    if (department) {
      await pool.execute(
        "UPDATE Employees SET approval_status = 'Approved', department = ? WHERE id = ?",
        [department.trim(), employeeId]
      );
    } else {
      await pool.execute(
        "UPDATE Employees SET approval_status = 'Approved' WHERE id = ?",
        [employeeId]
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Employee approved and added to active directory.'
    });
  } catch (error) {
    console.error('Error approving employee:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve employee.'
    });
  }
};

/**
 * POST /api/employees
 */
exports.createEmployee = async (req, res) => {
  try {
    const { name, email, department, risk_level } = req.body;
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required.'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await pool.execute('SELECT id FROM Employees WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Employee with this email already exists.'
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO Employees (name, email, department, risk_level, approval_status)
       VALUES (?, ?, ?, ?, 'Approved')`,
      [name.trim(), normalizedEmail, (department || 'General').trim(), risk_level || 'Low']
    );

    return res.status(201).json({
      success: true,
      message: 'Employee created successfully.',
      employeeId: result.insertId
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
};

/**
 * GET /api/employees/:id
 */
exports.getEmployeeById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM Employees WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * PUT /api/employees/:id
 */
exports.updateEmployee = async (req, res) => {
  try {
    const { name, department, risk_level } = req.body;
    await pool.execute(
      `UPDATE Employees
       SET name = COALESCE(?, name),
           department = COALESCE(?, department),
           risk_level = COALESCE(?, risk_level)
       WHERE id = ?`,
      [name ?? null, department ?? null, risk_level ?? null, req.params.id]
    );
    return res.status(200).json({ success: true, message: 'Employee updated successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * DELETE /api/employees/:id
 */
exports.deleteEmployee = async (req, res) => {
  try {
    await pool.execute('DELETE FROM Employees WHERE id = ?', [req.params.id]);
    return res.status(200).json({ success: true, message: 'Employee removed successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * POST /api/employees/upload-csv
 */
exports.uploadCSV = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please upload a valid CSV file.' });
  }

  const results = [];
  const filePath = req.file.path;

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      const name = row.name || row.Name;
      const email = row.email || row.Email;
      const department = row.department || row.Department || 'General';
      const risk_level = row.risk_level || row.RiskLevel || 'Low';
      if (name && email) {
        results.push({
          name: String(name).trim(),
          email: String(email).trim().toLowerCase(),
          department: String(department).trim(),
          risk_level: ['Low', 'Medium', 'High'].includes(risk_level) ? risk_level : 'Low'
        });
      }
    })
    .on('end', async () => {
      try {
        let affected = 0;
        for (const emp of results) {
          await pool.execute(
            `INSERT INTO Employees (name, email, department, risk_level, approval_status)
             VALUES (?, ?, ?, ?, 'Approved')
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               department = VALUES(department),
               approval_status = 'Approved'`,
            [emp.name, emp.email, emp.department, emp.risk_level]
          );
          affected++;
        }
        fs.unlink(filePath, () => {});
        return res.status(200).json({
          success: true,
          message: 'CSV processed successfully.',
          totalRows: results.length,
          affectedRows: affected
        });
      } catch (dbErr) {
        fs.unlink(filePath, () => {});
        return res.status(500).json({ success: false, message: 'Database error during CSV import.' });
      }
    });
};