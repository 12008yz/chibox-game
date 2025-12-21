const jwt = require('jsonwebtoken');
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

async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { username, steam_trade_url, email } = req.body;

    // Валидация типов для защиты от Type Confusion
    if (username !== undefined && typeof username !== 'string') {
      return res.status(400).json({ message: 'Username должен быть строкой' });
    }

    if (steam_trade_url !== undefined && typeof steam_trade_url !== 'string') {
      return res.status(400).json({ message: 'Steam trade URL должен быть строкой' });
    }

    if (email !== undefined && typeof email !== 'string') {
      return res.status(400).json({ message: 'Email должен быть строкой' });
    }

    // Дополнительная валидация длины
    if (username && username.length > 50) {
      return res.status(400).json({ message: 'Username слишком длинный' });
    }

    if (steam_trade_url && steam_trade_url.length > 500) {
      return res.status(400).json({ message: 'Steam trade URL слишком длинный' });
    }

    if (email && email.length > 255) {
      return res.status(400).json({ message: 'Email слишком длинный' });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    let emailChanged = false;

    if (username && username.trim() !== user.username) {
      const trimmedUsername = username.trim();
      const usernameExists = await db.User.findOne({
        where: { username: trimmedUsername, id: { [db.Sequelize.Op.ne]: userId } }
      });
      if (usernameExists) {
        return res.status(409).json({ message: 'Такой username уже занят' });
      }
      user.username = trimmedUsername;
    }

    if (steam_trade_url) {
      const trimmedUrl = steam_trade_url.trim();
      // Дополнительная валидация URL
      if (trimmedUrl && !trimmedUrl.includes('steamcommunity.com')) {
        return res.status(400).json({ message: 'Неверный формат Steam trade URL' });
      }
      user.steam_trade_url = trimmedUrl;
    }

    // Обработка изменения email
    if (email && email.trim() !== user.email) {
      const trimmedEmail = email.trim().toLowerCase();

      // Проверяем, что это не Steam email
      if (trimmedEmail.endsWith('@steam.local')) {
        return res.status(400).json({
          message: 'Steam email не может быть использован. Укажите свой реальный email адрес.'
        });
      }

      // Валидация формата email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ message: 'Неверный формат email' });
      }

      // Проверяем, что email не используется другим пользователем
      const emailExists = await db.User.findOne({
        where: {
          email: trimmedEmail,
          id: { [db.Sequelize.Op.ne]: userId }
        }
      });
      if (emailExists) {
        return res.status(409).json({ message: 'Этот email уже используется' });
      }

      // Генерируем новый код подтверждения
      const verificationCode = emailService.generateVerificationCode();
      const verificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

      // Отправляем код подтверждения на новый email ПЕРЕД сохранением в базу
      try {
        await emailService.sendVerificationCode(trimmedEmail, user.username, verificationCode);
        logger.info('Verification code sent to new email:', trimmedEmail);

        // Если отправка успешна, обновляем данные пользователя
        user.email = trimmedEmail;
        user.is_email_verified = false; // Сбрасываем статус верификации
        user.verification_code = verificationCode;
        user.email_verification_expires = verificationExpires;
        emailChanged = true;
      } catch (emailError) {
        logger.error('Failed to send verification email:', emailError);
        // Возвращаем ошибку пользователю вместо продолжения
        return res.status(500).json({
          message: 'Не удалось отправить код подтверждения на новый email. Пожалуйста, проверьте правильность email адреса и попробуйте позже.',
          error: 'EMAIL_SEND_FAILED'
        });
      }
    }

    await user.save();

    // Создание уведомления при изменении данных профиля
    await db.Notification.create({
      user_id: userId,
      title: 'Обновление профиля',
      message: 'Ваши данные профиля были изменены.',
      type: 'success',
      category: 'general',
      importance: 5
    });

    logger.info(`Профиль пользователя обновлен: ${user.email}`);

    // Перезагружаем пользователя с актуальными данными
    const updatedUser = await db.User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    // Генерируем новый JWT токен с обновленными данными
    const newToken = jwt.sign(
      {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        auth_provider: updatedUser.auth_provider,
        role: updatedUser.role,
        steam_id: updatedUser.steam_id
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    const responseMessage = emailChanged
      ? 'Профиль обновлен. Код подтверждения отправлен на новый email.'
      : 'Профиль успешно обновлен';

    return res.json({
      message: responseMessage,
      emailChanged: emailChanged,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        steam_trade_url: updatedUser.steam_trade_url,
        steam_id: updatedUser.steam_id,
        steam_avatar: updatedUser.steam_avatar_url,
        steam_profile: updatedUser.steam_profile,
        steam_profile_url: updatedUser.steam_profile_url,
        is_email_verified: updatedUser.is_email_verified
      },
      token: newToken // Возвращаем новый токен
    });
  } catch (error) {
    logger.error('Ошибка обновления профиля:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  updateProfile
};
