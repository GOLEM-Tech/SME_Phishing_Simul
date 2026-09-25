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