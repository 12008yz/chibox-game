const express = require('express');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const auth = require('../middleware/auth');

const router = express.Router();

// Steam OAuth - начало авторизации
router.get('/steam', (req, res, next) => {
  if (!process.env.STEAM_API_KEY) {
    return res.status(500).json({
      message: 'Steam авторизация не настроена'
    });
  }

  passport.authenticate('steam')(req, res, next);
});

// Steam OAuth - callback после авторизации
router.get('/steam/return',
  passport.authenticate('steam', {
    failureRedirect: '/login?error=steam_auth_failed'
  }),
  async (req, res) => {
    try {
      // Генерируем JWT токен для пользователя
      const token = jwt.sign(
        {
          id: req.user.id,
          username: req.user.username,
          auth_provider: req.user.auth_provider
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      logger.info(`Steam авторизация успешна для пользователя ${req.user.username}`);

      // Перенаправляем на фронтенд с токеном
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/success?token=${token}&provider=steam`);

    } catch (error) {
      logger.error('Ошибка при генерации токена после Steam авторизации:', error);
      res.redirect('/login?error=token_generation_failed');
    }
  }
);

// Проверка статуса авторизации
router.get('/status', auth, (req, res) => {
  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      auth_provider: req.user.auth_provider,
      steam_avatar_url: req.user.steam_avatar_url,
      steam_profile_url: req.user.steam_profile_url
    }
  });
});

// Разлогин
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      logger.error('Ошибка при выходе:', err);
      return res.status(500).json({ message: 'Ошибка при выходе' });
    }
    res.json({ message: 'Выход выполнен успешно' });
  });
});

// Привязка Steam аккаунта к существующему пользователю
router.get('/link-steam', auth, (req, res, next) => {
  if (!process.env.STEAM_API_KEY) {
    return res.status(500).json({
      message: 'Steam авторизация не настроена'
    });
  }

  if (req.user.auth_provider === 'steam') {
    return res.status(400).json({
      message: 'Аккаунт уже привязан к Steam'
    });
  }

  // Сохраняем ID пользователя в сессии для последующей привязки
  req.session.linkUserId = req.user.id;

  passport.authenticate('steam')(req, res, next);
});

// Callback для привязки Steam аккаунта
router.get('/link-steam/return',
  passport.authenticate('steam', {
    failureRedirect: '/profile?error=steam_link_failed'
  }),
  async (req, res) => {
    try {
      const linkUserId = req.session.linkUserId;
      if (!linkUserId) {
        return res.redirect('/profile?error=session_expired');
      }

      const steamId = req.user.steam_id;

      // Проверяем, не привязан ли уже этот Steam аккаунт к другому пользователю
      const existingUser = await db.User.findOne({
        where: { steam_id: steamId }
      });

      if (existingUser && existingUser.id !== linkUserId) {
        return res.redirect('/profile?error=steam_already_linked');
      }

      // Привязываем Steam аккаунт к существующему пользователю
      await db.User.update({
        steam_id: steamId,
        steam_profile: req.user.steam_profile,
        steam_avatar_url: req.user.steam_avatar_url,
        steam_profile_url: req.user.steam_profile_url
      }, {
        where: { id: linkUserId }
      });

      // Удаляем временного Steam пользователя
      await db.User.destroy({
        where: { id: req.user.id }
      });

      delete req.session.linkUserId;

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/profile?success=steam_linked`);

    } catch (error) {
      logger.error('Ошибка при привязке Steam аккаунта:', error);
      res.redirect('/profile?error=link_failed');
    }
  }
);

module.exports = router;
