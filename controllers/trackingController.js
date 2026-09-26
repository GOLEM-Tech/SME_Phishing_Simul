'use strict';

const pool = require('../config/db');
const { recalculateEmployeeRisk } = require('../utils/riskEngine');

const getRecipientAndLandingSlug = async (token) => {
  const [rows] = await pool.execute(
    `SELECT cr.id AS recipient_id, cr.employee_id, cr.campaign_id, lp.slug AS landing_slug
     FROM CampaignRecipients cr
     INNER JOIN Campaigns c ON c.id = cr.campaign_id
     LEFT JOIN LandingPages lp ON lp.id = c.landing_page_id
     WHERE cr.tracking_token = ?
     LIMIT 1`,
    [token]
  );

  if (rows.length === 0) return null;
  return rows[0];
};

// GET /api/track/open/:token
// Triggered when the 1x1 pixel loads -> Sets risk to "Low (15% Risk)"
exports.trackOpen = async (req, res) => {
  const { token } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const userAgent = req.get('User-Agent') || 'Unknown';

  try {
    const data = await getRecipientAndLandingSlug(token);
    if (data?.recipient_id) {
      await pool.execute(
        'INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [data.recipient_id, 'Opened', ip, userAgent]
      );
      await recalculateEmployeeRisk(data.employee_id);
    }
  } catch (err) {
    console.error('[TrackOpen] Error recording open event:', err.message);
  } finally {
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
      'base64'
    );
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(pixel);
  }
};

// GET /api/track/click/:token
// Triggered when employee clicks link -> Escalates risk to "High (40% Risk)"
exports.trackClick = async (req, res) => {
  const { token } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const userAgent = req.get('User-Agent') || 'Unknown';

  let destination = `/landing-page?token=${encodeURIComponent(token)}`;

  try {
    const data = await getRecipientAndLandingSlug(token);
    if (data?.recipient_id) {
      // If they clicked the link, they also opened the email (ensures Opened is recorded even if Gmail blocked localhost images)
      const [existingOpen] = await pool.execute(
        "SELECT id FROM EmailEvents WHERE recipient_id = ? AND event_type = 'Opened' LIMIT 1",
        [data.recipient_id]
      );
      if (existingOpen.length === 0) {
        await pool.execute(
          'INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
          [data.recipient_id, 'Opened', ip, userAgent]
        );
      }

      await pool.execute(
        'INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [data.recipient_id, 'Clicked', ip, userAgent]
      );

      await recalculateEmployeeRisk(data.employee_id);

      if (data.landing_slug) {
        destination = `/login/${data.landing_slug}?token=${encodeURIComponent(token)}`;
      }
    }
  } catch (err) {
    console.error('[TrackClick] Error recording click event:', err.message);
  }

  return res.redirect(destination);
};