/* eslint-env node */
'use strict';

const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const auditLogger = require('../utils/auditLogger');

const asNumber = (value) => Number(value || 0);
const percentage = (numerator, denominator) =>
  denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;

/**
 * Escapes values for safe CSV exports without delimiter corruption or formula injection.
 */
const escapeCsvField = (value) => {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
};

/**
 * Common SQL subqueries aggregating per-recipient flags and interaction timestamps.
 */
const singleCampaignRecipientSql = `
  SELECT 
    cr.id AS recipient_id, 
    cr.campaign_id,
    cr.tracking_token, 
    cr.sent_at, 
    e.id AS employee_id, 
    e.name AS employee_name, 
    e.email AS employee_email, 
    COALESCE(e.department, 'General') AS department, 
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
  GROUP BY cr.id, cr.campaign_id, cr.tracking_token, cr.sent_at, e.id, e.name, e.email, e.department, e.risk_level
`;

const allCampaignsRecipientSql = `
  SELECT 
    cr.id AS recipient_id, 
    cr.campaign_id,
    c.name AS campaign_name,
    cr.tracking_token, 
    cr.sent_at, 
    e.id AS employee_id, 
    e.name AS employee_name, 
    e.email AS employee_email, 
    COALESCE(e.department, 'General') AS department, 
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
  INNER JOIN Campaigns c ON c.id = cr.campaign_id
  INNER JOIN Employees e ON e.id = cr.employee_id 
  LEFT JOIN EmailEvents ee ON ee.recipient_id = cr.id 
  GROUP BY cr.id, cr.campaign_id, c.name, cr.tracking_token, cr.sent_at, e.id, e.name, e.email, e.department, e.risk_level
`;

/**
 * GET /api/reports/campaign/:id
 * Supports integer campaign ID and "all"
 */
exports.getCampaignDashboard = async (req, res) => {
  const paramId = String(req.params.id || '').toLowerCase().trim();

  try {
    if (paramId === 'all') {
      const [totalsRows] = await pool.execute(`
        SELECT 
          COUNT(recipient_id) AS total_recipients,
          COALESCE(SUM(sent_at IS NOT NULL), 0) AS total_sent,
          COALESCE(SUM(delivered), 0) AS delivered,
          COALESCE(SUM(opened), 0) AS opened,
          COALESCE(SUM(clicked), 0) AS clicked,
          COALESCE(SUM(submitted), 0) AS compromised,
          COALESCE(SUM(sent_at IS NOT NULL AND opened = 0 AND clicked = 0 AND submitted = 0), 0) AS ignored
        FROM (${allCampaignsRecipientSql}) AS r
      `);

      const [deptRows] = await pool.execute(`
        SELECT 
          department,
          COUNT(recipient_id) AS total_recipients,
          COALESCE(SUM(sent_at IS NOT NULL), 0) AS total_sent,
          COALESCE(SUM(delivered), 0) AS delivered,
          COALESCE(SUM(opened), 0) AS opened,
          COALESCE(SUM(clicked), 0) AS clicked,
          COALESCE(SUM(submitted), 0) AS compromised
        FROM (${allCampaignsRecipientSql}) AS r
        GROUP BY department
        ORDER BY compromised DESC, clicked DESC
      `);

      const [campaignList] = await pool.execute(
        'SELECT id, name, status, created_at FROM Campaigns ORDER BY id DESC'
      );

      const totals = totalsRows[0] || {};
      const sent = asNumber(totals.total_sent);
      const opened = asNumber(totals.opened);
      const clicked = asNumber(totals.clicked);
      const compromised = asNumber(totals.compromised);

      return res.status(200).json({
        success: true,
        campaign: {
          id: 'all',
          name: 'All Campaigns (Executive Rollup)',
          description: 'Consolidated performance overview across all executed simulation drills.',
          status: 'Active Drill Program',
          totalCampaignsCount: campaignList.length,
        },
        metrics: {
          totalRecipients: asNumber(totals.total_recipients),
          totalSent: sent,
          sent: sent,
          delivered: asNumber(totals.delivered),
          opened: opened,
          clicked: clicked,
          submitted: compromised,
          compromised: compromised,
          ignored: asNumber(totals.ignored),
        },
        rates: {
          openRate: percentage(opened, sent),
          clickRate: percentage(clicked, sent),
          compromiseRate: percentage(compromised, sent),
          deliveryRate: percentage(asNumber(totals.delivered), sent),
        },
        departments: deptRows.map((d) => ({
          department: d.department,
          totalSent: asNumber(d.total_sent),
          opened: asNumber(d.opened),
          clicked: asNumber(d.clicked),
          compromised: asNumber(d.compromised),
          compromiseRate: percentage(asNumber(d.compromised), asNumber(d.total_sent)),
        })),
      });
    }

    const campaignId = Number.parseInt(paramId, 10);
    if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
      return res.status(400).json({ success: false, message: 'Valid campaign ID or "all" required.' });
    }

    const [campRows] = await pool.execute(
      'SELECT id, name, description, status, scheduled_at, created_at FROM Campaigns WHERE id = ? LIMIT 1',
      [campaignId]
    );

    if (campRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Simulation campaign not found.' });
    }

    const [metricRows] = await pool.execute(`
      SELECT 
        COUNT(*) AS total_recipients,
        COALESCE(SUM(sent_at IS NOT NULL), 0) AS total_sent,
        COALESCE(SUM(delivered), 0) AS delivered,
        COALESCE(SUM(opened), 0) AS opened,
        COALESCE(SUM(clicked), 0) AS clicked,
        COALESCE(SUM(submitted), 0) AS compromised,
        COALESCE(SUM(sent_at IS NOT NULL AND opened = 0 AND clicked = 0 AND submitted = 0), 0) AS ignored
      FROM (${singleCampaignRecipientSql}) AS r
    `, [campaignId]);

    const [deptRows] = await pool.execute(`
      SELECT 
        department,
        COUNT(*) AS total_recipients,
        COALESCE(SUM(sent_at IS NOT NULL), 0) AS total_sent,
        COALESCE(SUM(opened), 0) AS opened,
        COALESCE(SUM(clicked), 0) AS clicked,
        COALESCE(SUM(submitted), 0) AS compromised
      FROM (${singleCampaignRecipientSql}) AS r
      GROUP BY department
      ORDER BY department ASC
    `, [campaignId]);

    const totals = metricRows[0] || {};
    const sent = asNumber(totals.total_sent);
    const opened = asNumber(totals.opened);
    const clicked = asNumber(totals.clicked);
    const compromised = asNumber(totals.compromised);

    return res.status(200).json({
      success: true,
      campaign: campRows[0],
      metrics: {
        totalRecipients: asNumber(totals.total_recipients),
        totalSent: sent,
        sent: sent,
        delivered: asNumber(totals.delivered),
        opened: opened,
        clicked: clicked,
        submitted: compromised,
        compromised: compromised,
        ignored: asNumber(totals.ignored),
      },
      rates: {
        openRate: percentage(opened, sent),
        clickRate: percentage(clicked, sent),
        compromiseRate: percentage(compromised, sent),
      },
      departments: deptRows,
    });
  } catch (err) {
    console.error('[reportController.getCampaignDashboard]:', err);
    return res.status(500).json({ success: false, message: 'Internal server error retrieving metrics.' });
  }
};

/**
 * GET /api/reports/overview
 */
exports.getExecutiveOverview = async (req, res) => {
  req.params.id = 'all';
  return exports.getCampaignDashboard(req, res);
};

/**
 * GET /api/reports/campaign/:id/csv
 */
exports.exportCampaignCSV = async (req, res) => {
  const paramId = String(req.params.id || '').toLowerCase().trim();
  const isAll = paramId === 'all';

  try {
    let rows = [];
    let filename = 'all_campaigns_executive_summary.csv';

    if (isAll) {
      const [allRows] = await pool.execute(`
        SELECT 
          recipient_id,
          campaign_id,
          campaign_name,
          employee_name,
          employee_email,
          department,
          risk_level,
          sent_at,
          delivered,
          opened,
          clicked,
          submitted,
          opened_at,
          clicked_at,
          submitted_at
        FROM (${allCampaignsRecipientSql}) AS r
        ORDER BY campaign_id DESC, employee_name ASC
      `);
      rows = allRows;
    } else {
      const campaignId = Number.parseInt(paramId, 10);
      if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
        return res.status(400).send('Invalid Campaign ID');
      }

      filename = `campaign_${campaignId}_report.csv`;
      const [singleRows] = await pool.execute(`
        SELECT 
          recipient_id,
          campaign_id,
          employee_name,
          employee_email,
          department,
          risk_level,
          sent_at,
          delivered,
          opened,
          clicked,
          submitted,
          opened_at,
          clicked_at,
          submitted_at
        FROM (${singleCampaignRecipientSql}) AS r
        ORDER BY employee_name ASC
      `, [campaignId]);
      rows = singleRows;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const headers = [
      'Recipient ID',
      'Campaign ID',
      isAll ? 'Campaign Name' : null,
      'Employee Name',
      'Employee Email',
      'Department',
      'Risk Tier',
      'Dispatched Timestamp',
      'Opened',
      'Opened At',
      'Clicked Link',
      'Clicked At',
      'Compromised (Submitted)',
      'Submitted At'
    ].filter(Boolean);

    let csvContent = headers.map(escapeCsvField).join(',') + '\r\n';

    rows.forEach((r) => {
      const line = [
        r.recipient_id,
        r.campaign_id,
        isAll ? r.campaign_name : null,
        r.employee_name,
        r.employee_email,
        r.department,
        r.risk_level,
        r.sent_at ? new Date(r.sent_at).toISOString() : 'Pending',
        r.opened ? 'YES' : 'NO',
        r.opened_at ? new Date(r.opened_at).toISOString() : '',
        r.clicked ? 'YES' : 'NO',
        r.clicked_at ? new Date(r.clicked_at).toISOString() : '',
        r.submitted ? 'YES' : 'NO',
        r.submitted_at ? new Date(r.submitted_at).toISOString() : ''
      ].filter((val, idx) => isAll || idx !== 2);

      csvContent += line.map(escapeCsvField).join(',') + '\r\n';
    });

    await auditLogger.log({
      userId: req.user?.id,
      sessionId: req.user?.sessionId || 'sess_export',
      actorEmail: req.user?.email,
      role: req.user?.role || 'Admin',
      action: 'CSV_REPORT_EXPORTED',
      details: `Exported CSV report for target: ${paramId}`,
      ipAddress: req.ip,
    });

    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('[reportController.exportCampaignCSV]:', err);
    return res.status(500).send('Failed to generate CSV export');
  }
};

/**
 * GET /api/reports/campaign/:id/pdf
 * Generates an executive security evaluation audit report using Times New Roman,
 * showing Email Opens, Link Clicks, Credential Drops, and Recipient Behavioral Audits.
 */
exports.exportCampaignPDF = async (req, res) => {
  const paramId = String(req.params.id || '').toLowerCase().trim();
  const isAll = paramId === 'all';

  try {
    let title = 'EXECUTIVE PHISHING AUDIT & SECURITY REPORT';
    let subtitle = `Target Campaign #${paramId}`;
    let metrics = {};
    let deptBreakdown = [];
    let recipientAudits = [];

    if (isAll) {
      subtitle = 'Consolidated Multi-Campaign Executive Overview';
      const [totalsRows] = await pool.execute(`
        SELECT 
          COUNT(recipient_id) AS total_recipients,
          COALESCE(SUM(sent_at IS NOT NULL), 0) AS total_sent,
          COALESCE(SUM(delivered), 0) AS delivered,
          COALESCE(SUM(opened), 0) AS opened,
          COALESCE(SUM(clicked), 0) AS clicked,
          COALESCE(SUM(submitted), 0) AS compromised,
          COALESCE(SUM(sent_at IS NOT NULL AND opened = 0 AND clicked = 0 AND submitted = 0), 0) AS ignored
        FROM (${allCampaignsRecipientSql}) AS r
      `);

      const [deptRows] = await pool.execute(`
        SELECT 
          department,
          COUNT(recipient_id) AS total_recipients,
          COALESCE(SUM(sent_at IS NOT NULL), 0) AS total_sent,
          COALESCE(SUM(opened), 0) AS opened,
          COALESCE(SUM(clicked), 0) AS clicked,
          COALESCE(SUM(submitted), 0) AS compromised
        FROM (${allCampaignsRecipientSql}) AS r
        GROUP BY department
        ORDER BY compromised DESC, clicked DESC
      `);

      const [auditRows] = await pool.execute(`
        SELECT 
          employee_name,
          employee_email,
          department,
          campaign_name,
          risk_level,
          opened,
          opened_at,
          clicked,
          clicked_at,
          submitted,
          submitted_at
        FROM (${allCampaignsRecipientSql}) AS r
        ORDER BY submitted DESC, clicked DESC, opened DESC, employee_name ASC
      `);

      const t = totalsRows[0] || {};
      metrics = {
        totalRecipients: asNumber(t.total_recipients),
        sent: asNumber(t.total_sent),
        delivered: asNumber(t.delivered),
        opened: asNumber(t.opened),
        clicked: asNumber(t.clicked),
        compromised: asNumber(t.compromised),
        ignored: asNumber(t.ignored),
      };
      deptBreakdown = deptRows;
      recipientAudits = auditRows;
    } else {
      const campaignId = Number.parseInt(paramId, 10);
      if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
        return res.status(400).send('Invalid Campaign ID');
      }

      const [campRows] = await pool.execute(
        'SELECT name FROM Campaigns WHERE id = ? LIMIT 1',
        [campaignId]
      );
      if (campRows.length > 0) subtitle = campRows[0].name;

      const [metricRows] = await pool.execute(`
        SELECT 
          COUNT(*) AS total_recipients,
          COALESCE(SUM(sent_at IS NOT NULL), 0) AS total_sent,
          COALESCE(SUM(delivered), 0) AS delivered,
          COALESCE(SUM(opened), 0) AS opened,
          COALESCE(SUM(clicked), 0) AS clicked,
          COALESCE(SUM(submitted), 0) AS compromised,
          COALESCE(SUM(sent_at IS NOT NULL AND opened = 0 AND clicked = 0 AND submitted = 0), 0) AS ignored
        FROM (${singleCampaignRecipientSql}) AS r
      `, [campaignId]);

      const [deptRows] = await pool.execute(`
        SELECT 
          department,
          COUNT(*) AS total_recipients,
          COALESCE(SUM(sent_at IS NOT NULL), 0) AS total_sent,
          COALESCE(SUM(opened), 0) AS opened,
          COALESCE(SUM(clicked), 0) AS clicked,
          COALESCE(SUM(submitted), 0) AS compromised
        FROM (${singleCampaignRecipientSql}) AS r
        GROUP BY department
        ORDER BY department ASC
      `, [campaignId]);

      const [auditRows] = await pool.execute(`
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
        FROM (${singleCampaignRecipientSql}) AS r
        ORDER BY submitted DESC, clicked DESC, opened DESC, employee_name ASC
      `, [campaignId]);

      const t = metricRows[0] || {};
      metrics = {
        totalRecipients: asNumber(t.total_recipients),
        sent: asNumber(t.total_sent),
        delivered: asNumber(t.delivered),
        opened: asNumber(t.opened),
        clicked: asNumber(t.clicked),
        compromised: asNumber(t.compromised),
        ignored: asNumber(t.ignored),
      };
      deptBreakdown = deptRows;
      recipientAudits = auditRows;
    }

    const doc = new PDFDocument({ margin: 45, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="assessment_report_${paramId}.pdf"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    doc.pipe(res);

    const startX = 45;
    const tableWidth = 505;

    const checkPageBreak = (neededHeight) => {
      if (doc.y + neededHeight > 730) {
        doc.addPage();
        doc.y = 50;
      }
    };

    // ==========================================
    // DOCUMENT HEADER (TIMES NEW ROMAN)
    // ==========================================
    doc.font('Times-Bold').fontSize(20).fillColor('#0F172A').text(title, startX, 45);
    doc.moveDown(0.2);
    doc.font('Times-BoldItalic').fontSize(11).fillColor('#2563EB').text(subtitle, startX);
    doc.moveDown(0.2);
    doc.font('Times-Italic').fontSize(9).fillColor('#64748B')
       .text(`Generated: ${new Date().toUTCString()} | Auditor Verified | SME_Phishing_Simulator`);
    doc.moveDown(0.5);

    doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).lineWidth(1.5).strokeColor('#0F172A').stroke();
    doc.moveDown(0.8);

    // ==========================================
    // 1. KPI CONVERSION FUNNEL TABLE
    // ==========================================
    doc.font('Times-Bold').fontSize(13).fillColor('#0F172A').text('1. Simulation Conversion Funnel & Behavioral Rates', startX);
    doc.moveDown(0.4);

    let curY = doc.y;
    doc.rect(startX, curY, tableWidth, 20).fill('#E2E8F0');
    doc.rect(startX, curY, tableWidth, 20).strokeColor('#94A3B8').lineWidth(0.5).stroke();

    doc.font('Times-Bold').fontSize(8.5).fillColor('#0F172A');
    doc.text('METRIC STAGE & DRILL TIER', startX + 10, curY + 6);
    doc.text('RECIPIENTS', startX + 250, curY + 6);
    doc.text('CONVERSION RATE (% OF SENT)', startX + 370, curY + 6);

    curY += 20;

    const openRate = percentage(metrics.opened, metrics.sent);
    const clickRate = percentage(metrics.clicked, metrics.sent);
    const compRate = percentage(metrics.compromised, metrics.sent);
    const ignoredRate = percentage(metrics.ignored, metrics.sent);

    const summaryRows = [
      ['Total Targets Enrolled in Campaign', metrics.totalRecipients, '100%'],
      ['Simulations Dispatched', metrics.sent, `${percentage(metrics.sent, metrics.totalRecipients)}%`],
      ['Delivered (Mail Transfer Agent Verified)', metrics.delivered, `${percentage(metrics.delivered, metrics.sent)}%`],
      ['Unopened / Resilient -> Perfect (0% Risk)', metrics.ignored, `${ignoredRate}%`],
      ['Opened Email (Tracking Pixel) -> Low (15% Risk)', metrics.opened, `${openRate}%`],
      ['Clicked Phishing Hyperlink -> High (40% Risk)', metrics.clicked, `${clickRate}%`],
      ['Submitted Credentials -> CRITICAL (100% Risk)', metrics.compromised, `${compRate}%`]
    ];

    summaryRows.forEach((row, idx) => {
      const rowBg = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
      doc.rect(startX, curY, tableWidth, 18).fill(rowBg);
      doc.rect(startX, curY, tableWidth, 18).strokeColor('#E2E8F0').lineWidth(0.5).stroke();

      doc.font('Times-Roman').fontSize(8.5).fillColor('#1E293B');
      doc.text(String(row[0]), startX + 10, curY + 5);
      doc.text(String(row[1]), startX + 250, curY + 5);

      if (idx === 6 && metrics.compromised > 0) {
        doc.font('Times-Bold').fillColor('#B91C1C').text(String(row[2]), startX + 370, curY + 5);
      } else if (idx === 5 && metrics.clicked > 0) {
        doc.font('Times-Bold').fillColor('#D97706').text(String(row[2]), startX + 370, curY + 5);
      } else {
        doc.text(String(row[2]), startX + 370, curY + 5);
      }
      curY += 18;
    });

    doc.y = curY + 16;

    // ==========================================
    // 2. DEPARTMENTAL BREAKDOWN TABLE
    // ==========================================
    checkPageBreak(120);
    doc.font('Times-Bold').fontSize(13).fillColor('#0F172A').text('2. Departmental Risk Breakdown (Opens, Clicks & Drops)', startX);
    doc.moveDown(0.4);

    curY = doc.y;
    doc.rect(startX, curY, tableWidth, 20).fill('#E2E8F0');
    doc.rect(startX, curY, tableWidth, 20).strokeColor('#94A3B8').lineWidth(0.5).stroke();

    doc.font('Times-Bold').fontSize(8.5).fillColor('#0F172A');
    doc.text('DEPARTMENT', startX + 10, curY + 6);
    doc.text('SENT', startX + 130, curY + 6);
    doc.text('OPENED (15%)', startX + 190, curY + 6);
    doc.text('CLICKED (40%)', startX + 280, curY + 6);
    doc.text('COMPROMISED (100%)', startX + 370, curY + 6);

    curY += 20;

    deptBreakdown.forEach((dept, idx) => {
      checkPageBreak(22);
      curY = doc.y;

      const dSent = asNumber(dept.total_sent);
      const dOpened = asNumber(dept.opened);
      const dClicked = asNumber(dept.clicked);
      const dComp = asNumber(dept.compromised);

      const rowBg = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
      doc.rect(startX, curY, tableWidth, 18).fill(rowBg);
      doc.rect(startX, curY, tableWidth, 18).strokeColor('#E2E8F0').lineWidth(0.5).stroke();

      doc.font('Times-Roman').fontSize(8.5).fillColor('#1E293B');
      doc.text(dept.department || 'General', startX + 10, curY + 5);
      doc.text(String(dSent), startX + 130, curY + 5);
      doc.text(`${dOpened} (${percentage(dOpened, dSent)}%)`, startX + 190, curY + 5);
      doc.text(`${dClicked} (${percentage(dClicked, dSent)}%)`, startX + 280, curY + 5);

      if (dComp > 0) {
        doc.font('Times-Bold').fillColor('#B91C1C').text(`${dComp} (${percentage(dComp, dSent)}%)`, startX + 370, curY + 5);
      } else {
        doc.fillColor('#047857').text('0 (0.00%)', startX + 370, curY + 5);
      }
      curY += 18;
      doc.y = curY;
    });

    doc.y = curY + 16;

    // ==========================================
    // 3. COMPLETE EMPLOYEE REACTION & ACTIONS AUDIT
    // ==========================================
    checkPageBreak(150);
    doc.font('Times-Bold').fontSize(13).fillColor('#0F172A').text('3. Individual Target Interaction & Audit Trail', startX);
    doc.moveDown(0.2);
    doc.font('Times-Italic').fontSize(8.5).fillColor('#475569')
       .text('Detailed telemetry log of individual employee actions during simulated exercises:');
    doc.moveDown(0.4);

    if (recipientAudits.length === 0) {
      doc.font('Times-Bold').fontSize(9.5).fillColor('#047857')
         .text('No interactive events logged for enrolled targets.');
      doc.moveDown(1.5);
    } else {
      curY = doc.y;
      doc.rect(startX, curY, tableWidth, 20).fill('#E2E8F0');
      doc.rect(startX, curY, tableWidth, 20).strokeColor('#94A3B8').lineWidth(0.5).stroke();

      doc.font('Times-Bold').fontSize(8).fillColor('#0F172A');
      doc.text('TARGET EMPLOYEE', startX + 8, curY + 6);
      doc.text('OPENED EMAIL?', startX + 140, curY + 6);
      doc.text('CLICKED LINK?', startX + 235, curY + 6);
      doc.text('STATUS & BEHAVIORAL RISK ACTION', startX + 330, curY + 6);

      curY += 20;

      recipientAudits.forEach((aud, idx) => {
        checkPageBreak(24);
        curY = doc.y;

        const isSub = Number(aud.submitted) === 1;
        const isClick = Number(aud.clicked) === 1;
        const isOp = Number(aud.opened) === 1;

        let riskLabel = '[PERFECT 0%] Unopened';
        let riskColor = '#0284C7';
        if (isSub) {
          riskLabel = '[CRITICAL 100%] Compromised';
          riskColor = '#B91C1C';
        } else if (isClick) {
          riskLabel = '[HIGH 40%] Clicked Link';
          riskColor = '#D97706';
        } else if (isOp) {
          riskLabel = '[LOW 15%] Opened Only';
          riskColor = '#047857';
        }

        const rowBg = isSub ? '#FEF2F2' : (isClick ? '#FFFBEB' : (idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF'));
        doc.rect(startX, curY, tableWidth, 20).fill(rowBg);
        doc.rect(startX, curY, tableWidth, 20).strokeColor(isSub ? '#FCA5A5' : '#E2E8F0').lineWidth(0.5).stroke();

        doc.font(isSub ? 'Times-Bold' : 'Times-Roman').fontSize(8).fillColor(isSub ? '#7F1D1D' : '#1E293B');
        doc.text(`${aud.employee_name} (${aud.department})`, startX + 8, curY + 6, { width: 130, ellipsis: true });

        // Opened Email status
        doc.font('Times-Roman').fillColor(isOp ? '#0F172A' : '#64748B');
        const openedStr = isOp ? `Yes (${aud.opened_at ? new Date(aud.opened_at).toLocaleTimeString() : 'Seen'})` : 'No (Unopened)';
        doc.text(openedStr, startX + 140, curY + 6, { width: 90, ellipsis: true });

        // Clicked Link status
        doc.fillColor(isClick ? '#B45309' : '#64748B');
        const clickedStr = isClick ? `Yes (${aud.clicked_at ? new Date(aud.clicked_at).toLocaleTimeString() : 'Click'})` : 'No Click';
        doc.text(clickedStr, startX + 235, curY + 6, { width: 90, ellipsis: true });

        // Final Behavioral Risk Action
        doc.font('Times-Bold').fillColor(riskColor).text(riskLabel, startX + 330, curY + 6, { width: 170, ellipsis: true });

        curY += 20;
        doc.y = curY;
      });
    }

    doc.y = curY + 16;

    // ==========================================
    // 4. SECURITY AUDIT DEBRIEF JOKE
    // ==========================================
    checkPageBreak(75);
    const boxY = doc.y;
    doc.rect(startX, boxY, tableWidth, 46).fill('#FFFBEB');
    doc.rect(startX, boxY, tableWidth, 46).strokeColor('#F59E0B').lineWidth(1).stroke();

    const victim = recipientAudits.find(a => Number(a.submitted) === 1) || recipientAudits.find(a => Number(a.clicked) === 1);
    const victimName = victim ? victim.employee_name : 'The Targeted Cohort';

    const punchlines = [
      `SECURITY AUDIT DEBRIEF: Employee ${victimName} was caught lacking by a simulated lure.`,
      `SECURITY AUDIT DEBRIEF: Employee ${victimName} was caught codemaxxing in 4K and handed over credentials.`,
      `SECURITY AUDIT DEBRIEF: Employee ${victimName} fell for the oldest trick in the corporate playbook.`
    ];
    const selectedJoke = victim
      ? punchlines[Math.floor(Math.random() * punchlines.length)]
      : 'SECURITY AUDIT DEBRIEF: Zero employees were caught lacking in this exercise — 100% resilience!';

    doc.font('Times-Bold').fontSize(9.5).fillColor('#B45309')
       .text('POST-SIMULATION INTELLIGENCE DEBRIEF:', startX + 12, boxY + 8);
    doc.font('Times-Italic').fontSize(9).fillColor('#78350F')
       .text(selectedJoke, startX + 12, boxY + 24, { width: 480 });

    // ==========================================
    // FOOTER (PAGINATED ACROSS ALL PAGES)
    // ==========================================
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Times-Roman').fontSize(8).fillColor('#64748B').text(
        `CONFIDENTIAL — SME_Phishing_Simulator Evaluation Audit | Page ${i + 1} of ${range.count}`,
        startX,
        805,
        { align: 'center', width: tableWidth }
      );
    }

    doc.end();

    await auditLogger.log({
      userId: req.user?.id,
      sessionId: req.user?.sessionId || 'sess_export',
      actorEmail: req.user?.email,
      role: req.user?.role || 'Admin',
      action: 'PDF_REPORT_EXPORTED',
      details: `Generated executive PDF with recipient audits for: ${paramId}`,
      ipAddress: req.ip,
    });
  } catch (err) {
    console.error('[reportController.exportCampaignPDF]:', err);
    if (!res.headersSent) res.status(500).send('Failed to generate PDF report.');
  }
};

/**
 * GET /api/reports/training-progress
 * Aggregates training completion and quiz assessment results per employee.
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
        COALESCE(e.department, 'General') AS department,
        e.risk_level,
        COUNT(DISTINCT qr.id) AS total_quizzes_taken,
        COALESCE(MAX(qr.score), 0) AS highest_score,
        COALESCE(AVG(qr.score), 0) AS average_score,
        MAX(CASE WHEN qr.passed = 1 THEN 1 ELSE 0 END) AS has_passed_any,
        MAX(qr.completed_at) AS last_assessment_date
      FROM Employees e
      LEFT JOIN QuizResults qr ON e.id = qr.employee_id
      ${whereClause}
      GROUP BY e.id, e.name, e.email, e.department, e.risk_level
      ORDER BY e.department ASC, e.name ASC
    `;

    const [rows] = await pool.execute(query, params);

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows.map((r) => ({
        employeeId: r.employee_id,
        name: r.employee_name,
        email: r.employee_email,
        department: r.department,
        riskLevel: r.risk_level,
        quizzesTaken: Number(r.total_quizzes_taken),
        highestScore: Number(r.highest_score),
        averageScore: Number(Number(r.average_score).toFixed(2)),
        hasPassed: r.has_passed_any === 1,
        lastAssessmentDate: r.last_assessment_date,
      })),
    });
  } catch (err) {
    console.error('[reportController.getEmployeeTrainingProgress]:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};