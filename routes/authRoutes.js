const express = require('express');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const auth = require('../middleware/auth');
const db = require('../models');
const { getTradeUrlFromSteam, getTradePrivacyUrl } = require('../utils/steamTradeHelper');
const { refreshToken } = require('../controllers/user/refreshToken');

const router = express.Router();

// Обновление access токена через refresh token
router.post('/refresh', refreshToken);

// Steam OAuth - начало авторизации (быстрый метод с прямым редиректом)
router.get('/steam', (req, res, next) => {
  if (!process.env.STEAM_API_KEY) {
    return res.status(500).json({
      message: 'Steam авторизация не настроена'
    });
  }

  // Используем минимальный набор параметров для максимальной скорости
  const returnURL = encodeURIComponent(process.env.STEAM_RETURN_URL || 'https://chibox-game.ru/api/v1/auth/steam/return');
  const realm = encodeURIComponent(process.env.STEAM_REALM || 'https://chibox-game.ru/');

  // МИНИМАЛЬНЫЙ URL - убираем все необязательные параметры
  const steamLoginUrl = `https://steamcommunity.com/openid/login?` +
    `openid.mode=checkid_setup` +
    `&openid.ns=http://specs.openid.net/auth/2.0` +
    `&openid.identity=http://specs.openid.net/auth/2.0/identifier_select` +
    `&openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select` +
    `&openid.return_to=${returnURL}` +
    `&openid.realm=${realm}`;

  // Устанавливаем заголовки для ускорения
  res.setHeader('Cache-Control', 'no-cache');

  logger.info('Redirecting to Steam login (minimal params)');
  // Используем 302 редирект для скорости
  res.redirect(302, steamLoginUrl);
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
          email: req.user.email,
          auth_provider: req.user.auth_provider,
          role: req.user.role,
          steam_id: req.user.steam_id
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      logger.info(`Steam авторизация успешна для пользователя ${req.user.username}`);

      // Перенаправляем на фронтенд с токеном
      const frontendUrl = process.env.FRONTEND_URL || 'https://chibox-game.ru';
      console.log(`Redirecting to: ${frontendUrl}/auth/success?token=${token}&provider=steam`);
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
      steam_avatar: req.user.steam_avatar_url,
      steam_profile_url: req.user.steam_profile_url
    }
  });
});

// Разлогин
router.post('/logout', (req, res) => {
  // Очищаем httpOnly cookies с токенами
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });

  // Выполняем стандартный logout если есть сессия
  if (req.logout) {
    req.logout((err) => {
      if (err) {
        logger.error('Ошибка при выходе из сессии:', err);
        // Не возвращаем ошибку, так как cookies уже очищены
      }
      logger.info('Logout выполнен успешно');
      res.json({ success: true, message: 'Выход выполнен успешно' });
    });
  } else {
    logger.info('Logout выполнен успешно (без сессии)');
    res.json({ success: true, message: 'Выход выполнен успешно' });
  }
});

// Привязка Steam аккаунта к существующему пользователю
router.get('/link-steam', auth, (req, res, next) => {
  logger.info('Попытка привязки Steam аккаунта:', {
    userId: req.user?.id,
    username: req.user?.username,
    hasApiKey: !!process.env.STEAM_API_KEY,
    authProvider: req.user?.auth_provider,
    query: req.query
  });

  if (!process.env.STEAM_API_KEY) {
    logger.error('Steam API Key не настроен');
    return res.status(500).json({
      message: 'Steam авторизация не настроена'
    });
  }

  if (req.user.auth_provider === 'steam') {
    logger.warn('Пользователь уже привязан к Steam:', req.user.id);
    return res.status(400).json({
      message: 'Аккаунт уже привязан к Steam'
    });
  }

  // Сохраняем ID пользователя в сессии для последующей привязки
  req.session.linkUserId = req.user.id;

  // Принудительно сохраняем сессию перед перенаправлением на Steam
  req.session.save((err) => {
    if (err) {
      logger.error('Ошибка сохранения сессии перед Steam OAuth:', err);
      return res.status(500).json({ message: 'Ошибка сохранения сессии' });
    }

    logger.info('Сохранен linkUserId в сессии:', {
      linkUserId: req.user.id,
      sessionId: req.sessionID
    });

    passport.authenticate('steam-link')(req, res, next);
  });
});

// Callback для привязки Steam аккаунта
router.get('/link-steam/return',
  passport.authenticate('steam-link', {
    failureRedirect: 'https://chibox-game.ru/profile?error=steam_link_failed'
  }),
  async (req, res) => {
    try {
      logger.info('Callback link-steam/return вызван:', {
        sessionExists: !!req.session,
        linkUserId: req.session?.linkUserId,
        steamLinkData: !!req.session?.steamLinkData,
        user: req.user
      });

      // Попытаемся получить linkUserId из сессии или из req.user
      let linkUserId = req.session?.linkUserId;
      if (!linkUserId && req.user?.linkUserId) {
        linkUserId = req.user.linkUserId;
      }

      if (!linkUserId) {
        logger.error('linkUserId не найден в сессии и в req.user', {
          sessionData: req.session,
          userData: req.user
        });
        const frontendUrl = process.env.FRONTEND_URL || 'https://chibox-game.ru';
        return res.redirect(`${frontendUrl}/profile?error=session_expired`);
      }

      // Попытаемся получить steamData из сессии или из req.user
      let steamData = req.session?.steamLinkData;
      if (!steamData && req.user?.steamData) {
        steamData = req.user.steamData;
      }

      if (!steamData) {
        logger.error('steamLinkData не найден в сессии и в req.user', {
          sessionData: req.session,
          userData: req.user
        });
        const frontendUrl = process.env.FRONTEND_URL || 'https://chibox-game.ru';
        return res.redirect(`${frontendUrl}/profile?error=steam_data_missing`);
      }

      const steamId = steamData.steam_id;

      logger.info('Данные для привязки Steam:', {
        linkUserId,
        steamId,
        steamProfile: steamData.steam_profile?.personaname
      });

      // Проверяем, не привязан ли уже этот Steam аккаунт к другому пользователю
      logger.info('Проверяем существующего пользователя с Steam ID:', steamId);
      const existingUser = await db.User.findOne({
        where: { steam_id: steamId }
      });

      if (existingUser && existingUser.id !== linkUserId) {
        logger.warn('Steam аккаунт уже привязан к другому пользователю:', {
          steamId,
          existingUserId: existingUser.id,
          linkUserId
        });
        const frontendUrl = process.env.FRONTEND_URL || 'https://chibox-game.ru';
        return res.redirect(`${frontendUrl}/profile?error=steam_already_linked`);
      }

      // Привязываем Steam аккаунт к существующему пользователю
      logger.info('Обновляем пользователя Steam данными:', {
        userId: linkUserId,
        steamId,
        steamProfile: steamData.steam_profile?.personaname
      });

      // Пытаемся автоматически получить Trade URL
      let autoTradeUrl = null;
      try {
        logger.info('Попытка автоматического получения Trade URL для Steam ID:', steamId);
        autoTradeUrl = await getTradeUrlFromSteam(steamId);
        if (autoTradeUrl) {
          logger.info('Trade URL автоматически получен:', autoTradeUrl);
        } else {
          logger.info('Trade URL не удалось получить автоматически. Пользователь может указать его вручную.');
        }
      } catch (error) {
        logger.error('Ошибка при автоматическом получении Trade URL:', error);
      }

      // Подготавливаем данные для обновления
      const updateData = {
        steam_id: steamId,
        steam_profile: steamData.steam_profile,
        steam_avatar_url: steamData.steam_avatar_url || steamData.steam_avatar,
        steam_profile_url: steamData.steam_profile_url
      };

      // Добавляем Trade URL если удалось получить
      if (autoTradeUrl) {
        updateData.steam_trade_url = autoTradeUrl;
      }

      await db.User.update(updateData, {
        where: { id: linkUserId }
      });

      logger.info('Steam данные успешно обновлены в БД');

      // Получаем обновленные данные пользователя
      const updatedUser = await db.User.findByPk(linkUserId, {
        attributes: { exclude: ['password'] }
      });

      logger.info('Получены обновленные данные пользователя:', {
        userId: updatedUser.id,
        username: updatedUser.username,
        steamId: updatedUser.steam_id
      });

      // Генерируем новый JWT токен с обновленными данными Steam
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

      logger.info('Сгенерирован новый JWT токен');

      // Очищаем временные данные из сессии
      delete req.session.linkUserId;
      delete req.session.steamLinkData;

      const frontendUrl = process.env.FRONTEND_URL || 'https://chibox-game.ru';
      const redirectUrl = `${frontendUrl}/profile?success=steam_linked&token=${encodeURIComponent(newToken)}`;

      logger.info('Перенаправляем на фронтенд:', redirectUrl);
      res.redirect(redirectUrl);

    } catch (error) {
      logger.error('Ошибка при привязке Steam аккаунта:', {
        error: error.message,
        stack: error.stack,
        sessionData: {
          linkUserId: req.session?.linkUserId,
          hasSteamLinkData: !!req.session?.steamLinkData
        }
      });
      const frontendUrl = process.env.FRONTEND_URL || 'https://chibox-game.ru';
      res.redirect(`${frontendUrl}/profile?error=link_failed`);
    }
  }
);

module.exports = router;
