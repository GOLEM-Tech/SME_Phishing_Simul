const pool = require('../config/db');

const asNumber = (value) => Number(value || 0);

const percentage = (numerator, denominator) => (
  denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0
);

/**
 * GET /api/reports/campaign/:id
 * Returns recipient-deduplicated campaign metrics and a department breakdown.
 */
exports.getCampaignDashboard = async (req, res) => {
  const campaignId = Number.parseInt(req.params.id, 10);

  if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
    return res.status(400).json({
      success: false,
      message: 'Campaign id must be a positive integer.'
    });
  }

  const recipientEventsSql = `
    SELECT
      cr.id AS recipient_id,
      cr.sent_at,
      e.department,
      MAX(CASE WHEN ee.event_type = 'Delivered' THEN 1 ELSE 0 END) AS delivered,
      MAX(CASE WHEN ee.event_type = 'Opened' THEN 1 ELSE 0 END) AS opened,
      MAX(CASE WHEN ee.event_type = 'Clicked' THEN 1 ELSE 0 END) AS clicked,
      MAX(CASE WHEN ee.event_type = 'Submitted' THEN 1 ELSE 0 END) AS submitted
    FROM CampaignRecipients cr
    INNER JOIN Employees e ON e.id = cr.employee_id
    LEFT JOIN EmailEvents ee ON ee.recipient_id = cr.id
    WHERE cr.campaign_id = ?
    GROUP BY cr.id, cr.sent_at, e.department
  `;

  try {
    const [campaignRows] = await pool.execute(
      `SELECT id, name, description, status, scheduled_at, created_at
       FROM Campaigns
       WHERE id = ?`,
      [campaignId]
    );

    if (campaignRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.'
      });
    }

    const [metricRows, departmentRows] = await Promise.all([
      pool.execute(`
        SELECT
          COUNT(*) AS total_recipients,
          COALESCE(SUM(sent_at IS NOT NULL), 0) AS total_sent,
          COALESCE(SUM(delivered), 0) AS delivered,
          COALESCE(SUM(opened), 0) AS opened,
          COALESCE(SUM(clicked), 0) AS clicked,
          COALESCE(SUM(submitted), 0) AS compromised,
          COALESCE(SUM(
            sent_at IS NOT NULL AND opened = 0 AND clicked = 0 AND submitted = 0
          ), 0) AS ignored
        FROM (${recipientEventsSql}) AS recipient_events
      `, [campaignId]),
      pool.execute(`
        SELECT
          department,
          COUNT(*) AS total_recipients,
          COALESCE(SUM(sent_at IS NOT NULL), 0) AS total_sent,
          COALESCE(SUM(delivered), 0) AS delivered,
          COALESCE(SUM(opened), 0) AS opened,
          COALESCE(SUM(clicked), 0) AS clicked,
          COALESCE(SUM(submitted), 0) AS compromised,
          COALESCE(SUM(
            sent_at IS NOT NULL AND opened = 0 AND clicked = 0 AND submitted = 0
          ), 0) AS ignored
        FROM (${recipientEventsSql}) AS recipient_events
        GROUP BY department
        ORDER BY department ASC
      `, [campaignId])
    ]);

    const totals = metricRows[0][0];
    const metrics = {
      totalRecipients: asNumber(totals.total_recipients),
      totalSent: asNumber(totals.total_sent),
      delivered: asNumber(totals.delivered),
      opened: asNumber(totals.opened),
      clicked: asNumber(totals.clicked),
      compromised: asNumber(totals.compromised),
      ignored: asNumber(totals.ignored)
    };

    return res.status(200).json({
      success: true,
      campaign: campaignRows[0],
      metrics,
      rates: {
        deliveryRate: percentage(metrics.delivered, metrics.totalSent),
        openRate: percentage(metrics.opened, metrics.totalSent),
        clickRate: percentage(metrics.clicked, metrics.totalSent),
        compromiseRate: percentage(metrics.compromised, metrics.totalSent),
        ignoredRate: percentage(metrics.ignored, metrics.totalSent)
      },
      departments: departmentRows[0].map((row) => {
        const department = {
          department: row.department || 'General',
          totalRecipients: asNumber(row.total_recipients),
          totalSent: asNumber(row.total_sent),
          delivered: asNumber(row.delivered),
          opened: asNumber(row.opened),
          clicked: asNumber(row.clicked),
          compromised: asNumber(row.compromised),
          ignored: asNumber(row.ignored)
        };

        return {
          ...department,
          failureRate: percentage(department.compromised, department.totalSent),
          clickRate: percentage(department.clicked, department.totalSent)
        };
      })
    });
  } catch (error) {
    console.error('Error building campaign dashboard:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while building the campaign dashboard.'
    });
  }
};
