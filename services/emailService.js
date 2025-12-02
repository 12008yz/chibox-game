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
const nodemailer = require('nodemailer');
let transporter = null;
let isInitializing = false;
let initializationPromise = null;

// Инициализация транспорта
async function initializeTransporter() {
  if (transporter) return transporter;
  if (isInitializing) return initializationPromise;

  isInitializing = true;
  initializationPromise = (async () => {
    try {
      // Проверяем настройки SMTP
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        logger.info('Инициализация SMTP транспорта с настройками:', {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          user: process.env.SMTP_USER,
          secure: process.env.SMTP_SECURE
        });

        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          },
          tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2'
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000,
          debug: true, // Включаем отладку
          logger: true // Включаем логирование
        });

        // Проверяем соединение с таймаутом
        try {
          await Promise.race([
            transporter.verify(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Verify timeout')), 5000))
          ]);
          logger.info('✅ Email транспорт настроен через SMTP и подключение проверено');
        } catch (verifyError) {
          logger.warn('⚠️ SMTP транспорт создан, но проверка подключения не удалась:', verifyError.message);
          // Продолжаем работу, транспорт может работать позже
        }
      } else {
        logger.warn('SMTP настройки не найдены в .env - email функции отключены');
        transporter = null;
      }
      return transporter;
    } catch (error) {
      logger.warn('⚠️ Ошибка настройки email транспорта:', error.message);
      logger.warn('⚠️ Приложение продолжит работу без email функций');
      transporter = null;
      return null;
    } finally {
      isInitializing = false;
    }
  })();

  return initializationPromise;
}

// Инициализируем транспорт (не блокируем запуск приложения)
initializeTransporter().catch(err => {
  logger.warn('⚠️ Email транспорт не инициализирован');
  logger.warn('⚠️ Приложение продолжит работу без функции отправки email');
});

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
    // Убеждаемся, что транспорт инициализирован
    if (!transporter) {
      await initializeTransporter();
    }

    if (!transporter) {
      logger.warn(`[DEV MODE] Транспорт не инициализирован. Код подтверждения для ${email}: ${code}`);
      return { success: true, message: 'Код выведен в консоль (dev mode)' };
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || 'ChiBox <noreply@chibox-game.ru>',
      to: email,
      replyTo: process.env.SMTP_FROM || 'ChiBox <noreply@chibox-game.ru>',
      subject: 'Подтверждение регистрации - ChiBox',
      text: `
Добро пожаловать в ChiBox!

Здравствуйте, ${username}!

Для завершения регистрации введите код подтверждения:

${code}

Код действителен в течение 15 минут.

Если вы не регистрировались на нашем сайте, просто проигнорируйте это письмо.

С уважением,
Команда ChiBox
      `,
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
      `,
      headers: {
        'X-Mailer': 'ChiBox Mailer',
        'X-Priority': '1',
        'Importance': 'high'
      }
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`✅ Код подтверждения отправлен на ${email}`);

    // Если используется Ethereal Email, покажем ссылку на просмотр
    if (info.messageId && transporter.options.host === 'smtp.ethereal.email') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      logger.info(`📧 Просмотр email: ${previewUrl}`);
      return { success: true, message: 'Email отправлен', previewUrl, messageId: info.messageId };
    }

    return { success: true, message: 'Email отправлен', messageId: info.messageId };
  } catch (error) {
    logger.error('❌ Ошибка отправки email:', {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
    throw error;
  }
}

/**
 * Отправляет email с уведомлением о смене пароля
 */
async function sendPasswordResetEmail(email, resetToken, username) {
  try {
    // Убеждаемся, что транспорт инициализирован
    if (!transporter) {
      await initializeTransporter();
    }

    if (!transporter) {
      logger.warn(`[DEV MODE] Транспорт не инициализирован. Токен сброса пароля для ${email}: ${resetToken}`);
      return { success: true, message: 'Токен выведен в консоль (dev mode)' };
    }

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.SMTP_FROM || 'ChiBox <noreply@chibox-game.ru>',
      to: email,
      replyTo: process.env.SMTP_FROM || 'ChiBox <noreply@chibox-game.ru>',
      subject: 'Сброс пароля - ChiBox',
      text: `
Сброс пароля

Здравствуйте, ${username}!

Вы запросили сброс пароля для вашего аккаунта.

Перейдите по ссылке ниже для создания нового пароля:

${resetLink}

Ссылка действительна в течение 1 часа.

Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.

С уважением,
Команда ChiBox
      `,
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
      `,
      headers: {
        'X-Mailer': 'ChiBox Mailer',
        'X-Priority': '1',
        'Importance': 'high'
      }
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`✅ Ссылка сброса пароля отправлена на ${email}`);
    return { success: true, message: 'Email отправлен', messageId: info.messageId };
  } catch (error) {
    logger.error('❌ Ошибка отправки email:', {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
    throw error;
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
