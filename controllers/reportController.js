const pool = require('../config/db');

const asNumber = (value) => Number(value || 0);
const percentage = (numerator, denominator) => (
  denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0
);

/**
 * Escapes fields for CSV to prevent injection and layout corruption.
 */
const escapeCsvField = (value) => {
  if (value === null || value === undefined) {
    return '""';
  }
  const stringValue = String(value).replace(/"/g, '""');
  return `"${stringValue}"`;
};

/**
 * Common SQL subquery calculating per-recipient interaction flags.
 */
const recipientEventsSql = `
  SELECT
    cr.id AS recipient_id,
    cr.tracking_token,
    cr.sent_at,
    e.id AS employee_id,
    e.name AS employee_name,
    e.email AS employee_email,
    e.department,
    e.risk_level,
    MAX(CASE WHEN ee.event_type = 'Delivered' THEN 1 ELSE 0 END) AS delivered,
    MAX(CASE WHEN ee.event_type = 'Opened' THEN 1 ELSE 0 END) AS opened,
    MAX(CASE WHEN ee.event_type = 'Clicked' THEN 1 ELSE 0 END) AS clicked,
    MAX(CASE WHEN ee.event_type = 'Submitted' THEN 1 ELSE 0 END) AS submitted,
    MIN(CASE WHEN ee.event_type = 'Delivered' THEN ee.created_at END) AS delivered_at,
    MIN(CASE WHEN ee.event_type = 'Opened' THEN ee.created_at END) AS opened_at,
    MIN(CASE WHEN ee.event_type = 'Clicked' THEN ee.created_at END) AS clicked_at,
    MIN(CASE WHEN ee.event_type = 'Submitted' THEN ee.created_at END) AS submitted_at
  FROM CampaignRecipients cr
  INNER JOIN Employees e ON e.id = cr.employee_id
  LEFT JOIN EmailEvents ee ON ee.recipient_id = cr.id
  WHERE cr.campaign_id = ?
  GROUP BY
    cr.id,
    cr.tracking_token,
    cr.sent_at,
    e.id,
    e.name,
    e.email,
    e.department,
    e.risk_level
`;

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

  try {
    const [campaignRows] = await pool.execute(
      'SELECT id, name, description, status, scheduled_at, created_at FROM Campaigns WHERE id = ?',
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

/**
 * GET /api/reports/campaign/:id/csv
 * Streams detailed per-recipient interaction status for a campaign as a CSV file.
 */
exports.exportCampaignCSV = async (req, res) => {
  const campaignId = Number.parseInt(req.params.id, 10);

  if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
    return res.status(400).json({
      success: false,
      message: 'Campaign id must be a positive integer.'
    });
  }

  try {
    const [campaignRows] = await pool.execute(
      'SELECT id, name FROM Campaigns WHERE id = ?',
      [campaignId]
    );

    if (campaignRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.'
      });
    }

    const campaign = campaignRows[0];
    const sanitizedCampaignName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `campaign_${campaign.id}_${sanitizedCampaignName}_report.csv`;

    const [recipients] = await pool.execute(
      `SELECT * FROM (${recipientEventsSql}) AS recipient_events ORDER BY employee_name ASC`,
      [campaignId]
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const headers = [
      'Recipient ID',
      'Employee ID',
      'Employee Name',
      'Employee Email',
      'Department',
      'Risk Level',
      'Sent At',
      'Overall Status',
      'Delivered',
      'Delivered At',
      'Opened',
      'Opened At',
      'Clicked',
      'Clicked At',
      'Compromised',
      'Compromised At'
    ];

    res.write(headers.join(',') + '\r\n');

    for (const r of recipients) {
      let overallStatus = 'Pending';
      if (r.submitted === 1) {
        overallStatus = 'Compromised';
      } else if (r.clicked === 1) {
        overallStatus = 'Clicked';
      } else if (r.opened === 1) {
        overallStatus = 'Opened';
      } else if (r.delivered === 1) {
        overallStatus = 'Delivered';
      } else if (r.sent_at) {
        overallStatus = 'Sent';
      }

      const row = [
        escapeCsvField(r.recipient_id),
        escapeCsvField(r.employee_id),
        escapeCsvField(r.employee_name),
        escapeCsvField(r.employee_email),
        escapeCsvField(r.department || 'General'),
        escapeCsvField(r.risk_level || 'Low'),
        escapeCsvField(r.sent_at ? new Date(r.sent_at).toISOString() : 'N/A'),
        escapeCsvField(overallStatus),
        escapeCsvField(r.delivered === 1 ? 'Yes' : 'No'),
        escapeCsvField(r.delivered_at ? new Date(r.delivered_at).toISOString() : 'N/A'),
        escapeCsvField(r.opened === 1 ? 'Yes' : 'No'),
        escapeCsvField(r.opened_at ? new Date(r.opened_at).toISOString() : 'N/A'),
        escapeCsvField(r.clicked === 1 ? 'Yes' : 'No'),
        escapeCsvField(r.clicked_at ? new Date(r.clicked_at).toISOString() : 'N/A'),
        escapeCsvField(r.submitted === 1 ? 'Yes' : 'No'),
        escapeCsvField(r.submitted_at ? new Date(r.submitted_at).toISOString() : 'N/A')
      ];

      res.write(row.join(',') + '\r\n');
    }

    return res.end();
  } catch (error) {
    console.error('Error exporting campaign CSV:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Internal server error while exporting campaign CSV.'
      });
    }
    return res.end();
  }
};
