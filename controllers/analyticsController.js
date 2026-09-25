const pool = require('../config/db');

/**
 * GET /api/analytics/heatmap
 * Groups interaction events by Day of Week (Sunday=1..Saturday=7) and Hour of Day (0-23).
 * Ideal for frontend heatmaps (Chart.js / Matrix charts).
 */
exports.getEmailHeatmap = async (req, res) => {
  try {
    const query = `
      SELECT
        DAYNAME(created_at) AS day_of_week,
        DAYOFWEEK(created_at) AS day_number,
        HOUR(created_at) AS hour_of_day,
        event_type,
        COUNT(id) AS total_events
      FROM EmailEvents
      GROUP BY
        DAYNAME(created_at),
        DAYOFWEEK(created_at),
        HOUR(created_at),
        event_type
      ORDER BY
        day_number ASC,
        hour_of_day ASC;
    `;

    const [rows] = await pool.execute(query);

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows.map((r) => ({
        dayOfWeek: r.day_of_week,
        dayNumber: Number(r.day_number),
        hourOfDay: Number(r.hour_of_day),
        eventType: r.event_type,
        totalEvents: Number(r.total_events)
      }))
    });
  } catch (error) {
    console.error('Error fetching email heatmap data:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while aggregating heatmap data.'
    });
  }
};

/**
 * GET /api/analytics/departments
 * Evaluates department vulnerability across all historical simulation events.
 */
exports.getDepartmentComparative = async (req, res) => {
  try {
    const query = `
      SELECT
        COALESCE(e.department, 'General') AS department,
        COUNT(DISTINCT e.id) AS total_employees,
        COUNT(DISTINCT cr.id) AS total_targeted,
        COUNT(DISTINCT CASE WHEN ee.event_type = 'Opened' THEN cr.id END) AS total_opened,
        COUNT(DISTINCT CASE WHEN ee.event_type = 'Clicked' THEN cr.id END) AS total_clicked,
        COUNT(DISTINCT CASE WHEN ee.event_type = 'Submitted' THEN cr.id END) AS total_compromised
      FROM Employees e
      LEFT JOIN CampaignRecipients cr ON e.id = cr.employee_id
      LEFT JOIN EmailEvents ee ON cr.id = ee.recipient_id
      GROUP BY COALESCE(e.department, 'General')
      ORDER BY total_compromised DESC, total_clicked DESC;
    `;

    const [rows] = await pool.execute(query);

    const data = rows.map((r) => {
      const targeted = Number(r.total_targeted);
      const clicked = Number(r.total_clicked);
      const compromised = Number(r.total_compromised);

      return {
        department: r.department,
        totalEmployees: Number(r.total_employees),
        totalTargeted: targeted,
        totalOpened: Number(r.total_opened),
        totalClicked: clicked,
        totalCompromised: compromised,
        clickRate: targeted > 0 ? Number(((clicked / targeted) * 100).toFixed(2)) : 0,
        compromiseRate: targeted > 0 ? Number(((compromised / targeted) * 100).toFixed(2)) : 0
      };
    });

    return res.status(200).json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    console.error('Error fetching department comparative analytics:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while computing departmental analytics.'
    });
  }
};

/**
 * Internal helper to aggregate standalone campaign performance for comparison.
 */
const getCampaignMetrics = async (campaignId) => {
  const [campaignRows] = await pool.execute(
    'SELECT id, name, status, scheduled_at, created_at FROM Campaigns WHERE id = ?',
    [campaignId]
  );

  if (campaignRows.length === 0) {
    return null;
  }

  const query = `
    SELECT
      COUNT(cr.id) AS total_recipients,
      COALESCE(SUM(cr.sent_at IS NOT NULL), 0) AS total_sent,
      COUNT(DISTINCT CASE WHEN ee.event_type = 'Delivered' THEN cr.id END) AS delivered,
      COUNT(DISTINCT CASE WHEN ee.event_type = 'Opened' THEN cr.id END) AS opened,
      COUNT(DISTINCT CASE WHEN ee.event_type = 'Clicked' THEN cr.id END) AS clicked,
      COUNT(DISTINCT CASE WHEN ee.event_type = 'Submitted' THEN cr.id END) AS compromised
    FROM CampaignRecipients cr
    LEFT JOIN EmailEvents ee ON cr.id = ee.recipient_id
    WHERE cr.campaign_id = ?;
  `;

  const [metricsRows] = await pool.execute(query, [campaignId]);
  const row = metricsRows[0] || {};
  const totalSent = Number(row.total_sent || 0);
  const delivered = Number(row.delivered || 0);
  const opened = Number(row.opened || 0);
  const clicked = Number(row.clicked || 0);
  const compromised = Number(row.compromised || 0);

  const calcRate = (num, den) => (den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0);

  return {
    campaign: campaignRows[0],
    totals: {
      recipients: Number(row.total_recipients || 0),
      sent: totalSent,
      delivered,
      opened,
      clicked,
      compromised
    },
    rates: {
      deliveryRate: calcRate(delivered, totalSent),
      openRate: calcRate(opened, totalSent),
      clickRate: calcRate(clicked, totalSent),
      compromiseRate: calcRate(compromised, totalSent)
    }
  };
};

/**
 * GET /api/analytics/campaign-comparison?campaign1=X&campaign2=Y
 * Side-by-side metric comparison and variance calculation between two campaigns.
 */
exports.compareCampaigns = async (req, res) => {
  const c1 = Number.parseInt(req.query.campaign1, 10);
  const c2 = Number.parseInt(req.query.campaign2, 10);

  if (!Number.isSafeInteger(c1) || !Number.isSafeInteger(c2) || c1 < 1 || c2 < 1) {
    return res.status(400).json({
      success: false,
      message: 'Query parameters campaign1 and campaign2 must be positive integers.'
    });
  }

  if (c1 === c2) {
    return res.status(400).json({
      success: false,
      message: 'Please provide two different campaign IDs for comparison.'
    });
  }

  try {
    const [campaign1Data, campaign2Data] = await Promise.all([
      getCampaignMetrics(c1),
      getCampaignMetrics(c2)
    ]);

    if (!campaign1Data || !campaign2Data) {
      return res.status(404).json({
        success: false,
        message: 'One or both specified campaigns were not found.'
      });
    }

    return res.status(200).json({
      success: true,
      comparison: {
        campaign1: campaign1Data,
        campaign2: campaign2Data,
        deltas: {
          openRateDelta: Number((campaign2Data.rates.openRate - campaign1Data.rates.openRate).toFixed(2)),
          clickRateDelta: Number((campaign2Data.rates.clickRate - campaign1Data.rates.clickRate).toFixed(2)),
          compromiseRateDelta: Number((campaign2Data.rates.compromiseRate - campaign1Data.rates.compromiseRate).toFixed(2))
        }
      }
    });
  } catch (error) {
    console.error('Error comparing campaigns:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while comparing campaigns.'
    });
  }
};