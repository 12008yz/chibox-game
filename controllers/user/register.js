const { validationResult, body } = require('express-validator');
const argon2 = require('argon2');
const db = require('../../models');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const { createRegistrationNotification } = require('../../utils/notificationHelper');

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
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) {
  throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function generateRefreshToken(user) {
  return jwt.sign({ id: user.id, email: user.email, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 }).withMessage('Логин должен быть от 3 до 30 символов.'),
  body('password')
    .isLength({ min: 6 }).withMessage('Пароль должен быть не менее 6 символов.')
    // Убраны строгие требования к паролю
    // .matches(/[A-Z]/).withMessage('Пароль должен содержать хотя бы одну заглавную букву')
    // .matches(/[a-z]/).withMessage('Пароль должен содержать хотя бы одну строчную букву')
    // .matches(/[0-9]/).withMessage('Пароль должен содержать хотя бы одну цифру')
    // .matches(/[^A-Za-z0-9]/).withMessage('Пароль должен содержать спецсимвол')
];

async function register(req, res) {
  // Логируем входящий запрос для отладки
  logger.info('[REGISTER] Register request received:', {
    headers: req.headers,
    body: { ...req.body, password: '***' }, // Скрываем пароль в логах
    contentType: req.get('Content-Type')
  });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error('[REGISTER] Validation errors:', errors.array());
    return res.status(400).json({
      message: 'Ошибка валидации',
      errors: errors.array(),
    });
  }
  try {
    let { password, username, promoCode } = req.body;
    logger.info('[REGISTER] Processing registration for:', { username });

    // Валидация типов для защиты от Type Confusion
    if (typeof password !== 'string' || typeof username !== 'string') {
      return res.status(400).json({ message: 'Логин и пароль должны быть строками' });
    }

    if (promoCode && typeof promoCode !== 'string') {
      return res.status(400).json({ message: 'Промокод должен быть строкой' });
    }

    // Дополнительная валидация длины
    if (password.length > 128 || username.length > 50) {
      return res.status(400).json({ message: 'Превышена максимальная длина полей' });
    }

    username = username.trim();

    const existingUsername = await db.User.findOne({ where: { username } });
    if (existingUsername) {
      logger.warn('[REGISTER] Username already exists:', username);
      return res.status(409).json({ message: 'Имя пользователя уже занято' });
    }

    logger.info('[REGISTER] Hashing password...');
    const hashedPassword = await argon2.hash(password);
    // Генерируем технический email в ASCII-формате, чтобы пройти Sequelize isEmail
    // даже если username содержит кириллицу/спецсимволы.
    const safeSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const generatedEmail = `user_${safeSuffix}@local.chibox`;

    logger.info('[REGISTER] Creating new user in database...');
    const newUser = await db.User.create({
      email: generatedEmail,
      username,
      password: hashedPassword,
      is_email_verified: true,
      verification_code: null,
      email_verification_expires: null
    });
    logger.info('[REGISTER] User created successfully with ID:', newUser.id);

    // Создаем уведомление о успешной регистрации
    try {
      await createRegistrationNotification(newUser.id, newUser.username);
    } catch (notificationError) {
      logger.warn('Не удалось создать уведомление о регистрации:', notificationError.message);
    }

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

    const accessToken = generateToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/'
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    const response = {
      success: true,
      message: 'Пользователь зарегистрирован и авторизован.',
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
        steam_avatar: newUser.steam_avatar_url,
        steam_profile_url: newUser.steam_profile_url,
        steam_trade_url: newUser.steam_trade_url,
        is_email_verified: newUser.is_email_verified,
        role: newUser.role,
        daily_streak: newUser.daily_streak ?? 0,
        max_daily_streak: newUser.max_daily_streak ?? 0,
      },
      achievements: [],
      inventory: []
    };

    logger.info('[REGISTER] Sending success response:', response);
    return res.status(201).json(response);
  } catch (error) {
    logger.error('Ошибка при регистрации:', {
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
  registerValidation,
  register
};
