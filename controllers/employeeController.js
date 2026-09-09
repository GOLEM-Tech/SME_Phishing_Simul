const fs = require('fs');
const csv = require('csv-parser');
const pool = require('../config/db');

// POST /api/employees
exports.createEmployee = async (req, res) => {
  try {
    const { name, email, department } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required.' });
    }

    const dept = department || 'General';

    const [existing] = await pool.execute('SELECT id FROM Employees WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Employee with this email already exists.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO Employees (name, email, department, risk_level) VALUES (?, ?, ?, ?)',
      [name, email, dept, 'Low']
    );

    return res.status(201).json({
      message: 'Employee created successfully.',
      employeeId: result.insertId
    });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
};

// GET /api/employees
exports.getAllEmployees = async (req, res) => {
  try {
    const { department, risk_level } = req.query;
    let query = 'SELECT id, name, email, department, risk_level, created_at FROM Employees WHERE 1=1';
    const params = [];

    if (department) {
      query += ' AND department = ?';
      params.push(department);
    }

    if (risk_level) {
      query += ' AND risk_level = ?';
      params.push(risk_level);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(query, params);
    return res.status(200).json({ count: rows.length, employees: rows });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
};

// GET /api/employees/:id
exports.getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT id, name, email, department, risk_level, created_at FROM Employees WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    return res.status(200).json({ employee: rows[0] });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
};

// PUT /api/employees/:id
exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, department, risk_level } = req.body;

    const [existing] = await pool.execute('SELECT id FROM Employees WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (department !== undefined) {
      updates.push('department = ?');
      params.push(department);
    }
    if (risk_level !== undefined) {
      if (!['Low', 'Medium', 'High'].includes(risk_level)) {
        return res.status(400).json({ message: "risk_level must be 'Low', 'Medium', or 'High'." });
      }
      updates.push('risk_level = ?');
      params.push(risk_level);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No valid fields provided to update.' });
    }

    params.push(id);
    const sql = `UPDATE Employees SET ${updates.join(', ')} WHERE id = ?`;
    await pool.execute(sql, params);

    return res.status(200).json({ message: 'Employee updated successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
};

// DELETE /api/employees/:id
exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM Employees WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    return res.status(200).json({ message: 'Employee deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
};

// POST /api/employees/upload-csv
exports.uploadCSV = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Please upload a CSV file.' });
  }

  const results = [];
  const filePath = req.file.path;

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      const name = row.name || row.Name || '';
      const email = row.email || row.Email || '';
      const department = row.department || row.Department || 'General';

      if (name.trim() && email.trim()) {
        results.push([name.trim(), email.trim(), department.trim(), 'Low']);
      }
    })
    .on('end', async () => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      if (results.length === 0) {
        return res.status(400).json({ message: 'CSV file contains no valid rows.' });
      }

      try {
        const sql = `
          INSERT INTO Employees (name, email, department, risk_level)
          VALUES ?
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            department = VALUES(department)
        `;

        const [dbResult] = await pool.query(sql, [results]);

        return res.status(200).json({
          message: 'CSV processed successfully.',
          totalRows: results.length,
          affectedRows: dbResult.affectedRows
        });
      } catch (dbError) {
        return res.status(500).json({ message: 'Database insert failed.', error: dbError.message });
      }
    })
    .on('error', (err) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(500).json({ message: 'Failed to parse CSV.', error: err.message });
    });
};