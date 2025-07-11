const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const db = require('../models');
const { logger } = require('../utils/logger');

// Настройки Steam OAuth
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_RETURN_URL = process.env.STEAM_RETURN_URL || 'http://localhost:3000/auth/steam/return';
const STEAM_REALM = process.env.STEAM_REALM || 'http://localhost:3000/';

if (!STEAM_API_KEY) {
  logger.warn('STEAM_API_KEY не установлен. Steam авторизация недоступна.');
}

// Сериализация пользователя для сессий
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Steam OAuth стратегия
if (STEAM_API_KEY) {
  passport.use(new SteamStrategy({
    returnURL: STEAM_RETURN_URL,
    realm: STEAM_REALM,
    apiKey: STEAM_API_KEY
  },
  async (identifier, profile, done) => {
    try {
      const steamId = identifier.split('/').pop();

      logger.info('Steam OAuth callback:', {
        steamId,
        displayName: profile.displayName,
        username: profile._json?.personaname
      });

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
          steam_avatar_url: avatarUrl,
          steam_profile_url: profile._json?.profileurl,
          last_login_date: new Date()
        };

        console.log('📝 Update data:', updateData);

        await user.update(updateData);

        console.log('✅ Steam data updated successfully');
        logger.info(`Пользователь ${user.username} вошел через Steam, данные обновлены`);
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
          steam_avatar_url: avatarUrl,
          steam_profile_url: profile._json?.profileurl,
          auth_provider: 'steam',
          is_email_verified: true, // Steam аккаунты считаем верифицированными
          last_login_date: new Date(),
          registration_date: new Date()
        });

        logger.info(`Создан новый пользователь через Steam: ${username} (${steamId})`);
        return done(null, user);
      }
    } catch (error) {
      logger.error('Ошибка Steam OAuth:', error);
      return done(error, null);
    }
  }));
}

module.exports = passport;
