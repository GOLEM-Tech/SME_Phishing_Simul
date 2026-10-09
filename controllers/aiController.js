/* eslint-env node */
'use strict';

const { GoogleGenAI } = require('@google/genai');
const pool = require('../config/db');

const ai = new GoogleGenAI({});
const ACTIVE_MODELS = ['gemini-2.5-flash'];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const generateLocalFallbackTemplate = (scenario, department) => ({
  templateName: `${scenario} Simulation Alert (${department})`,
  subject: `ACTION REQUIRED: Mandatory ${scenario} Verification`,
  bodyHtml: `<p>Dear {{name}},</p><p>A critical update regarding <strong>${scenario}</strong> requires your immediate attention.</p><p><a href="{{tracking_link}}" style="background:#2563eb;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Verify Account Now</a></p><p>Thank you,<br/><strong>${department} Security Operations</strong></p>`,
  pretextCategory: department,
  difficulty: 'Medium'
});

// POST /api/ai/generate-email
exports.generateEmailTemplate = async (req, res) => {
  const { scenario, department, tone, urgency } = req.body;

  if (!scenario || String(scenario).trim() === '') {
    return res.status(400).json({ success: false, message: 'A simulation scenario is required.' });
  }

  const targetDept = department ? String(department).trim() : 'General Staff';
  const selectedTone = tone ? String(tone).trim() : 'Professional and Urgent';
  const selectedUrgency = urgency ? String(urgency).trim() : 'High';

  const systemPrompt = `You are a cybersecurity simulation expert designing realistic, ethical phishing simulation templates for employee awareness training.
Requirements:
1. Return ONLY a valid JSON object matching the requested schema. No markdown fences, no backticks, no explanatory prose.
2. The subject line must be realistic and align with typical enterprise spear-phishing drills.
3. The email body must be clean HTML suitable for an email client (<p>, <a>, <strong>, <br> tags).
4. You MUST include two standard placeholders in the HTML body:
   - {{name}} where the employee's name should appear.
   - {{tracking_link}} as the href attribute in the call-to-action button or hyperlink.
5. Match this exact JSON schema:
   {
     "templateName": "Brief descriptive title",
     "subject": "Email subject line",
     "bodyHtml": "HTML body content including {{name}} and {{tracking_link}}",
     "pretextCategory": "e.g., IT Support, HR, Finance",
     "difficulty": "Easy | Medium | Hard"
   }`;

  const userPrompt = `Generate a phishing simulation template with:
- Scenario: ${scenario}
- Target Department: ${targetDept}
- Tone: ${selectedTone}
- Urgency Level: ${selectedUrgency}`;

  let parsedData = null;

  for (const model of ACTIVE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        config: { responseMimeType: 'application/json' }
      });

      const rawText = response.text ? response.text.trim() : '{}';
      parsedData = JSON.parse(rawText);
      if (parsedData.subject && parsedData.bodyHtml) break;
    } catch (error) {
      console.warn(`[AI Controller] ${model} attempt failed: ${error.message}`);
      await delay(500);
    }
  }

  if (!parsedData || !parsedData.subject) {
    parsedData = generateLocalFallbackTemplate(scenario, targetDept);
  }

  if (!parsedData.bodyHtml.includes('{{tracking_link}}')) {
    parsedData.bodyHtml += `<p><a href="{{tracking_link}}">Click here to verify</a></p>`;
  }
  if (!parsedData.bodyHtml.includes('{{name}}')) {
    parsedData.bodyHtml = `<p>Hello {{name}},</p>` + parsedData.bodyHtml;
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO EmailTemplates (name, subject, body_html) VALUES (?, ?, ?)',
      [parsedData.templateName || `${scenario} Drill`, parsedData.subject, parsedData.bodyHtml]
    );

    return res.status(200).json({
      success: true,
      subject: parsedData.subject,
      body_html: parsedData.bodyHtml,
      data: {
        ...parsedData,
        templateId: result.insertId
      }
    });
  } catch (dbErr) {
    console.error('Error saving AI template to database:', dbErr);
    return res.status(200).json({
      success: true,
      subject: parsedData.subject,
      body_html: parsedData.bodyHtml,
      data: parsedData
    });
  }
};

exports.generateEmail = exports.generateEmailTemplate;

// GET /api/ai/risk-analysis
exports.getRiskAnalysis = async (req, res) => {
  try {
    const [employeeMetrics] = await pool.execute(`
      SELECT 
        e.id, 
        e.name, 
        e.email, 
        COALESCE(e.department, 'General') AS department, 
        e.risk_level,
        COUNT(DISTINCT CASE WHEN ee.event_type = 'Clicked' THEN ee.id END) AS total_clicks,
        COUNT(DISTINCT CASE WHEN ee.event_type = 'Submitted' THEN ee.id END) AS total_compromises
      FROM Employees e
      LEFT JOIN CampaignRecipients cr ON cr.employee_id = e.id
      LEFT JOIN EmailEvents ee ON ee.recipient_id = cr.id
      GROUP BY e.id, e.name, e.email, e.department, e.risk_level
      HAVING total_clicks > 0 OR total_compromises > 0
      ORDER BY total_compromises DESC, total_clicks DESC
      LIMIT 10
    `);

    const [availableModules] = await pool.execute('SELECT id, title FROM TrainingModules ORDER BY id ASC LIMIT 5');

    const analysis = {
      executiveSummary: employeeMetrics.length > 0
        ? `Simulation telemetry highlights ${employeeMetrics.length} personnel requiring immediate training intervention due to active link clicks or credential submissions.`
        : 'Enterprise security posture is currently resilient. Zero active compromise cascades detected.',
      recommendations: [
        'Mandate Module 1 (Sender Verification & Spoofing Defense) for all employees with High or Critical risk ratings.',
        'Enforce FIDO2 / hardware MFA tokens across Finance and Executive cohorts.',
        'Schedule follow-up simulations targeting mobile authentication and urgent out-of-band pretexts.'
      ],
      highRiskEmployees: employeeMetrics.map(emp => ({
        employeeId: emp.id,
        name: emp.name,
        department: emp.department,
        risk: emp.risk_level,
        recommendedModule: availableModules[0]?.title || 'Sender Verification'
      }))
    };

    return res.status(200).json({
      success: true,
      data: analysis,
      analysis
    });
  } catch (error) {
    console.error('[aiController.getRiskAnalysis]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to compute risk analysis.',
      error: error.message
    });
  }
};

exports.analyzeRisk = exports.getRiskAnalysis;
exports.riskAnalysis = exports.getRiskAnalysis;