const { validationResult, body } = require('express-validator');
const db = require('../../models');
const jwt = require('jsonwebtoken');
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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

const verifyEmailValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Некорректный email.')
    .normalizeEmail(),
  body('verificationCode')
    .trim()
    .isLength({ min: 6, max: 6 }).withMessage('Код подтверждения должен состоять из 6 цифр.')
    .isNumeric().withMessage('Код подтверждения должен содержать только цифры.')
];

async function verifyEmail(req, res) {
  logger.info('Email verification request received:', {
    body: req.body,
    headers: req.headers
  });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error('Validation errors:', errors.array());
    return res.status(400).json({
      message: 'Ошибка валидации',
      errors: errors.array(),
    });
  }

  try {
    let { email, verificationCode } = req.body;

    // Валидация типов
    if (typeof email !== 'string' || typeof verificationCode !== 'string') {
      return res.status(400).json({ message: 'Email и код подтверждения должны быть строками' });
    }

    email = email.trim().toLowerCase();
    verificationCode = verificationCode.trim();

    // Находим пользователя
    const user = await db.User.findOne({
      where: {
        email: email,
        verification_code: verificationCode
      }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Неверный email или код подтверждения'
      });
    }

    // Проверяем, что email еще не подтвержден
    if (user.is_email_verified) {
      return res.status(400).json({
        message: 'Email уже подтвержден'
      });
    }

    // Проверяем, не истек ли срок действия кода
    if (user.email_verification_expires && user.email_verification_expires < new Date()) {
      return res.status(400).json({
        message: 'Срок действия кода подтверждения истек. Запросите новый код.'
      });
    }

    // Подтверждаем email
    await user.update({
      is_email_verified: true,
      verification_code: null,
      email_verification_expires: null
    });

    // Получаем полную информацию о пользователе
    const achievements = await db.UserAchievement.findAll({
      where: { user_id: user.id },
      include: [{ model: db.Achievement, as: 'achievement' }]
    });

    const inventory = await db.UserInventory.findAll({
      where: { user_id: user.id },
      include: [{ model: db.Item, as: 'item' }]
    });

    // Генерируем JWT токен
    const token = generateToken(user);

    logger.info('Email verified successfully', {
      userId: user.id,
      email: user.email
    });

    return res.status(200).json({
      success: true,
      message: 'Email успешно подтвержден. Добро пожаловать в ChiBox Game!',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        level: user.level,
        xp: user.xp,
        xp_to_next_level: user.xp_to_next_level,
        level_bonus_percentage: user.level_bonus_percentage,
        total_xp_earned: user.total_xp_earned,
        subscription_tier: user.subscription_tier,
        subscription_purchase_date: user.subscription_purchase_date,
        subscription_expiry_date: user.subscription_expiry_date,
        subscription_days_left: user.subscription_days_left,
        cases_available: user.cases_available,
        cases_opened_today: user.cases_opened_today,
        next_case_available_time: user.next_case_available_time,
        max_daily_cases: user.max_daily_cases,
        next_bonus_available_time: user.next_bonus_available_time,
        last_bonus_date: user.last_bonus_date,
        lifetime_bonuses_claimed: user.lifetime_bonuses_claimed,
        successful_bonus_claims: user.successful_bonus_claims,
        drop_rate_modifier: user.drop_rate_modifier,
        achievements_bonus_percentage: user.achievements_bonus_percentage,
        subscription_bonus_percentage: user.subscription_bonus_percentage,
        total_drop_bonus_percentage: user.total_drop_bonus_percentage,
        balance: user.balance,
        steam_id: user.steam_id,
        steam_username: user.steam_username,
        steam_avatar: user.steam_avatar_url,
        steam_profile_url: user.steam_profile_url,
        steam_trade_url: user.steam_trade_url,
        is_email_verified: user.is_email_verified,
        role: user.role,
      },
      achievements,
      inventory
    });

  } catch (error) {
    logger.error('Ошибка при подтверждении email:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      sql: error.sql || null,
      original: error.original || null
    });

    return res.status(500).json({
      message: 'Внутренняя ошибка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  verifyEmailValidation,
  verifyEmail
};
