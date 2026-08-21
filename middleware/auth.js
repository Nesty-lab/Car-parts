// middleware/auth.js
// Simple session-based guard for admin routes.

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.redirect('/admin/login');
}

module.exports = { requireAdmin };
