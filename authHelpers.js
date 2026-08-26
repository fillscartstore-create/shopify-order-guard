const config = require('./config');

// Shared check used by both the dashboard (Basic Auth) and the
// bulk-confirm API (X-Admin-Key header) - both accept the same secret.
function isAuthorized(req) {
  const headerKey = req.header('X-Admin-Key');
  if (headerKey && headerKey === config.app.adminApiKey) return true;

  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const [, password] = decoded.split(':');
    if (password && password === config.app.adminApiKey) return true;
  }
  return false;
}

function requireAuth(req, res, next) {
  if (isAuthorized(req)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Order Guard Dashboard"');
  return res.status(401).send('Authentication required.');
}

module.exports = { isAuthorized, requireAuth };
