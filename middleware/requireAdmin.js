'use strict';

/**
 * После authMiddleware: только admin или superadmin.
 */
function requireAdmin(req, res, next) {
  const role = req.user && req.user.role;
  if (role !== 'admin' && role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Нужны права администратора' });
  }
  next();
}

module.exports = requireAdmin;
