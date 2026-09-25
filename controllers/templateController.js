'use strict';

// DB pool — parameterized queries only
const db = require('../config/db');

// --- Private: regex-based token replacement ---
// Replaces {{Token}} patterns; missing keys → empty string fallback
const compileTemplate = (htmlBody, variables = {}) => {
  if (typeof htmlBody !== 'string') return '';
  return htmlBody.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = variables[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
};

// --- CREATE ---
const createTemplate = async (req, res, next) => {
  try {
    const { name, description, subject, body_html, category } = req.body;

    if (!name || !subject || !body_html) {
      return res.status(400).json({
        success: false,
        message: 'Fields name, subject, body_html are required.',
      });
    }

    const sql = `
      INSERT INTO EmailTemplates (name, description, subject, body_html, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const [result] = await db.execute(sql, [
      name,
      description || null,
      subject,
      body_html,
      category || 'general',
    ]);

    return res.status(201).json({
      success: true,
      message: 'Template created.',
      data: { template_id: result.insertId },
    });
  } catch (err) {
    next(err);
  }
};

// --- READ ALL ---
const getAllTemplates = async (req, res, next) => {
  try {
    const sql = `
      SELECT
        template_id,
        name,
        description,
        subject,
        category,
        created_at,
        updated_at
      FROM EmailTemplates
      ORDER BY created_at DESC
    `;

    const [rows] = await db.execute(sql);

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    next(err);
  }
};

// --- READ ONE ---
const getTemplateById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        template_id,
        name,
        description,
        subject,
        body_html,
        category,
        created_at,
        updated_at
      FROM EmailTemplates
      WHERE template_id = ?
      LIMIT 1
    `;

    const [rows] = await db.execute(sql, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Template with id ${id} not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    next(err);
  }
};

// --- UPDATE ---
const updateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, subject, body_html, category } = req.body;

    // Build dynamic SET clause — only update provided fields
    const fields = [];
    const values = [];

    if (name !== undefined)        { fields.push('name = ?');        values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (subject !== undefined)     { fields.push('subject = ?');     values.push(subject); }
    if (body_html !== undefined)   { fields.push('body_html = ?');   values.push(body_html); }
    if (category !== undefined)    { fields.push('category = ?');    values.push(category); }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updatable fields provided.',
      });
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const sql = `UPDATE EmailTemplates SET ${fields.join(', ')} WHERE template_id = ?`;

    const [result] = await db.execute(sql, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: `Template with id ${id} not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Template updated.',
    });
  } catch (err) {
    next(err);
  }
};

// --- DELETE ---
const deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    const sql = `DELETE FROM EmailTemplates WHERE template_id = ?`;

    const [result] = await db.execute(sql, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: `Template with id ${id} not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Template ${id} permanently deleted.`,
    });
  } catch (err) {
    next(err);
  }
};

// --- PREVIEW: fetch template + inject mock vars → return compiled HTML ---
const previewTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    // variables: e.g. { EmployeeName: "John", TrackingToken: "abc123", RedirectURL: "https://..." }
    const { variables } = req.body;

    if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
      return res.status(400).json({
        success: false,
        message: 'Request body must include a variables object.',
      });
    }

    const sql = `
      SELECT template_id, name, subject, body_html
      FROM EmailTemplates
      WHERE template_id = ?
      LIMIT 1
    `;

    const [rows] = await db.execute(sql, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Template with id ${id} not found.`,
      });
    }

    const template = rows[0];
    const compiledSubject = compileTemplate(template.subject, variables);
    const compiledBody    = compileTemplate(template.body_html, variables);

    return res.status(200).json({
      success: true,
      data: {
        template_id:      template.template_id,
        name:             template.name,
        compiled_subject: compiledSubject,
        compiled_body:    compiledBody,
      },
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
  previewTemplate,
};
