const pool = require('../config/db');

// Helper to resolve token to recipient_id
const getRecipientId = async (token) => {
  const [rows] = await pool.execute(
    'SELECT id FROM CampaignRecipients WHERE tracking_token = ?',
    [token]
  );
  return rows.length > 0 ? rows[0].id : null;
};

// GET /api/track/open/:token
exports.trackOpen = async (req, res) => {
  const { token } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
  const userAgent = req.get('User-Agent') || 'Unknown';

  try {
    const recipientId = await getRecipientId(token);
    if (recipientId) {
      await pool.execute(
        'INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [recipientId, 'Opened', ip, userAgent]
      );
    }
  } catch (err) {
    console.error('Track open failed:', err.message);
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
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
  const userAgent = req.get('User-Agent') || 'Unknown';

  try {
    const recipientId = await getRecipientId(token);
    if (recipientId) {
      await pool.execute(
        'INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [recipientId, 'Clicked', ip, userAgent]
      );
    }
  } catch (err) {
    console.error('Track click failed:', err.message);
  } finally {
    // Redirect target to fake portal handling route
    res.redirect(`/landing-page?token=${token}`);
  }
};