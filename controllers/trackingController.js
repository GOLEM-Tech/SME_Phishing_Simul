'use strict';

const pool = require('../config/db');

// Helper to resolve tracking token, recipient ID, and assigned landing page slug
const getRecipientAndLandingSlug = async (token) => {
  const [rows] = await pool.execute(
    `SELECT cr.id AS recipient_id, cr.campaign_id, lp.slug AS landing_slug
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
    }
  } catch (err) {
    console.error('[TrackOpen] Error recording open event:', err.message);
  } finally {
    // 1x1 transparent GIF Buffer (43 bytes)
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
exports.trackClick = async (req, res) => {
  const { token } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const userAgent = req.get('User-Agent') || 'Unknown';

  let destination = `/landing-page?token=${encodeURIComponent(token)}`;

  try {
    const data = await getRecipientAndLandingSlug(token);
    if (data?.recipient_id) {
      await pool.execute(
        'INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [data.recipient_id, 'Clicked', ip, userAgent]
      );

      if (data.landing_slug) {
        destination = `/login/${data.landing_slug}?token=${encodeURIComponent(token)}`;
      }
    }
  } catch (err) {
    console.error('[TrackClick] Error recording click event:', err.message);
  }

  return res.redirect(destination);
};