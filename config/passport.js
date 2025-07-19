const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const db = require('../models');
const { logger } = require('../utils/logger');
const { createSteamLoginNotification } = require('../utils/notificationHelper');

// Настройки Steam OAuth
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_RETURN_URL = process.env.STEAM_RETURN_URL || 'http://localhost:3000/api/v1/auth/steam/return';
const STEAM_REALM = process.env.STEAM_REALM || 'http://localhost:3000/';

if (!STEAM_API_KEY) {
  logger.warn('STEAM_API_KEY не установлен. Steam авторизация недоступна.');
}

// Сериализация пользователя для сессий
passport.serializeUser((user, done) => {
  // Для процесса привязки Steam возвращаем специальный ключ
  if (user.isLinkingProcess) {
    done(null, 'linking_process');
  } else {
    done(null, user.id);
  }
});

passport.deserializeUser(async (id, done) => {
  try {
    // Проверяем, если это процесс привязки Steam
    if (id === 'linking_process') {
      // Возвращаем временный объект для процесса привязки
      return done(null, { isLinkingProcess: true });
    }

    // Обычная десериализация пользователя
    const user = await db.User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Steam OAuth стратегия для обычной авторизации
if (STEAM_API_KEY) {
  passport.use('steam', new SteamStrategy({
    returnURL: STEAM_RETURN_URL,
    realm: STEAM_REALM,
    apiKey: STEAM_API_KEY,
    passReqToCallback: true
  },
  async (req, identifier, profile, done) => {
    try {
      const steamId = identifier.split('/').pop();

      logger.info('Steam OAuth callback:', {
        steamId,
        displayName: profile.displayName,
        username: profile._json?.personaname,
        isLinking: !!req.session?.linkUserId
      });

      // Если это процесс привязки, сохраняем данные Steam в сессии
      if (req.session && req.session.linkUserId) {
        req.session.steamLinkData = {
          steam_id: steamId,
          steam_profile: profile._json,
          steam_avatar: profile._json?.avatarfull || profile._json?.avatarmedium || profile._json?.avatar,
          steam_profile_url: profile._json?.profileurl
        };
        // Возвращаем специальный объект для обозначения процесса привязки
        return done(null, { isLinkingProcess: true });
      }

      // Ищем пользователя по Steam ID
      let user = await db.User.findOne({
        where: { steam_id: steamId }
      });

      if (user) {
        // Пользователь существует, обновляем его данные
        const avatarUrl = profile._json?.avatarfull || profile._json?.avatarmedium || profile._json?.avatar;
        const newUsername = profile._json?.personaname || user.username;

        console.log('🔄 Updating existing user Steam data:', {
          userId: user.id,
          currentUsername: user.username,
          newUsername: newUsername,
          steamId,
          avatarUrl,
          profileUrl: profile._json?.profileurl,
          displayName: profile.displayName,
          fullProfile: profile._json
        });

        const updateData = {
          username: newUsername,
          steam_profile: profile._json,
          steam_avatar: avatarUrl,
          steam_profile_url: profile._json?.profileurl,
          last_login_date: new Date()
        };

        console.log('📝 Update data:', updateData);

        await user.update(updateData);

        console.log('✅ Steam data updated successfully');
        logger.info(`Пользователь ${user.username} вошел через Steam, данные обновлены`);

        // Создаем уведомление о входе через Steam
        try {
          await createSteamLoginNotification(user.id, user.username);
        } catch (notificationError) {
          logger.warn('Не удалось создать уведомление о входе через Steam:', notificationError.message);
        }

        return done(null, user);
      } else {
        // Создаем нового пользователя
        const username = profile._json?.personaname || `steam_user_${steamId.slice(-8)}`;
        const email = `${steamId}@steam.local`; // Временный email
        const avatarUrl = profile._json?.avatarfull || profile._json?.avatarmedium || profile._json?.avatar;

        console.log('Creating new Steam user:', {
          username,
          steamId,
          avatarUrl,
          profileUrl: profile._json?.profileurl,
          photos: profile.photos
        });

        user = await db.User.create({
          username: username,
          email: email,
          password: 'steam_oauth', // Пароль не используется для Steam пользователей
          steam_id: steamId,
          steam_profile: profile._json,
          steam_avatar: avatarUrl,
          steam_profile_url: profile._json?.profileurl,
          auth_provider: 'steam',
          is_email_verified: true, // Steam аккаунты считаем верифицированными
          last_login_date: new Date(),
          registration_date: new Date()
        });

        logger.info(`Создан новый пользователь через Steam: ${username} (${steamId})`);

        // Создаем уведомление о входе через Steam для нового пользователя
        try {
          await createSteamLoginNotification(user.id, user.username);
        } catch (notificationError) {
          logger.warn('Не удалось создать уведомление о входе через Steam для нового пользователя:', notificationError.message);
        }

        return done(null, user);
      }
    } catch (error) {
      logger.error('Ошибка Steam OAuth:', error);
      return done(error, null);
    }
  }));

  // Steam OAuth стратегия для привязки аккаунтов
  passport.use('steam-link', new SteamStrategy({
    returnURL: process.env.STEAM_LINK_RETURN_URL || 'http://localhost:3000/api/v1/auth/link-steam/return',
    realm: STEAM_REALM,
    apiKey: STEAM_API_KEY,
    passReqToCallback: true
  },
  async (req, identifier, profile, done) => {
    try {
      const steamId = identifier.split('/').pop();

      logger.info('Steam Link OAuth callback:', {
        steamId,
        displayName: profile.displayName,
        username: profile._json?.personaname,
        linkUserId: req.session?.linkUserId
      });

      // Для привязки аккаунтов сохраняем данные Steam в сессии
      if (req.session && req.session.linkUserId) {
        req.session.steamLinkData = {
          steam_id: steamId,
          steam_profile: profile._json,
          steam_avatar: profile._json?.avatarfull || profile._json?.avatarmedium || profile._json?.avatar,
          steam_profile_url: profile._json?.profileurl
        };
        // Возвращаем специальный объект для обозначения процесса привязки
        return done(null, { isLinkingProcess: true });
      } else {
        // Если нет linkUserId в сессии, это ошибка
        logger.error('Steam Link: linkUserId не найден в сессии');
        return done(new Error('Сессия привязки Steam истекла'), null);
      }
    } catch (error) {
      logger.error('Ошибка Steam Link OAuth:', error);
      return done(error, null);
    }
  }));
}

module.exports = passport;
