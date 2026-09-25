'use strict';

const { GoogleGenAI } = require('@google/genai');
const pool = require('../config/db');

const ai = new GoogleGenAI({});

// Active model candidates under API v1beta
const ACTIVE_MODELS = ['gemini-3.8-flash', 'gemini-3.8-pro'];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deterministic fallback generator if Google API experiences 503s or quota limits.
 */
const generateLocalFallbackTemplate = (scenario, department, tone, urgency) => {
  return {
    templateName: `${scenario} Simulation Notice (${department})`,
    subject: `Security Notice: ${scenario} - Verification Required`,
    bodyHtml: `
      <p>Dear {{name}},</p>
      <p>This is an automated notification from the <strong>${department} Department</strong> regarding a required update: <em>${scenario}</em>.</p>
      <p>Due to scheduled policy updates, failure to confirm your details within 24 hours will temporarily suspend internal portal access.</p>
      <p style="margin: 20px 0;">
        <a href="{{tracking_link}}" style="background-color: #2563eb; color: #ffffff; padding: 10px 18px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
          Verify ${scenario} Details
        </a>
      </p>
      <p>Regards,<br/><strong>${department} Compliance Team</strong></p>
    `.trim(),
    pretextCategory: department,
    difficulty: urgency === 'High' ? 'Medium' : 'Easy',
    generatedBy: 'system-offline-fallback'
  };
};

/**
 * POST /api/ai/generate-email
 * Generates context-aware simulation templates with retry handling and offline fallback.
 */
exports.generateEmailTemplate = async (req, res) => {
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
Your task is to generate a realistic phishing email template based on the provided inputs.
Requirements:
1. Return ONLY a valid JSON object matching the requested schema. No markdown formatting, no code fences, no backticks.
2. The subject must be realistic and align with typical enterprise training drills.
3. The email body must be clean HTML suitable for an email client (e.g., <p>, <a>, <strong>, <br> tags).
4. You MUST include two standard platform placeholders in the HTML body:
   - {{name}} where the employee's name should appear.
   - {{tracking_link}} as the href attribute in the call-to-action link.
5. The response must match this schema:
   {
     "templateName": "Brief descriptive title",
     "subject": "Email subject line",
     "bodyHtml": "HTML body content including {{name}} and {{tracking_link}}",
     "pretextCategory": "e.g., IT Support, HR, Finance, Executive Impersonation",
     "difficulty": "Easy | Medium | Hard"
   }`;

  const userPrompt = `Generate a simulation template with:
- Scenario: ${scenario}
- Target Department: ${targetDept}
- Tone: ${selectedTone}
- Urgency Level: ${selectedUrgency}`;

  for (const model of ACTIVE_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
          ],
          config: {
            responseMimeType: 'application/json'
          }
        });

        const rawText = response.text?.trim() || '{}';
        const parsedData = JSON.parse(rawText);

        return res.status(200).json({
          success: true,
          modelUsed: model,
          data: parsedData
        });
      } catch (error) {
        console.warn(`[AI Controller] ${model} attempt ${attempt} failed: ${error.message}`);
        if (error.message.includes('503') || error.message.includes('UNAVAILABLE')) {
          await delay(1000);
        } else {
          break;
        }
      }
    }
  }

  // Graceful degradation: return deterministic structured template so the platform never halts
  console.warn('[AI Controller] All remote AI models busy. Dispatching fallback template.');
  const fallback = generateLocalFallbackTemplate(scenario, targetDept, selectedTone, selectedUrgency);
  return res.status(200).json({
    success: true,
    modelUsed: 'offline-heuristic-generator',
    data: fallback
  });
};

/**
 * GET /api/ai/risk-analysis
 * Evaluates repeat compromise offenders across simulation history and
 * leverages Gemini to provide tailored awareness training recommendations.
 */
exports.getRiskAnalysisAndRecommendations = async (req, res) => {
  try {
    // 1. Fetch failure and interaction metrics per employee
    const [employeeMetrics] = await pool.execute(`
      SELECT 
        e.id,
        e.name,
        e.email,
        e.department,
        e.risk_level,
        COUNT(DISTINCT cr.campaign_id) AS campaigns_targeted,
        COUNT(DISTINCT CASE WHEN ee.event_type = 'Clicked' THEN ee.id END) AS total_clicks,
        COUNT(DISTINCT CASE WHEN ee.event_type = 'Submitted' THEN ee.id END) AS total_compromises
      FROM Employees e
      LEFT JOIN CampaignRecipients cr ON e.id = cr.employee_id
      LEFT JOIN EmailEvents ee ON cr.id = ee.recipient_id
      GROUP BY e.id, e.name, e.email, e.department, e.risk_level
      HAVING total_compromises > 0 OR total_clicks > 0
      ORDER BY total_compromises DESC, total_clicks DESC;
    `);

    // 2. Fetch available educational training modules
    const [availableModules] = await pool.execute(`
      SELECT id, title, content FROM TrainingModules;
    `);

    if (employeeMetrics.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No compromised employees found in simulation history.',
        analysis: {
          summary: 'Workforce simulation posture is currently clean. No click or compromise events logged.',
          recommendations: []
        }
      });
    }

    const systemPrompt = `You are a Chief Information Security Officer (CISO) and enterprise risk analyst.
Analyze the provided employee simulation failure data alongside the company's available training modules.
Requirements:
1. Return ONLY valid JSON matching this schema:
   {
     "executiveSummary": "2-3 sentences summarizing the organization's current vulnerability posture and high-risk departments",
     "highRiskEmployees": [
       {
         "employeeId": 1,
         "name": "Employee Name",
         "vulnerabilityReason": "Why they are at risk based on their click/compromise counts",
         "recommendedModuleId": 1,
         "recommendedModuleTitle": "Exact Title of the Module"
       }
     ],
     "departmentFocusAreas": [
       {
         "department": "Department Name",
         "priority": "High | Medium | Low",
         "actionItem": "Prescribed organizational corrective action"
       }
     ]
   }
2. Strictly map recommended modules ONLY to the available modules provided in the input.`;

    const userPrompt = `Simulation failure data:
${JSON.stringify(employeeMetrics, null, 2)}

Available Training Modules:
${JSON.stringify(availableModules, null, 2)}`;

    let aiAnalysis = null;

    for (const model of ACTIVE_MODELS) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [
              { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
            ],
            config: {
              responseMimeType: 'application/json'
            }
          });

          const rawText = response.text?.trim() || '{}';
          aiAnalysis = JSON.parse(rawText);
          break;
        } catch (error) {
          console.warn(`[AI Risk Analysis] ${model} attempt ${attempt} failed: ${error.message}`);
          if (error.message.includes('503') || error.message.includes('UNAVAILABLE')) {
            await delay(1000);
          } else {
            break;
          }
        }
      }
      if (aiAnalysis) break;
    }

    // Heuristic fallback if AI service is unavailable
    if (!aiAnalysis) {
      aiAnalysis = {
        executiveSummary: `Simulation telemetry indicates ${employeeMetrics.length} employees have triggered click or credential capture interactions. Immediate targeted remediation is recommended.`,
        highRiskEmployees: employeeMetrics.map((emp) => ({
          employeeId: emp.id,
          name: emp.name,
          vulnerabilityReason: `Logged ${emp.total_compromises} credential submission(s) and ${emp.total_clicks} link click(s).`,
          recommendedModuleId: availableModules[0]?.id || 1,
          recommendedModuleTitle: availableModules[0]?.title || 'General Awareness Module'
        })),
        departmentFocusAreas: [
          {
            department: employeeMetrics[0]?.department || 'General',
            priority: 'High',
            actionItem: 'Assign mandatory credential safety retraining module.'
          }
        ]
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        rawMetrics: employeeMetrics,
        aiAnalysis
      }
    });
  } catch (error) {
    console.error('Error computing risk analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while compiling AI risk analysis.',
      error: error.message
    });
  }
};