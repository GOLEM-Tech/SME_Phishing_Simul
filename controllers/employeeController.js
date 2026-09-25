const fs = require('fs');
const csv = require('csv-parser');
const pool = require('../config/db');

// POST /api/employees
exports.createEmployee = async (req, res) => {
  try {
    const { name, email, department, risk_level } = req.body;

    if (!name || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and email are required.' 
      });
    }

    const dept = department && department.trim() !== '' ? department.trim() : 'General';
    const risk = risk_level && ['Low', 'Medium', 'High'].includes(risk_level) ? risk_level : 'Low';

    const [existing] = await pool.execute('SELECT id FROM Employees WHERE email = ?', [email.trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'Employee with this email already exists.' 
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO Employees (name, email, department, risk_level) VALUES (?, ?, ?, ?)',
      [name.trim(), email.trim(), dept, risk]
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
      message: 'Internal server error.', 
      error: error.message 
    });
  }
};

// GET /api/employees (supports ?search=keyword&department=IT&risk_level=High&page=1&limit=20)
exports.getAllEmployees = async (req, res) => {
  try {
    const { search, department, risk_level, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    // Search across name or email
    if (search && search.trim() !== '') {
      conditions.push('(name LIKE ? OR email LIKE ?)');
      const searchParam = `%${search.trim()}%`;
      params.push(searchParam, searchParam);
    }

    // Department filter
    if (department && department.trim() !== '') {
      conditions.push('department = ?');
      params.push(department.trim());
    }

    // Risk level filter
    if (risk_level && ['Low', 'Medium', 'High'].includes(risk_level.trim())) {
      conditions.push('risk_level = ?');
      params.push(risk_level.trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Fetch total count matching active filters
    const countSql = `SELECT COUNT(*) AS total FROM Employees ${whereClause}`;
    const [countRows] = await pool.execute(countSql, params);
    const totalRecords = countRows[0].total;
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;

    // 2. Fetch paginated slice (limit and offset passed as validated integers)
    const dataSql = `
      SELECT id, name, email, department, risk_level, created_at, updated_at
      FROM Employees
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [employees] = await pool.query(dataSql, [...params, limitNum, offset]);

    return res.status(200).json({
      success: true,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: pageNum,
        limit: limitNum
      },
      count: employees.length,
      employees
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error while retrieving employees.', 
      error: error.message 
    });
  }
};

// GET /api/employees/:id
exports.getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT id, name, email, department, risk_level, created_at, updated_at FROM Employees WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found.' 
      });
    }

    return res.status(200).json({ 
      success: true, 
      employee: rows[0] 
    });
  } catch (error) {
    console.error('Error fetching employee by id:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.', 
      error: error.message 
    });
  }
};

// PUT /api/employees/:id
exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, department, risk_level } = req.body;

    const [existing] = await pool.execute('SELECT id FROM Employees WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found.' 
      });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (department !== undefined) {
      updates.push('department = ?');
      params.push(department.trim());
    }
    if (risk_level !== undefined) {
      if (!['Low', 'Medium', 'High'].includes(risk_level)) {
        return res.status(400).json({ 
          success: false, 
          message: "risk_level must be 'Low', 'Medium', or 'High'." 
        });
      }
      updates.push('risk_level = ?');
      params.push(risk_level);
    }

    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid fields provided to update.' 
      });
    }

    params.push(id);
    const sql = `UPDATE Employees SET ${updates.join(', ')} WHERE id = ?`;
    await pool.execute(sql, params);

    return res.status(200).json({ 
      success: true, 
      message: 'Employee updated successfully.' 
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.', 
      error: error.message 
    });
  }
};

// DELETE /api/employees/:id
exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM Employees WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found.' 
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Employee deleted successfully.' 
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.', 
      error: error.message 
    });
  }
};

// POST /api/employees/upload-csv
exports.uploadCSV = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please upload a CSV file.' 
    });
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
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (results.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'CSV file contains no valid rows.' 
        });
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
          success: true,
          message: 'CSV processed successfully.',
          totalRows: results.length,
          affectedRows: dbResult.affectedRows
        });
      } catch (dbError) {
        console.error('Database insert error during CSV upload:', dbError);
        return res.status(500).json({ 
          success: false, 
          message: 'Database insert failed.', 
          error: dbError.message 
        });
      }
    })
    .on('error', (err) => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to parse CSV.', 
        error: err.message 
      });
    });
};