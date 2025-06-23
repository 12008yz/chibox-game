const { validationResult, body } = require('express-validator');
const db = require('../../models');
const winston = require('winston');
const emailService = require('../../services/emailService');

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

const resendValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Некорректный email.')
    .normalizeEmail()
];

async function resendVerificationCode(req, res) {
  logger.info('Resend verification code request received:', {
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
    let { email } = req.body;

    // Валидация типов
    if (typeof email !== 'string') {
      return res.status(400).json({ message: 'Email должен быть строкой' });
    }

    email = email.trim().toLowerCase();

    // Находим пользователя
    const user = await db.User.findOne({
      where: { email: email }
    });

    if (!user) {
      return res.status(404).json({
        message: 'Пользователь с таким email не найден'
      });
    }

    // Проверяем, что email еще не подтвержден
    if (user.is_email_verified) {
      return res.status(400).json({
        message: 'Email уже подтвержден'
      });
    }

    // Проверяем, не слишком ли часто запрашивается код
    // Ограничение: не чаще чем раз в 1 минуту
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    if (user.email_verification_expires && user.email_verification_expires > oneMinuteAgo) {
      const remainingTime = Math.ceil((user.email_verification_expires.getTime() - oneMinuteAgo.getTime()) / 1000);
      return res.status(429).json({
        message: `Код был отправлен недавно. Повторить запрос можно через ${remainingTime} секунд.`
      });
    }

    // Генерируем новый код подтверждения
    const verificationCode = emailService.generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

    // Обновляем код в базе данных
    await user.update({
      verification_code: verificationCode,
      email_verification_expires: verificationExpires
    });

    // Отправляем новый код на email
    try {
      const emailResult = await emailService.sendVerificationCode(email, user.username, verificationCode);

      logger.info('Verification code resent', {
        userId: user.id,
        email: email,
        messageId: emailResult.messageId
      });

      const response = {
        success: true,
        message: 'Новый код подтверждения отправлен на ваш email',
        codeExpires: verificationExpires
      };

      // Добавляем preview URL только в режиме разработки и если это ethereal email
      if (process.env.NODE_ENV === 'development' && emailResult.previewUrl) {
        response.previewUrl = emailResult.previewUrl;
      }

      return res.status(200).json(response);

    } catch (emailError) {
      logger.error('Failed to resend verification email:', {
        userId: user.id,
        email: email,
        error: emailError.message
      });

      return res.status(500).json({
        message: 'Не удалось отправить код подтверждения на email',
        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }

  } catch (error) {
    logger.error('Ошибка при повторной отправке кода:', {
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
  resendValidation,
  resendVerificationCode
};
