'use strict';

const pool = require('../config/db');

const RISK_TIERS = [
  'UNDETERMINED',
  'Perfect (0% Risk)',
  'Low (15% Risk)',
  'High (40% Risk)',
  'CRITICAL VERY HIGH (100% Risk)',
];

/**
 * Recalculates an employee's behavioral risk level based on EmailEvents and QuizResults:
 *  - No events & No quizzes   -> 'UNDETERMINED'
 *  - Targeted but No opens    -> 'Perfect (0% Risk)'
 *  - Opened email only        -> 'Low (15% Risk)'
 *  - Clicked phishing link    -> 'High (40% Risk)'
 *  - Submitted credentials    -> 'CRITICAL VERY HIGH (100% Risk)'
 *  - Passing a quiz steps risk down by 1 tier (down to minimum 'Perfect (0% Risk)').
 */
async function recalculateEmployeeRisk(employeeId) {
  if (!employeeId) return null;

  try {
    const [recipientRows] = await pool.execute(
      'SELECT id FROM CampaignRecipients WHERE employee_id = ?',
      [employeeId]
    );

    const [eventRows] = await pool.execute(
      `SELECT
         MAX(CASE WHEN ee.event_type = 'Opened' THEN 1 ELSE 0 END) AS has_opened,
         MAX(CASE WHEN ee.event_type = 'Clicked' THEN 1 ELSE 0 END) AS has_clicked,
         MAX(CASE WHEN ee.event_type = 'Submitted' THEN 1 ELSE 0 END) AS has_submitted
       FROM CampaignRecipients cr
       INNER JOIN EmailEvents ee ON ee.recipient_id = cr.id
       WHERE cr.employee_id = ?`,
      [employeeId]
    );

    const [quizRows] = await pool.execute(
      `SELECT COUNT(DISTINCT quiz_id) AS passed_quizzes
       FROM QuizResults
       WHERE employee_id = ? AND passed = 1`,
      [employeeId]
    );

    const passedQuizzes = Number(quizRows[0]?.passed_quizzes || 0);

    // If employee was never in a campaign and took no quizzes -> UNDETERMINED
    if (recipientRows.length === 0 && passedQuizzes === 0) {
      await pool.execute('UPDATE Employees SET risk_level = ? WHERE id = ?', [
        'UNDETERMINED',
        employeeId,
      ]);
      return 'UNDETERMINED';
    }

    const ev = eventRows[0] || {};
    let tierIndex = 1; // Default to 'Perfect (0% Risk)' once participating in drills

    if (Number(ev.has_submitted) === 1) {
      tierIndex = 4; // CRITICAL VERY HIGH (100% Risk)
    } else if (Number(ev.has_clicked) === 1) {
      tierIndex = 3; // High (40% Risk)
    } else if (Number(ev.has_opened) === 1) {
      tierIndex = 2; // Low (15% Risk)
    } else {
      tierIndex = 1; // Perfect (0% Risk)
    }

    if (passedQuizzes > 0 && tierIndex > 1) {
      tierIndex = Math.max(1, tierIndex - passedQuizzes);
    }

    const newRiskLevel = RISK_TIERS[tierIndex];

    await pool.execute('UPDATE Employees SET risk_level = ? WHERE id = ?', [
      newRiskLevel,
      employeeId,
    ]);

    return newRiskLevel;
  } catch (err) {
    console.error('[RiskEngine] Error recalculating employee risk:', err.message);
    return null;
  }
}

module.exports = {
  recalculateEmployeeRisk,
  RISK_TIERS,
};