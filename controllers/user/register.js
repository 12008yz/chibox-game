const { validationResult, body } = require('express-validator');
const argon2 = require('argon2');
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

const registerValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Некорректный email.')
    .normalizeEmail(),
  body('username')
    .trim().notEmpty().withMessage('Имя пользователя обязательно.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Пароль должен быть не менее 8 символов.')
    .matches(/[A-Z]/).withMessage('Пароль должен содержать хотя бы одну заглавную букву')
    .matches(/[a-z]/).withMessage('Пароль должен содержать хотя бы одну строчную букву')
    .matches(/[0-9]/).withMessage('Пароль должен содержать хотя бы одну цифру')
    .matches(/[^A-Za-z0-9]/).withMessage('Пароль должен содержать спецсимвол')
];

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Ошибка валидации',
      errors: errors.array(),
    });
  }
  try {
    let { email, password, username, promoCode } = req.body;

    // Валидация типов для защиты от Type Confusion
    if (typeof email !== 'string' || typeof password !== 'string' || typeof username !== 'string') {
      return res.status(400).json({ message: 'Email, пароль и имя пользователя должны быть строками' });
    }

    if (promoCode && typeof promoCode !== 'string') {
      return res.status(400).json({ message: 'Промокод должен быть строкой' });
    }

    // Дополнительная валидация длины
    if (email.length > 254 || password.length > 128 || username.length > 50) {
      return res.status(400).json({ message: 'Превышена максимальная длина полей' });
    }

    email = email.trim().toLowerCase();
    username = username.trim();

    const existingUser = await db.User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'Почта уже используется' });
    }

    const existingUsername = await db.User.findOne({ where: { username } });
    if (existingUsername) {
      return res.status(409).json({ message: 'Имя пользователя уже занято' });
    }

    const hashedPassword = await argon2.hash(password);

    const newUser = await db.User.create({
      email,
      username,
      password: hashedPassword
    });

    // Если передан промокод, проверяем и сохраняем
    if (promoCode && typeof promoCode === 'string') {
      const trimmedPromoCode = promoCode.trim();
      if (trimmedPromoCode.length > 0) {
        const promo = await db.PromoCode.findOne({
          where: { code: trimmedPromoCode, is_active: true }
        });
        if (promo) {
          await db.PromoCodeUser.create({
            promo_code_id: promo.id,
            user_id: newUser.id,
            is_used: false
          });
        }
      }
    }

    const achievements = await db.UserAchievement.findAll({
      where: { user_id: newUser.id },
      include: [{ model: db.Achievement, as: 'achievement' }]
    });

    const inventory = await db.UserInventory.findAll({
      where: { user_id: newUser.id },
      include: [{ model: db.Item, as: 'item' }]
    });

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Пользователь успешно зарегистрирован',
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        level: newUser.level,
        xp: newUser.xp,
        xp_to_next_level: newUser.xp_to_next_level,
        level_bonus_percentage: newUser.level_bonus_percentage,
        total_xp_earned: newUser.total_xp_earned,
        subscription_tier: newUser.subscription_tier,
        subscription_purchase_date: newUser.subscription_purchase_date,
        subscription_expiry_date: newUser.subscription_expiry_date,
        subscription_days_left: newUser.subscription_days_left,
        cases_available: newUser.cases_available,
        cases_opened_today: newUser.cases_opened_today,
        next_case_available_time: newUser.next_case_available_time,
        max_daily_cases: newUser.max_daily_cases,
        next_bonus_available_time: newUser.next_bonus_available_time,
        last_bonus_date: newUser.last_bonus_date,
        lifetime_bonuses_claimed: newUser.lifetime_bonuses_claimed,
        successful_bonus_claims: newUser.successful_bonus_claims,
        drop_rate_modifier: newUser.drop_rate_modifier,
        achievements_bonus_percentage: newUser.achievements_bonus_percentage,
        subscription_bonus_percentage: newUser.subscription_bonus_percentage,
        total_drop_bonus_percentage: newUser.total_drop_bonus_percentage,
        balance: newUser.balance,
        steam_id: newUser.steam_id,
        steam_username: newUser.steam_username,
        steam_avatar: newUser.steam_avatar,
        steam_profile_url: newUser.steam_profile_url,
        steam_trade_url: newUser.steam_trade_url,
        is_email_verified: newUser.is_email_verified,
        role: newUser.role,
      },
      achievements,
      inventory
    });
  } catch (error) {
    logger.error('Ошибка при регистрации:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  registerValidation,
  register
};
