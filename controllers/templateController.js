'use strict';

const pool = require('../config/db');

// Token interpolator: replaces {{Placeholder}} patterns
const compileTemplate = (text, variables = {}) => {
  if (typeof text !== 'string') return '';
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = variables[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
};

// POST /api/templates
const createTemplate = async (req, res, next) => {
  try {
    const { name, subject, body_html } = req.body;

    if (!name || !subject || !body_html) {
      return res.status(400).json({
        success: false,
        message: 'name, subject, and body_html are required fields.'
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO EmailTemplates (name, subject, body_html) VALUES (?, ?, ?)',
      [name, subject, body_html]
    );

    return res.status(201).json({
      success: true,
      message: 'Template created successfully.',
      data: { id: result.insertId }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/templates
const getAllTemplates = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, subject, body_html, created_at FROM EmailTemplates ORDER BY created_at DESC'
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/templates/:id
const getTemplateById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      'SELECT id, name, subject, body_html, created_at FROM EmailTemplates WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Template with ID ${id} not found.`
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/templates/:id
const updateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, subject, body_html } = req.body;

    const fields = [];
    const values = [];

    if (name !== undefined)      { fields.push('name = ?');      values.push(name); }
    if (subject !== undefined)   { fields.push('subject = ?');   values.push(subject); }
    if (body_html !== undefined) { fields.push('body_html = ?'); values.push(body_html); }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updatable fields provided.'
      });
    }

    values.push(id);
    const sql = `UPDATE EmailTemplates SET ${fields.join(', ')} WHERE id = ?`;

    const [result] = await pool.execute(sql, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: `Template with ID ${id} not found.`
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Template updated successfully.'
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/templates/:id
const deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM EmailTemplates WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: `Template with ID ${id} not found.`
      });
    }

    return res.status(200).json({
      success: true,
      message: `Template ${id} deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/templates/:id/preview
const previewTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;

    if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
      return res.status(400).json({
        success: false,
        message: 'Request body must include a variables object.'
      });
    }

    const [rows] = await pool.execute(
      'SELECT id, name, subject, body_html FROM EmailTemplates WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Template with ID ${id} not found.`
      });
    }

    const template = rows[0];
    const compiledSubject = compileTemplate(template.subject, variables);
    const compiledBody    = compileTemplate(template.body_html, variables);

    return res.status(200).json({
      success: true,
      data: {
        id: template.id,
        name: template.name,
        compiled_subject: compiledSubject,
        compiled_body: compiledBody
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  compileTemplate,
  createTemplate,
  getAllTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  previewTemplate
};
