'use strict';

const db = require('../models');
const { isUserBanned } = require('../utils/userBan');

/**
 * После authMiddleware: одна лёгкая выборка по бану (экономика/действия, не только профиль).
 */
async function banGuard(req, res, next) {
  if (!req.user || !req.user.id) {
    return next();
  }
  try {
    const row = await db.User.findByPk(req.user.id, {
      attributes: ['is_banned', 'ban_expires', 'ban_reason'],
    });
    if (!row) {
      return res.status(401).json({ success: false, message: 'Пользователь не найден' });
    }
    if (isUserBanned(row)) {
      return res.status(403).json({
        success: false,
        message: 'Аккаунт заблокирован.',
        code: 'BANNED',
        reason: row.ban_reason || null,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = banGuard;
