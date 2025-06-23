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

// Настройка email транспорта
let transporter = null;

// Инициализация транспорта
async function initializeTransporter() {
  try {
    const nodemailer = require('nodemailer');

    // Проверяем настройки SMTP
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      logger.info('Email транспорт настроен через SMTP');
    } else {
      // Fallback на Ethereal Email для тестирования
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      logger.info('Используется тестовый Ethereal Email транспорт');
      logger.info(`Тестовые письма можно посмотреть на: https://ethereal.email`);
    }
  } catch (error) {
    logger.warn('Ошибка настройки email транспорта:', error.message);
  }
}

// Инициализируем транспорт
initializeTransporter();

/**
 * Генерирует 6-значный код подтверждения
 */
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Отправляет email с кодом подтверждения
 */
async function sendVerificationEmail(email, code, username) {
  try {
    if (!transporter) {
      logger.info(`[DEV MODE] Код подтверждения для ${email}: ${code}`);
      return { success: true, message: 'Код выведен в консоль (dev mode)' };
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || 'ChiBox <noreply@chibox.com>',
      to: email,
      subject: 'Подтверждение регистрации - ChiBox',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Добро пожаловать в ChiBox!</h2>
          <p>Здравствуйте, <strong>${username}</strong>!</p>
          <p>Для завершения регистрации введите код подтверждения:</p>
          <div style="background: #f0f0f0; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 20px 0;">
            ${code}
          </div>
          <p>Код действителен в течение 15 минут.</p>
          <p>Если вы не регистрировались на нашем сайте, просто проигнорируйте это письмо.</p>
          <br>
          <p>С уважением,<br>Команда ChiBox</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Код подтверждения отправлен на ${email}`);

    // Если используется Ethereal Email, покажем ссылку на просмотр
    if (info.messageId && transporter.options.host === 'smtp.ethereal.email') {
      const nodemailer = require('nodemailer');
      const previewUrl = nodemailer.getTestMessageUrl(info);
      logger.info(`📧 Просмотр email: ${previewUrl}`);
      return { success: true, message: 'Email отправлен', previewUrl };
    }

    return { success: true, message: 'Email отправлен' };
  } catch (error) {
    logger.error('Ошибка отправки email:', error);
    return { success: false, message: 'Ошибка отправки email' };
  }
}

/**
 * Отправляет email с уведомлением о смене пароля
 */
async function sendPasswordResetEmail(email, resetToken, username) {
  try {
    if (!transporter) {
      logger.info(`[DEV MODE] Токен сброса пароля для ${email}: ${resetToken}`);
      return { success: true, message: 'Токен выведен в консоль (dev mode)' };
    }

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.SMTP_FROM || 'ChiBox <noreply@chibox.com>',
      to: email,
      subject: 'Сброс пароля - ChiBox',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Сброс пароля</h2>
          <p>Здравствуйте, <strong>${username}</strong>!</p>
          <p>Вы запросили сброс пароля для вашего аккаунта.</p>
          <p>Нажмите на ссылку ниже для создания нового пароля:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              Сбросить пароль
            </a>
          </div>
          <p>Если кнопка не работает, скопируйте и вставьте эту ссылку в браузер:</p>
          <p style="word-break: break-all; color: #666;">${resetLink}</p>
          <p>Ссылка действительна в течение 1 часа.</p>
          <p>Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.</p>
          <br>
          <p>С уважением,<br>Команда ChiBox</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Ссылка сброса пароля отправлена на ${email}`);
    return { success: true, message: 'Email отправлен' };
  } catch (error) {
    logger.error('Ошибка отправки email:', error);
    return { success: false, message: 'Ошибка отправки email' };
  }
}

/**
 * Отправляет код верификации (алиас для sendVerificationEmail с другим порядком параметров)
 */
async function sendVerificationCode(email, username, code) {
  return await sendVerificationEmail(email, code, username);
}

module.exports = {
  generateVerificationCode,
  sendVerificationEmail,
  sendVerificationCode,
  sendPasswordResetEmail
};
