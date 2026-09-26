'use strict';

const pool = require('../config/db');

const RISK_TIERS = {
  PERFECT: 'Perfect (0% Risk)',
  LOW: 'Low (15% Risk)',
  HIGH: 'High (40% Risk)',
  CRITICAL: 'CRITICAL VERY HIGH (100% Risk)'
};

/**
 * Recalculates an employee's exact risk score based on their EmailEvents reactions:
 * - Not opened: Perfect (0% Risk)
 * - Opened but no click: Low (15% Risk)
 * - Clicked link: High (40% Risk)
 * - Submitted credentials: CRITICAL VERY HIGH (100% Risk)
 */
async function recalculateEmployeeRisk(employeeId) {
  if (!employeeId) return null;

  const [rows] = await pool.execute(
    `SELECT
       MAX(CASE WHEN ee.event_type = 'Submitted' THEN 4
                WHEN ee.event_type = 'Clicked' THEN 3
                WHEN ee.event_type = 'Opened' THEN 2
                ELSE 1 END) AS max_severity
     FROM CampaignRecipients cr
     LEFT JOIN EmailEvents ee ON ee.recipient_id = cr.id
     WHERE cr.employee_id = ?`,
    [employeeId]
  );

  const severity = Number(rows[0]?.max_severity || 1);

  let newRisk = RISK_TIERS.PERFECT;
  if (severity === 4) {
    newRisk = RISK_TIERS.CRITICAL;
  } else if (severity === 3) {
    newRisk = RISK_TIERS.HIGH;
  } else if (severity === 2) {
    newRisk = RISK_TIERS.LOW;
  }

  await pool.execute(
    'UPDATE Employees SET risk_level = ? WHERE id = ?',
    [newRisk, employeeId]
  );

  return newRisk;
}

module.exports = {
  RISK_TIERS,
  recalculateEmployeeRisk
};