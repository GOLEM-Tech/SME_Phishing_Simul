'use strict';

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
 * Common SQL subquery calculating per-recipient interaction flags and timestamps.
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
    MAX(CASE WHEN ee.event_type IN ('Opened', 'Clicked', 'Submitted') THEN 1 ELSE 0 END) AS opened,
    MAX(CASE WHEN ee.event_type IN ('Clicked', 'Submitted') THEN 1 ELSE 0 END) AS clicked,
    MAX(CASE WHEN ee.event_type = 'Submitted' THEN 1 ELSE 0 END) AS submitted,
    MIN(CASE WHEN ee.event_type = 'Delivered' THEN ee.created_at END) AS delivered_at,
    MIN(CASE WHEN ee.event_type IN ('Opened', 'Clicked', 'Submitted') THEN ee.created_at END) AS opened_at,
    MIN(CASE WHEN ee.event_type IN ('Clicked', 'Submitted') THEN ee.created_at END) AS clicked_at,
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
 * Helper to fetch aggregated campaign statistics and full recipient reaction audit data.
 */
const fetchCampaignStatistics = async (campaignId) => {
  const [campaignRows] = await pool.execute(
    'SELECT id, name, description, status, scheduled_at, created_at FROM Campaigns WHERE id = ?',
    [campaignId]
  );

  if (campaignRows.length === 0) {
    return null;
  }

  const [metricRows, departmentRows, recipientAuditRows] = await Promise.all([
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
    `, [campaignId]),
    pool.execute(`
      SELECT
        employee_name,
        employee_email,
        department,
        risk_level,
        opened,
        opened_at,
        clicked,
        clicked_at,
        submitted,
        submitted_at
      FROM (${recipientEventsSql}) AS recipient_events
      ORDER BY submitted DESC, clicked DESC, opened DESC, employee_name ASC
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
    const opened = asNumber(row.opened);
    const clicked = asNumber(row.clicked);
    const compromised = asNumber(row.compromised);

    return {
      department: row.department || 'General',
      totalRecipients: asNumber(row.total_recipients),
      totalSent,
      delivered: asNumber(row.delivered),
      opened,
      clicked,
      compromised,
      ignored: asNumber(row.ignored),
      openRate: percentage(opened, totalSent),
      clickRate: percentage(clicked, totalSent),
      failureRate: percentage(compromised, totalSent)
    };
  });

  const recipientAudits = recipientAuditRows[0].map((row) => {
    const isSubmitted = Number(row.submitted) === 1;
    const isClicked = Number(row.clicked) === 1;
    const isOpened = Number(row.opened) === 1;

    let reactionLabel = '[PERFECT 0% RISK] Unopened';
    if (isSubmitted) {
      reactionLabel = '[CRITICAL 100% RISK] Compromised';
    } else if (isClicked) {
      reactionLabel = '[HIGH 40% RISK] Clicked Link';
    } else if (isOpened) {
      reactionLabel = '[LOW 15% RISK] Opened Only';
    }

    return {
      name: row.employee_name,
      email: row.employee_email,
      department: row.department || 'General',
      opened: isOpened,
      openedAt: row.opened_at ? new Date(row.opened_at).toLocaleString() : 'Not Opened',
      clicked: isClicked,
      clickedAt: row.clicked_at ? new Date(row.clicked_at).toLocaleString() : 'No Click',
      submitted: isSubmitted,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'N/A',
      reactionLabel
    };
  });

  return {
    campaign: campaignRows[0],
    metrics,
    rates,
    departments,
    recipientAudits
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
      'Behavioral Risk Score',
      'Sent At',
      'Overall Reaction',
      'Delivered',
      'Opened Email',
      'Opened At',
      'Clicked Link',
      'Clicked At',
      'Compromised (Submitted)',
      'Compromised At'
    ];

    res.write(headers.join(',') + '\r\n');

    for (const r of recipients) {
      let overallStatus = 'Perfect (0% Risk) - Unopened';
      if (Number(r.submitted) === 1) {
        overallStatus = 'CRITICAL VERY HIGH (100% Risk) - Compromised';
      } else if (Number(r.clicked) === 1) {
        overallStatus = 'High (40% Risk) - Clicked Link';
      } else if (Number(r.opened) === 1) {
        overallStatus = 'Low (15% Risk) - Opened Only';
      }

      const row = [
        escapeCsvField(r.recipient_id),
        escapeCsvField(r.employee_id),
        escapeCsvField(r.employee_name),
        escapeCsvField(r.employee_email),
        escapeCsvField(r.department || 'General'),
        escapeCsvField(r.risk_level || overallStatus),
        escapeCsvField(r.sent_at ? new Date(r.sent_at).toISOString() : 'N/A'),
        escapeCsvField(overallStatus),
        escapeCsvField(Number(r.delivered) === 1 ? 'Yes' : 'No'),
        escapeCsvField(Number(r.opened) === 1 ? 'Yes' : 'No'),
        escapeCsvField(r.opened_at ? new Date(r.opened_at).toISOString() : 'Not Opened'),
        escapeCsvField(Number(r.clicked) === 1 ? 'Yes' : 'No'),
        escapeCsvField(r.clicked_at ? new Date(r.clicked_at).toISOString() : 'No Click'),
        escapeCsvField(Number(r.submitted) === 1 ? 'Yes' : 'No'),
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
 * Generates an executive security evaluation audit report in Times New Roman,
 * showing Email Opens, Link Clicks, Compromises, and 4-Tier Behavioral Risk Scores.
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

    const { campaign, metrics, rates, departments, recipientAudits } = reportData;
    const sanitizedCampaignName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `campaign_${campaign.id}_${sanitizedCampaignName}_report.pdf`;

    const doc = new PDFDocument({ margin: 45, size: 'A4', bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    doc.pipe(res);

    const startX = 45;
    const tableWidth = 505;

    const checkPageBreak = (neededHeight) => {
      if (doc.y + neededHeight > 740) {
        doc.addPage();
        doc.y = 50;
      }
    };

    // ==========================================
    // DOCUMENT HEADER (TIMES NEW ROMAN)
    // ==========================================
    doc.font('Times-Bold').fontSize(22).fillColor('#0F172A').text('CAMPAIGN AUDIT & SECURITY REPORT', startX, 45);
    doc.moveDown(0.2);
    doc.font('Times-Italic').fontSize(10).fillColor('#475569')
       .text(`Generated on: ${new Date().toUTCString()} | Platform: SME_Phishing_Simulator`);
    doc.moveDown(0.5);

    doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).lineWidth(1.5).strokeColor('#0F172A').stroke();
    doc.moveDown(0.8);

    // ==========================================
    // 1. CAMPAIGN OVERVIEW METADATA
    // ==========================================
    doc.font('Times-Bold').fontSize(14).fillColor('#0F172A').text('1. Campaign Overview', startX);
    doc.moveDown(0.4);

    const metaY = doc.y;
    doc.rect(startX, metaY, tableWidth, 68).fill('#F8FAFC');
    doc.rect(startX, metaY, tableWidth, 68).strokeColor('#CBD5E1').lineWidth(0.8).stroke();

    doc.font('Times-Bold').fontSize(10).fillColor('#1E293B');
    doc.text('Campaign Name:', startX + 12, metaY + 10);
    doc.font('Times-Roman').text(campaign.name, startX + 115, metaY + 10);

    doc.font('Times-Bold').text('Execution Status:', startX + 12, metaY + 24);
    doc.font('Times-Roman').text(campaign.status, startX + 115, metaY + 24);

    doc.font('Times-Bold').text('Description:', startX + 12, metaY + 38);
    doc.font('Times-Roman').text(campaign.description || 'Automated drill', startX + 115, metaY + 38, { width: 370, ellipsis: true });

    doc.font('Times-Bold').text('Launched Date:', startX + 12, metaY + 52);
    doc.font('Times-Roman').text(campaign.created_at ? new Date(campaign.created_at).toUTCString() : 'N/A', startX + 115, metaY + 52);

    doc.y = metaY + 82;

    // ==========================================
    // 2. INTERACTION FUNNEL & CONVERSION RATES
    // ==========================================
    checkPageBreak(180);
    doc.font('Times-Bold').fontSize(14).fillColor('#0F172A').text('2. Interaction Funnel & Conversion Rates', startX);
    doc.moveDown(0.4);

    let curY = doc.y;
    doc.rect(startX, curY, tableWidth, 20).fill('#E2E8F0');
    doc.rect(startX, curY, tableWidth, 20).strokeColor('#94A3B8').lineWidth(0.5).stroke();

    doc.font('Times-Bold').fontSize(9).fillColor('#0F172A');
    doc.text('METRIC STAGE & RISK TIER', startX + 12, curY + 6);
    doc.text('RECIPIENT COUNT', startX + 260, curY + 6);
    doc.text('RATE (% OF SENT)', startX + 390, curY + 6);

    curY += 20;

    const summaryRows = [
      ['Total Targets / Recipient Pool', metrics.totalRecipients, '100%'],
      ['Simulations Dispatched', metrics.totalSent, `${percentage(metrics.totalSent, metrics.totalRecipients)}%`],
      ['Delivered (MTA Confirmed)', metrics.delivered, `${rates.deliveryRate}%`],
      ['Unopened / Ignored -> Perfect (0% Risk)', metrics.ignored, `${rates.ignoredRate}%`],
      ['Opened Email (1x1 Pixel) -> Low (15% Risk)', metrics.opened, `${rates.openRate}%`],
      ['Clicked Phishing Link -> High (40% Risk)', metrics.clicked, `${rates.clickRate}%`],
      ['Submitted Credentials -> CRITICAL (100% Risk)', metrics.compromised, `${rates.compromiseRate}%`]
    ];

    summaryRows.forEach((row, idx) => {
      const rowBg = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
      doc.rect(startX, curY, tableWidth, 18).fill(rowBg);
      doc.rect(startX, curY, tableWidth, 18).strokeColor('#E2E8F0').lineWidth(0.5).stroke();

      doc.font('Times-Roman').fontSize(9).fillColor('#1E293B');
      doc.text(String(row[0]), startX + 12, curY + 5);
      doc.text(String(row[1]), startX + 260, curY + 5);

      if (idx === 6 && metrics.compromised > 0) {
        doc.font('Times-Bold').fillColor('#B91C1C').text(String(row[2]), startX + 390, curY + 5);
      } else if (idx === 4 && metrics.opened > 0) {
        doc.font('Times-Bold').fillColor('#047857').text(String(row[2]), startX + 390, curY + 5);
      } else {
        doc.text(String(row[2]), startX + 390, curY + 5);
      }
      curY += 18;
    });

    doc.y = curY + 16;

    // ==========================================
    // 3. DEPARTMENTAL RISK BREAKDOWN (WITH OPENED COLUMN)
    // ==========================================
    checkPageBreak(120);
    doc.font('Times-Bold').fontSize(14).fillColor('#0F172A').text('3. Departmental Risk Breakdown (Opens, Clicks & Compromises)', startX);
    doc.moveDown(0.4);

    curY = doc.y;
    doc.rect(startX, curY, tableWidth, 20).fill('#E2E8F0');
    doc.rect(startX, curY, tableWidth, 20).strokeColor('#94A3B8').lineWidth(0.5).stroke();

    doc.font('Times-Bold').fontSize(9).fillColor('#0F172A');
    doc.text('DEPARTMENT', startX + 10, curY + 6);
    doc.text('SENT', startX + 135, curY + 6);
    doc.text('OPENED (15%)', startX + 195, curY + 6);
    doc.text('CLICKED (40%)', startX + 285, curY + 6);
    doc.text('COMPROMISED (100%)', startX + 370, curY + 6);

    curY += 20;

    departments.forEach((dept, idx) => {
      checkPageBreak(22);
      curY = doc.y;

      const rowBg = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
      doc.rect(startX, curY, tableWidth, 18).fill(rowBg);
      doc.rect(startX, curY, tableWidth, 18).strokeColor('#E2E8F0').lineWidth(0.5).stroke();

      doc.font('Times-Roman').fontSize(9).fillColor('#1E293B');
      doc.text(dept.department, startX + 10, curY + 5);
      doc.text(String(dept.totalSent), startX + 135, curY + 5);
      doc.text(`${dept.opened} (${dept.openRate}%)`, startX + 195, curY + 5);
      doc.text(`${dept.clicked} (${dept.clickRate}%)`, startX + 285, curY + 5);

      if (dept.compromised > 0) {
        doc.font('Times-Bold').fillColor('#B91C1C').text(`${dept.compromised} (${dept.failureRate}%)`, startX + 370, curY + 5);
      } else {
        doc.fillColor('#047857').text('0 (0%)', startX + 370, curY + 5);
      }
      curY += 18;
      doc.y = curY;
    });

    doc.y = curY + 18;

    // ==========================================
    // 4. COMPLETE EMPLOYEE REACTION & EMAIL OPEN ROSTER
    // ==========================================
    checkPageBreak(140);
    doc.font('Times-Bold').fontSize(14).fillColor('#0F172A').text('4. Employee Email Reaction & Behavioral Risk Audit', startX);
    doc.moveDown(0.3);
    doc.font('Times-Italic').fontSize(9).fillColor('#475569')
       .text('Complete log of whether each employee opened the email, clicked the link, or submitted credentials:');
    doc.moveDown(0.5);

    if (recipientAudits.length === 0) {
      doc.font('Times-Bold').fontSize(10).fillColor('#64748B')
         .text('No recipients enrolled in this campaign yet.');
      doc.moveDown(1.5);
    } else {
      curY = doc.y;
      doc.rect(startX, curY, tableWidth, 20).fill('#E2E8F0');
      doc.rect(startX, curY, tableWidth, 20).strokeColor('#94A3B8').lineWidth(0.5).stroke();

      doc.font('Times-Bold').fontSize(8.5).fillColor('#0F172A');
      doc.text('EMPLOYEE & DEPT', startX + 8, curY + 6);
      doc.text('OPENED EMAIL?', startX + 145, curY + 6);
      doc.text('CLICKED LINK?', startX + 255, curY + 6);
      doc.text('BEHAVIORAL RISK ASSESSMENT', startX + 350, curY + 6);

      curY += 20;

      recipientAudits.forEach((aud, idx) => {
        checkPageBreak(24);
        curY = doc.y;

        const rowBg = aud.submitted ? '#FEF2F2' : (aud.clicked ? '#FFFBEB' : (idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF'));
        doc.rect(startX, curY, tableWidth, 20).fill(rowBg);
        doc.rect(startX, curY, tableWidth, 20).strokeColor(aud.submitted ? '#FCA5A5' : '#E2E8F0').lineWidth(0.5).stroke();

        doc.font(aud.submitted ? 'Times-Bold' : 'Times-Roman').fontSize(8.5).fillColor(aud.submitted ? '#7F1D1D' : '#1E293B');
        doc.text(`${aud.name} (${aud.department})`, startX + 8, curY + 6, { width: 132, ellipsis: true });

        // OPENED EMAIL COLUMN
        doc.font('Times-Roman').fillColor(aud.opened ? '#0F172A' : '#64748B');
        doc.text(aud.opened ? `Yes (${aud.openedAt})` : 'No (Unopened)', startX + 145, curY + 6, { width: 105, ellipsis: true });

        // CLICKED LINK COLUMN
        doc.fillColor(aud.clicked ? '#B45309' : '#64748B');
        doc.text(aud.clicked ? `Yes (${aud.clickedAt})` : 'No Click', startX + 255, curY + 6, { width: 90, ellipsis: true });

        // 4-TIER BEHAVIORAL RISK SCORE COLUMN
        if (aud.submitted) {
          doc.font('Times-Bold').fillColor('#B91C1C').text(aud.reactionLabel, startX + 350, curY + 6);
        } else if (aud.clicked) {
          doc.font('Times-Bold').fillColor('#D97706').text(aud.reactionLabel, startX + 350, curY + 6);
        } else if (aud.opened) {
          doc.font('Times-Bold').fillColor('#047857').text(aud.reactionLabel, startX + 350, curY + 6);
        } else {
          doc.font('Times-Roman').fillColor('#0284C7').text(aud.reactionLabel, startX + 350, curY + 6);
        }

        curY += 20;
        doc.y = curY;
      });
    }

    doc.y = curY + 20;

    // ==========================================
    // 5. SECURITY AUDIT DEBRIEF (JOKE / EASTER EGG)
    // ==========================================
    checkPageBreak(75);
    const boxY = doc.y;
    doc.rect(startX, boxY, tableWidth, 48).fill('#FFFBEB');
    doc.rect(startX, boxY, tableWidth, 48).strokeColor('#F59E0B').lineWidth(1).stroke();

    const victim = recipientAudits.find(a => a.submitted) || recipientAudits.find(a => a.clicked);
    const chosenJoke = victim
      ? [
          `SECURITY AUDIT DEBRIEF: Employee ${victim.name} was caught lacking by a simulated phishing lure.`,
          `SECURITY AUDIT DEBRIEF: Employee ${victim.name} was caught codemaxxing in 4K and handed over credentials.`,
          `SECURITY AUDIT DEBRIEF: Employee ${victim.name} fell for the oldest trick in the corporate playbook.`
        ][Math.floor(Math.random() * 3)]
      : 'SECURITY AUDIT DEBRIEF: Zero employees were caught lacking in this drill — 100% security resilience!';

    doc.font('Times-Bold').fontSize(10).fillColor('#B45309')
       .text('POST-SIMULATION INTELLIGENCE NOTE:', startX + 14, boxY + 10);
    doc.font('Times-Italic').fontSize(9.5).fillColor('#78350F')
       .text(chosenJoke, startX + 14, boxY + 26, { width: 475 });

    // ==========================================
    // FOOTER ON ALL PAGES
    // ==========================================
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Times-Roman').fontSize(8.5).fillColor('#64748B').text(
        `CONFIDENTIAL — SME_Phishing_Simulator Evaluation Audit | Page ${i + 1} of ${range.count}`,
        startX,
        805,
        { align: 'center', width: tableWidth }
      );
    }

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

/**
 * GET /api/reports/training-progress
 */
exports.getEmployeeTrainingProgress = async (req, res) => {
  try {
    const { department, passed } = req.query;
    const conditions = [];
    const params = [];

    if (department && department.trim() !== '') {
      conditions.push('e.department = ?');
      params.push(department.trim());
    }

    if (passed !== undefined && passed !== '') {
      const isPassed = passed === 'true' || passed === '1';
      conditions.push('qr.passed = ?');
      params.push(isPassed ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        e.id AS employee_id,
        e.name AS employee_name,
        e.email AS employee_email,
        e.department,
        e.risk_level,
        COUNT(DISTINCT qr.id) AS total_quizzes_taken,
        COALESCE(MAX(qr.score), 0) AS highest_score,
        COALESCE(AVG(qr.score), 0) AS average_score,
        MAX(CASE WHEN qr.passed = 1 THEN 1 ELSE 0 END) AS has_passed_any,
        MAX(qr.completed_at) AS last_assessment_date
      FROM Employees e
      LEFT JOIN QuizResults qr ON e.id = qr.employee_id
      ${whereClause}
      GROUP BY
        e.id,
        e.name,
        e.email,
        e.department,
        e.risk_level
      ORDER BY e.department ASC, e.name ASC
    `;

    const [rows] = await pool.execute(query, params);

    const formattedData = rows.map((row) => ({
      employeeId: row.employee_id,
      name: row.employee_name,
      email: row.employee_email,
      department: row.department || 'General',
      riskLevel: row.risk_level,
      quizzesTaken: Number(row.total_quizzes_taken),
      highestScore: Number(row.highest_score),
      averageScore: Number(Number(row.average_score).toFixed(2)),
      hasPassed: row.has_passed_any === 1,
      lastAssessmentDate: row.last_assessment_date
    }));

    return res.status(200).json({
      success: true,
      count: formattedData.length,
      data: formattedData
    });
  } catch (error) {
    console.error('Error fetching training progress report:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving training progress report.'
    });
  }
};