const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const db = require('../models');
const { logger } = require('../utils/logger');
const { createSteamLoginNotification } = require('../utils/notificationHelper');
const { addExperience } = require('../services/xpService');
const { updateUserBonuses } = require('../utils/userBonusCalculator');
const { bindReferrer } = require('../services/referralService');
const { isUserBanned } = require('../utils/userBan');

// Настройки Steam OAuth
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_RETURN_URL = process.env.STEAM_RETURN_URL || 'https://chibox-game.ru/api/v1/auth/steam/return';
const STEAM_REALM = process.env.STEAM_REALM || 'https://chibox-game.ru/';

if (!STEAM_API_KEY) {
  logger.warn('STEAM_API_KEY не установлен. Steam авторизация недоступна.');
}

// Сериализация пользователя для сессий
passport.serializeUser((user, done) => {
  // Для процесса привязки Steam возвращаем специальный ключ с linkUserId и steamData
  if (user.isLinkingProcess) {
    done(null, {
      type: 'linking_process',
      linkUserId: user.linkUserId,
      steamData: user.steamData
    });
  } else {
    done(null, user.id);
  }
});

passport.deserializeUser(async (id, done) => {
  try {
    // Проверяем, если это процесс привязки Steam
    if (typeof id === 'object' && id.type === 'linking_process') {
      // Возвращаем временный объект для процесса привязки с сохранением linkUserId и steamData
      return done(null, {
        isLinkingProcess: true,
        linkUserId: id.linkUserId,
        steamData: id.steamData
      });
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
    passReqToCallback: true,
    // Добавляем настройки для ускорения OpenID discovery
    profile: true,
    // Увеличиваем размер кеша провайдера и устанавливаем таймауты
    stateless: false,
    // Используем прямой endpoint Steam вместо discovery
    providerURL: 'https://steamcommunity.com/openid',
    // Устанавливаем таймаут для HTTP запросов
    timeout: 5000
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
          steam_avatar_url: profile._json?.avatarfull || profile._json?.avatarmedium || profile._json?.avatar,
          steam_profile_url: profile._json?.profileurl
        };
        // Возвращаем специальный объект для обозначения процесса привязки с linkUserId
        return done(null, { isLinkingProcess: true, linkUserId: req.session.linkUserId });
      }

      // Ищем пользователя по Steam ID
      let user = await db.User.findOne({
        where: { steam_id: steamId }
      });

      if (user) {
        if (user.is_bot) {
          return done(null, false, { message: 'Вход с этого аккаунта недоступен.' });
        }
        if (isUserBanned(user)) {
          return done(null, false, { message: 'Аккаунт заблокирован.' });
        }
        // Пользователь существует, обновляем его данные
        const steamAvatarUrl = profile._json?.avatarfull || profile._json?.avatarmedium || profile._json?.avatar;

        console.log('🔄 Updating existing user Steam data:', {
          userId: user.id,
          currentUsername: user.username,
          steamId,
          steamAvatarUrl,
          hasCustomAvatar: !!user.avatar_url,
          profileUrl: profile._json?.profileurl,
          displayName: profile.displayName,
          fullProfile: profile._json
        });

        // Проверяем, нужно ли начислить XP за ежедневный вход
        const now = new Date();
        const lastLogin = user.last_login_date;
        let shouldAwardXP = false;

        if (!lastLogin) {
          shouldAwardXP = true;
        } else {
          const lastLoginDate = new Date(lastLogin);
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const lastLoginStart = new Date(lastLoginDate.getFullYear(), lastLoginDate.getMonth(), lastLoginDate.getDate());

          if (lastLoginStart < todayStart) {
            shouldAwardXP = true;
          }
        }

        // Обновляем steam_profile, steam_avatar_url и steam_profile_url
        // НЕ обновляем username - пользователь сам может его изменить
        const updateData = {
          steam_profile: profile._json,
          steam_avatar_url: steamAvatarUrl,
          steam_profile_url: profile._json?.profileurl,
          last_login_date: now
        };

        console.log('📝 Update data:', updateData);

        await user.update(updateData);

        console.log('✅ Steam data updated successfully');
        logger.info(`Пользователь ${user.username} вошел через Steam, данные обновлены`);

        // Начисляем +15 XP за ежедневный вход (если это первый вход за день)
        if (shouldAwardXP) {
          try {
            await addExperience(user.id, 15, 'daily_login', null, 'Вход через Steam');
            logger.info(`Пользователю ${user.username} начислено +15 XP за ежедневный вход через Steam`);
            // Перезагружаем пользователя, чтобы получить обновленные XP и уровень
            await user.reload();
          } catch (xpError) {
            logger.error('Ошибка при начислении XP за вход через Steam:', xpError);
          }
        }

        // Создаем уведомление о входе через Steam
        try {
          await createSteamLoginNotification(user.id, user.username);
        } catch (notificationError) {
          logger.warn('Не удалось создать уведомление о входе через Steam:', notificationError.message);
        }

        if (req.session && req.session.referralCode) {
          try {
            const result = await bindReferrer(user.id, req.session.referralCode);
            logger.info('Referrer bind (existing user)', { userId: user.id, code: req.session.referralCode.substring(0, 8), bound: result && result.bound });
            delete req.session.referralCode;
            if (req.session.save) req.session.save(() => {});
          } catch (refErr) {
            logger.error('Ошибка привязки реферера при Steam логине:', refErr);
          }
        } else if (req.session && !req.session.referralCode) {
          logger.info('Steam login: no referralCode in session (existing user)', { userId: user.id });
        }
        return done(null, user);
      } else {
        // Перед созданием нового пользователя проверяем, не привязан ли уже этот Steam ID к другому аккаунту
        const existingSteamUser = await db.User.findOne({
          where: { steam_id: steamId }
        });

        if (existingSteamUser) {
          logger.error('Попытка создать нового пользователя с уже существующим Steam ID:', {
            steamId,
            existingUserId: existingSteamUser.id,
            existingUsername: existingSteamUser.username,
            existingEmail: existingSteamUser.email
          });
          return done(new Error('Этот Steam аккаунт уже привязан к другому пользователю'), null);
        }

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
          steam_avatar_url: avatarUrl,
          steam_profile_url: profile._json?.profileurl,
          auth_provider: 'steam',
          is_email_verified: true, // Steam аккаунты считаем верифицированными
          last_login_date: new Date(),
          registration_date: new Date()
        });

        logger.info(`Создан новый пользователь через Steam: ${username} (${steamId})`);

        // Инициализируем бонусы пользователя
        try {
          await updateUserBonuses(user.id);
          logger.info(`Бонусы инициализированы для нового пользователя ${username}`);
          // Перезагружаем пользователя, чтобы получить обновленные бонусы
          await user.reload();
        } catch (bonusError) {
          logger.error('Ошибка при инициализации бонусов для нового пользователя Steam:', bonusError);
        }

        // Начисляем +15 XP за первый вход
        try {
          await addExperience(user.id, 15, 'daily_login', null, 'Первый вход через Steam');
          logger.info(`Новому пользователю ${username} начислено +15 XP за первый вход через Steam`);
          // Перезагружаем пользователя, чтобы получить обновленные XP и уровень
          await user.reload();
        } catch (xpError) {
          logger.error('Ошибка при начислении XP новому пользователю Steam:', xpError);
        }

        // Создаем уведомление о входе через Steam для нового пользователя
        try {
          await createSteamLoginNotification(user.id, user.username);
        } catch (notificationError) {
          logger.warn('Не удалось создать уведомление о входе через Steam для нового пользователя:', notificationError.message);
        }

        if (req.session && req.session.referralCode) {
          try {
            const result = await bindReferrer(user.id, req.session.referralCode);
            logger.info('Referrer bind (new user)', { userId: user.id, code: req.session.referralCode.substring(0, 8), bound: result && result.bound });
            delete req.session.referralCode;
            if (req.session.save) req.session.save(() => {});
          } catch (refErr) {
            logger.error('Ошибка привязки реферера при Steam логине (новый пользователь):', refErr);
          }
        } else if (req.session && !req.session.referralCode) {
          logger.info('Steam login: no referralCode in session (new user)', { userId: user.id });
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
    returnURL: process.env.STEAM_LINK_RETURN_URL || 'https://chibox-game.ru/api/v1/auth/link-steam/return',
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

      // Сохраняем данные Steam в сессии
      const steamLinkData = {
        steam_id: steamId,
        steam_profile: profile._json,
        steam_avatar_url: profile._json?.avatarfull || profile._json?.avatarmedium || profile._json?.avatar,
        steam_profile_url: profile._json?.profileurl
      };

      // Убеждаемся, что сессия сохранена
      req.session.steamLinkData = steamLinkData;
      req.session.save((err) => {
        if (err) {
          logger.error('Ошибка сохранения сессии Steam Link:', err);
        } else {
          logger.info('Steam Link данные сохранены в сессии:', {
            steamId,
            linkUserId: req.session.linkUserId,
            steamProfile: profile._json?.personaname,
            steamAvatar: steamLinkData.steam_avatar_url
          });
        }
      });

      // Возвращаем специальный объект для обозначения процесса привязки
      return done(null, {
        isLinkingProcess: true,
        linkUserId: req.session?.linkUserId,
        steamData: steamLinkData
      });

    } catch (error) {
      logger.error('Ошибка Steam Link OAuth:', error);
      return done(error, null);
    }
  }));
}

module.exports = passport;
