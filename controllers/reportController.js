const PDFDocument = require('pdfkit');
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
 * Helper to fetch aggregated campaign dashboard statistics.
 */
const fetchCampaignStatistics = async (campaignId) => {
  const [campaignRows] = await pool.execute(
    'SELECT id, name, description, status, scheduled_at, created_at FROM Campaigns WHERE id = ?',
    [campaignId]
  );

  if (campaignRows.length === 0) {
    return null;
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

  const rates = {
    deliveryRate: percentage(metrics.delivered, metrics.totalSent),
    openRate: percentage(metrics.opened, metrics.totalSent),
    clickRate: percentage(metrics.clicked, metrics.totalSent),
    compromiseRate: percentage(metrics.compromised, metrics.totalSent),
    ignoredRate: percentage(metrics.ignored, metrics.totalSent)
  };

  const departments = departmentRows[0].map((row) => {
    const totalSent = asNumber(row.total_sent);
    const compromised = asNumber(row.compromised);
    const clicked = asNumber(row.clicked);

    return {
      department: row.department || 'General',
      totalRecipients: asNumber(row.total_recipients),
      totalSent,
      delivered: asNumber(row.delivered),
      opened: asNumber(row.opened),
      clicked,
      compromised,
      ignored: asNumber(row.ignored),
      failureRate: percentage(compromised, totalSent),
      clickRate: percentage(clicked, totalSent)
    };
  });

  return {
    campaign: campaignRows[0],
    metrics,
    rates,
    departments
  };
};

/**
 * GET /api/reports/campaign/:id
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
    const reportData = await fetchCampaignStatistics(campaignId);

    if (!reportData) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.'
      });
    }

    return res.status(200).json({
      success: true,
      ...reportData
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

/**
 * GET /api/reports/campaign/:id/pdf
 * Generates and streams a PDF executive report using PDFKit.
 */
exports.exportCampaignPDF = async (req, res) => {
  const campaignId = Number.parseInt(req.params.id, 10);

  if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
    return res.status(400).json({
      success: false,
      message: 'Campaign id must be a positive integer.'
    });
  }

  try {
    const reportData = await fetchCampaignStatistics(campaignId);

    if (!reportData) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.'
      });
    }

    const { campaign, metrics, rates, departments } = reportData;
    const sanitizedCampaignName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `campaign_${campaign.id}_${sanitizedCampaignName}_report.pdf`;

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    doc.pipe(res);

    // Header & Title
    doc.fillColor('#1E293B').fontSize(20).text('Campaign Performance Report', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#64748B').text(`Generated on: ${new Date().toUTCString()} | SME Phishing Simulation Platform`);
    doc.moveDown(0.8);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#E2E8F0').stroke();
    doc.moveDown(1);

    // Campaign Metadata Overview
    doc.fillColor('#0F172A').fontSize(14).text('Campaign Overview');
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Campaign Name: ${campaign.name}`);
    doc.text(`Status: ${campaign.status}`);
    doc.text(`Description: ${campaign.description || 'N/A'}`);
    doc.text(`Launched: ${campaign.created_at ? new Date(campaign.created_at).toUTCString() : 'N/A'}`);
    doc.moveDown(1.2);

    // Funnel Performance Table
    doc.fillColor('#0F172A').fontSize(14).text('Interaction Funnel & Conversion Rates');
    doc.moveDown(0.5);

    const startX = 40;
    let currentY = doc.y;

    doc.rect(startX, currentY, 515, 20).fill('#F1F5F9');
    doc.fillColor('#0F172A').fontSize(9).text('METRIC', startX + 10, currentY + 6);
    doc.text('COUNT', startX + 220, currentY + 6);
    doc.text('RATE (% OF SENT)', startX + 370, currentY + 6);

    currentY += 20;

    const summaryRows = [
      ['Total Targets / Recipient Pool', metrics.totalRecipients, '100%'],
      ['Emails Sent', metrics.totalSent, `${percentage(metrics.totalSent, metrics.totalRecipients)}%`],
      ['Delivered', metrics.delivered, `${rates.deliveryRate}%`],
      ['Opened (Tracking Pixel)', metrics.opened, `${rates.openRate}%`],
      ['Clicked (Link Redirection)', metrics.clicked, `${rates.clickRate}%`],
      ['Compromised (Payload Submitted)', metrics.compromised, `${rates.compromiseRate}%`],
      ['Ignored / Safe', metrics.ignored, `${rates.ignoredRate}%`]
    ];

    summaryRows.forEach((row, idx) => {
      if (idx % 2 === 1) {
        doc.rect(startX, currentY, 515, 18).fill('#F8FAFC');
      }
      doc.fillColor('#334155').fontSize(9).text(String(row[0]), startX + 10, currentY + 5);
      doc.text(String(row[1]), startX + 220, currentY + 5);
      doc.text(String(row[2]), startX + 370, currentY + 5);
      currentY += 18;
    });

    doc.y = currentY + 20;

    // Department Breakdown
    doc.fillColor('#0F172A').fontSize(14).text('Departmental Risk Breakdown');
    doc.moveDown(0.5);

    currentY = doc.y;
    doc.rect(startX, currentY, 515, 20).fill('#F1F5F9');
    doc.fillColor('#0F172A').fontSize(9);
    doc.text('DEPARTMENT', startX + 10, currentY + 6);
    doc.text('TARGETS', startX + 140, currentY + 6);
    doc.text('CLICKED', startX + 220, currentY + 6);
    doc.text('COMPROMISED', startX + 310, currentY + 6);
    doc.text('FAILURE RATE', startX + 420, currentY + 6);

    currentY += 20;

    departments.forEach((dept, idx) => {
      if (idx % 2 === 1) {
        doc.rect(startX, currentY, 515, 18).fill('#F8FAFC');
      }
      doc.fillColor('#334155').fontSize(9);
      doc.text(dept.department, startX + 10, currentY + 5);
      doc.text(String(dept.totalSent), startX + 140, currentY + 5);
      doc.text(String(dept.clicked), startX + 220, currentY + 5);
      doc.text(String(dept.compromised), startX + 310, currentY + 5);
      doc.text(`${dept.failureRate}%`, startX + 420, currentY + 5);
      currentY += 18;
    });

    // Footer
    doc.fontSize(8).fillColor('#94A3B8').text(
      'Confidential — For Internal Security Awareness Evaluation Only',
      40,
      780,
      { align: 'center', width: 515 }
    );

    doc.end();
  } catch (error) {
    console.error('Error generating campaign PDF:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Internal server error while generating campaign PDF.'
      });
    }
    return res.end();
  }
};
