const { validationResult, body } = require('express-validator');
const argon2 = require('argon2');
const db = require('../../models');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const emailService = require('../../services/emailService');
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
    .matches(/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/;'`~]/).withMessage('Пароль должен содержать хотя бы один спецсимвол (!@#$%^&* и т.д.)')
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
    let { email, password, username, promoCode } = req.body;
    logger.info('[REGISTER] Processing registration for:', { email, username });

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
      logger.warn('[REGISTER] Email already exists:', email);
      return res.status(409).json({ message: 'Почта уже используется' });
    }

    const existingUsername = await db.User.findOne({ where: { username } });
    if (existingUsername) {
      logger.warn('[REGISTER] Username already exists:', username);
      return res.status(409).json({ message: 'Имя пользователя уже занято' });
    }

    logger.info('[REGISTER] Hashing password...');
    const hashedPassword = await argon2.hash(password);

    // Генерируем код подтверждения
    logger.info('[REGISTER] Generating verification code...');
    const verificationCode = emailService.generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

    logger.info('[REGISTER] Creating new user in database...');
    const newUser = await db.User.create({
      email,
      username,
      password: hashedPassword,
      is_email_verified: false,
      verification_code: verificationCode,
      email_verification_expires: verificationExpires
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

    // Код подтверждения сохранен в базе данных
    // Email будет отправлен только когда пользователь запросит его через "Отправить код повторно"
    logger.info('[REGISTER] Verification code generated and saved to database');
    logger.info('[REGISTER] User must request verification code manually');

    const response = {
      success: true,
      message: 'Пользователь зарегистрирован. Нажмите "Отправить код" для получения кода подтверждения на email.',
      userId: newUser.id,
      email: email,
      codeExpires: verificationExpires
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
