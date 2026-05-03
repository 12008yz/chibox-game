'use strict';

const db = require('../../models');
const { logger } = require('../../utils/logger');

const ADMIN_SECRET_EXCLUDE = new Set([
  'password',
  'tfa_secret',
  'tfa_backup_codes',
  'email_verification_token',
  'verification_code',
  'password_reset_token',
  'password_reset_expires',
  'email_verification_expires',
]);

function buildWritableFieldNames() {
  const attrs = db.User.rawAttributes;
  const skip = new Set([
    ...ADMIN_SECRET_EXCLUDE,
    'id',
    'createdAt',
    'updatedAt',
    'steam_avatar', // VIRTUAL — пишем steam_avatar_url
  ]);
  return Object.keys(attrs).filter((k) => {
    if (skip.has(k)) return false;
    const t = attrs[k].type;
    if (t && typeof t === 'object' && t.key === 'VIRTUAL') return false;
    return true;
  });
}

let cachedWritable = null;
function getWritableFieldNames() {
  if (!cachedWritable) cachedWritable = buildWritableFieldNames();
  return cachedWritable;
}

async function getAdminUser(req, res) {
  try {
    const userId = req.params.id;
    const user = await db.User.findByPk(userId, {
      attributes: { exclude: [...ADMIN_SECRET_EXCLUDE, 'password'] },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }
    return res.json({ success: true, data: user.toJSON() });
  } catch (err) {
    logger.error('getAdminUser:', err);
    return res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
}

async function updateAdminUser(req, res) {
  try {
    const userId = req.params.id;
    const adminRole = req.user.role;
    const writable = new Set(getWritableFieldNames());

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    const updates = {};
    for (const key of Object.keys(req.body)) {
      if (!writable.has(key)) continue;
      if (key === 'role') {
        if (adminRole !== 'superadmin') {
          return res.status(403).json({
            success: false,
            message: 'Только супер-администратор может менять роль',
          });
        }
        const allowedRoles = ['user', 'moderator', 'admin', 'superadmin'];
        if (!allowedRoles.includes(req.body.role)) {
          return res.status(400).json({ success: false, message: 'Недопустимое значение role' });
        }
      }
      if (key === 'is_bot' && req.body.is_bot === true && adminRole !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Только супер-администратор может включать is_bot',
        });
      }
      updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Нет допустимых полей для обновления' });
    }

    await user.update(updates, { fields: Object.keys(updates), individualHooks: true });

    const fresh = await db.User.findByPk(userId, {
      attributes: { exclude: [...ADMIN_SECRET_EXCLUDE, 'password'] },
    });

    return res.json({
      success: true,
      message: 'Пользователь обновлён',
      data: fresh.toJSON(),
    });
  } catch (err) {
    logger.error('updateAdminUser:', err);
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: err.errors?.map((e) => ({ field: e.path, message: e.message })) || [],
      });
    }
    return res.status(500).json({ success: false, message: err.message || 'Ошибка сервера' });
  }
}

module.exports = {
  getAdminUser,
  updateAdminUser,
};
