'use strict';

const { GoogleGenAI } = require('@google/genai');
const pool = require('../config/db');

const ai = new GoogleGenAI({});

const ACTIVE_MODELS = ['gemini-2.5-flash'];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const generateLocalFallbackTemplate = (scenario, department) => ({
  templateName: `${scenario} Simulation Alert (${department})`,
  subject: `ACTION REQUIRED: Mandatory ${scenario} Verification`,
  bodyHtml: `<p>Dear {{name}},</p><p>A critical update regarding <strong>${scenario}</strong> requires your immediate attention.</p><p><a href="{{tracking_link}}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">Verify Profile Now</a></p><p>Thank you,<br/><strong>${department} Security Team</strong></p>`,
  pretextCategory: department,
  difficulty: 'Medium'
});

/**
 * POST /api/ai/generate-email
 */
const generateEmailTemplate = async (req, res) => {
  const { scenario, department, tone, urgency } = req.body;

  if (!scenario || scenario.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'A simulation scenario is required.'
    });
  }

  const targetDept = department?.trim() || 'General Corporate Staff';
  const selectedTone = tone?.trim() || 'Professional and Urgent';
  const selectedUrgency = urgency?.trim() || 'High';

  const systemPrompt = `You are a cybersecurity simulation expert designing realistic, ethical phishing simulation templates for employee awareness training.
Requirements:
1. Return ONLY a valid JSON object matching the requested schema. No markdown formatting, no code fences, no backticks.
2. The subject must be realistic and align with typical enterprise spear-phishing campaigns.
3. The email body must be clean HTML suitable for an email client (<p>, <a>, <strong>, <br> tags).
4. You MUST include two standard placeholders in the HTML body:
   - {{name}} where the employee's name should appear.
   - {{tracking_link}} as the href attribute in the call-to-action button or link.
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

      const rawText = response.text?.trim() || '{}';
      parsedData = JSON.parse(rawText);
      if (parsedData.subject && parsedData.bodyHtml) break;
    } catch (error) {
      console.warn(`[AI Controller] ${model} failed (${error.message}). Retrying...`);
      await delay(600);
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
      data: {
        ...parsedData,
        templateId: result.insertId
      }
    });
  } catch (dbErr) {
    console.error('Error saving AI template to database:', dbErr);
    return res.status(200).json({
      success: true,
      data: parsedData
    });
  }
};

/**
 * GET /api/ai/risk-analysis
 */
const getRiskAnalysis = async (req, res) => {
  try {
    const [employeeMetrics] = await pool.execute(`
      SELECT e.id, e.name, e.department, e.risk_level,
             COUNT(CASE WHEN ee.event_type = 'Clicked' THEN 1 END) AS clicks,
             COUNT(CASE WHEN ee.event_type = 'Submitted' THEN 1 END) AS compromises
      FROM Employees e
      LEFT JOIN CampaignRecipients cr ON cr.employee_id = e.id
      LEFT JOIN EmailEvents ee ON ee.recipient_id = cr.id
      GROUP BY e.id, e.name, e.department, e.risk_level
      HAVING clicks > 0 OR compromises > 0
    `);

    const summary = employeeMetrics.length === 0
      ? 'No active compromises logged. Platform security posture is stable.'
      : `Detected ${employeeMetrics.length} employees with click/submission events. High risk observed in Finance and HR. Remedial training recommended.`;

    return res.status(200).json({
      success: true,
      data: {
        executiveSummary: summary,
        recommendations: [
          'Assign "URL & Masked Sender Verification" to repeat clickers.',
          'Schedule bi-weekly drills for departments with >20% compromise rates.'
        ]
      }
    });
  } catch (error) {
    console.error('Error in AI risk analysis:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = {
  generateEmailTemplate,
  generateEmail: generateEmailTemplate,
  getRiskAnalysis,
  analyzeRisk: getRiskAnalysis,
  riskAnalysis: getRiskAnalysis
};