const db = require('../../models');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

const { body, validationResult } = require('express-validator');

const allowedFields = ['username', 'email', 'role', 'subscription_tier', 'balance'];

const validateUpdateData = [
  body('username').optional().isString().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(['user', 'admin', 'superadmin']),
  body('subscription_tier').optional().isInt({ min: 0 }),
  body('balance').optional().isFloat({ min: 0 }),
];

async function adminUpdateUser(req, res) {
  try {
    const adminUser = req.user;
    // Проверка прав администратора — только admin или superadmin имеют доступ
    if (!adminUser || (adminUser.role !== 'admin' && adminUser.role !== 'superadmin')) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Ошибка валидации', errors: errors.array() });
    }

    const userId = req.params.id;
    const updateData = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (updateData.password) {
      delete updateData.password;
    }

    const [updatedRowsCount, [updatedUser]] = await db.User.update(updateData, {
      where: { id: userId },
      returning: true,
      individualHooks: true
    });

    if (updatedRowsCount === 0) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    return res.json({ message: 'Пользователь успешно обновлён', user: updatedUser });
  } catch (error) {
    logger.error('Ошибка обновления пользователя админом:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  adminUpdateUser,
  validateUpdateData
};

module.exports = {
  adminUpdateUser,
  validateUpdateData
};
