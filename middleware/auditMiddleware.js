const logAction = require('../utils/auditLogger');

const auditMiddleware = (req, res, next) => {
  // Only capture state-altering actions, ignore read-only requests
  const trackedMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (!trackedMethods.includes(req.method)) {
    return next();
  }

  // Hook into response completion so we only log if the action succeeded
  res.on('finish', () => {
    // Only log successful modifications (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const userId = req.user ? req.user.id : null;
      const action = `${req.method} ${req.baseUrl}${req.path}`;
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;

      // Sanitize payload: strip out passwords before saving to audit details
      const sanitizedBody = { ...req.body };
      if (sanitizedBody.password) delete sanitizedBody.password;

      logAction(userId, action, sanitizedBody, ip);
    }
  });

  next();
};

module.exports = auditMiddleware;