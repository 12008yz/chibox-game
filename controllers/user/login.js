const argon2 = require('argon2');
const db = require('../../models');
const jwt = require('jsonwebtoken');
const { logger } = require('../../middleware/logger');
const { updateUserBonuses } = require('../../utils/userBonusCalculator');
const { addExperience } = require('../../services/xpService');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Используем Map для безопасного хранения неудачных попыток входа (защита от Prototype Pollution)
const failedLogin = new Map();

async function login(req, res) {
  try {
    const { email, password } = req.body;
    logger.info('[LOGIN] Login request received for email:', email);

    // Валидация типов для защиты от Prototype Pollution
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      logger.warn('[LOGIN] Invalid email or password type');
      return res.status(400).json({ message: 'Email и пароль обязательны и должны быть строками' });
    }

    // Дополнительная валидация email
    if (email.length > 254 || password.length > 128) {
      return res.status(400).json({ message: 'Неверный формат данных' });
    }

    const key = email.trim().toLowerCase();

    // Если есть блокировка — замедление или блок
    const userAttempts = failedLogin.get(key);
    if (userAttempts && userAttempts.blockUntil && Date.now() < userAttempts.blockUntil) {
      return res.status(429).json({ message: 'Попробуйте позже (блокировка из-за неудачных попыток)' });
    }

    logger.info('[LOGIN] Looking up user in database:', key);
    const user = await db.User.findOne({ where: { email: key } });
    if (!user) {
      logger.warn('[LOGIN] User not found:', key);
      const attempts = failedLogin.get(key) || { count: 0 };
      attempts.count++;
      if (attempts.count >= 5) {
        attempts.blockUntil = Date.now() + 10 * 60 * 1000; // 10 минут блокировка
      }
      failedLogin.set(key, attempts);
      return res.status(401).json({ message: 'Неверный email или пароль.' });
    }

    logger.info('[LOGIN] User found, verifying password for user ID:', user.id);
    const passwordMatch = await argon2.verify(user.password, password);
    if (!passwordMatch) {
      logger.warn('[LOGIN] Password mismatch for user:', key);
      const attempts = failedLogin.get(key) || { count: 0 };
      attempts.count++;
      if (attempts.count >= 5) {
        attempts.blockUntil = Date.now() + 10 * 60 * 1000;
      }
      failedLogin.set(key, attempts);
      return res.status(401).json({ message: 'Неверный email или пароль.' });
    }

    logger.info('[LOGIN] Password verified successfully for user:', user.id);
    // Очистка после удачного входа
    failedLogin.delete(key);

    // Обновляем бонусы пользователя при логине
    try {
      await updateUserBonuses(user.id);
      // Получаем обновленные данные пользователя
      await user.reload();
    } catch (bonusError) {
      logger.error('Ошибка при обновлении бонусов пользователя:', bonusError);
      // Не прерываем процесс логина, просто логируем ошибку
    }

    // Начисляем +15 XP за вход на сайт (раз в день)
    try {
      const now = new Date();
      const lastLogin = user.last_login_date;

      // Проверяем, был ли вход сегодня
      let shouldAwardXP = false;
      if (!lastLogin) {
        // Первый вход
        shouldAwardXP = true;
      } else {
        const lastLoginDate = new Date(lastLogin);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lastLoginStart = new Date(lastLoginDate.getFullYear(), lastLoginDate.getMonth(), lastLoginDate.getDate());

        // Если последний вход был до сегодняшнего дня
        if (lastLoginStart < todayStart) {
          shouldAwardXP = true;
        }
      }

      if (shouldAwardXP) {
        // Начисляем опыт за ежедневный вход
        await addExperience(user.id, 15, 'daily_login', null, 'Вход на сайт');
        logger.info(`Пользователю ${user.username} начислено +15 XP за ежедневный вход`);
      }

      // Обновляем дату последнего входа
      user.last_login_date = now;
      await user.save();

      // Перезагружаем пользователя, чтобы получить обновленные XP и уровень
      await user.reload();
    } catch (loginXpError) {
      logger.error('Ошибка при начислении XP за вход:', loginXpError);
      // Не прерываем процесс логина, просто логируем ошибку
    }

    // Объединяем запросы для избежания N+1
    const userWithDetails = await db.User.findByPk(user.id, {
      include: [
        {
          model: db.UserAchievement,
          as: 'achievements',
          include: [{
            model: db.Achievement,
            as: 'achievement',
            attributes: ['id', 'name', 'description']
          }],
          limit: 20
        },
        {
          model: db.UserInventory,
          as: 'inventory',
          include: [{
            model: db.Item,
            as: 'item',
            attributes: ['id', 'name', 'rarity', 'price', 'image_url']
          }],
          limit: 50,
          order: [['created_at', 'DESC']]
        }
      ]
    });

    const achievements = userWithDetails ? userWithDetails.achievements : [];
    const inventory = userWithDetails ? userWithDetails.inventory : [];

    logger.info('[LOGIN] Generating JWT token for user:', user.id);
    const token = generateToken(user);

    logger.info('[LOGIN] Preparing response data...');
    const response = {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        level: user.level,
        xp: user.xp,
        xp_to_next_level: user.xp_to_next_level,
        level_bonus_percentage: user.level_bonus_percentage,
        total_xp_earned: user.total_xp_earned,
        subscription_tier: user.subscription_tier,
        subscription_purchase_date: user.subscription_purchase_date,
        subscription_expiry_date: user.subscription_expiry_date,
        subscription_days_left: user.subscription_days_left,
        cases_available: user.cases_available,
        cases_opened_today: user.cases_opened_today,
        next_case_available_time: user.next_case_available_time,
        max_daily_cases: user.max_daily_cases,
        next_bonus_available_time: user.next_bonus_available_time,
        last_bonus_date: user.last_bonus_date,
        lifetime_bonuses_claimed: user.lifetime_bonuses_claimed,
        successful_bonus_claims: user.successful_bonus_claims,
        drop_rate_modifier: user.drop_rate_modifier,
        achievements_bonus_percentage: user.achievements_bonus_percentage,
        subscription_bonus_percentage: user.subscription_bonus_percentage,
        total_drop_bonus_percentage: user.total_drop_bonus_percentage,
        balance: user.balance,
        steam_id: user.steam_id,
        steam_username: user.steam_username,
        steam_avatar: user.steam_avatar_url,
        steam_profile_url: user.steam_profile_url,
        steam_trade_url: user.steam_trade_url,
        is_email_verified: user.is_email_verified,
        role: user.role,
      },
      achievements,
      inventory
    };

    // Добавляем предупреждение если email не подтвержден
    if (!user.is_email_verified) {
      response.emailVerificationRequired = true;
      response.message = 'Для доступа ко всем функциям необходимо подтвердить email адрес';
      logger.info('[LOGIN] Email not verified for user:', user.id);
    }

    logger.info('[LOGIN] Login successful, sending response for user:', {
      id: user.id,
      username: user.username,
      email: user.email,
      hasToken: !!token
    });
    return res.json(response);

  } catch (error) {
    logger.error('[LOGIN] Error during login:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  login
};
