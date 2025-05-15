const argon2 = require('argon2');
const db = require('../../models');
const jwt = require('jsonwebtoken');
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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set.');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Для примера в RAM — реальную реализацию храните, напр. в Redis
const failedLogin = {};

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email и пароль обязательны' });
    }

    const key = email.trim().toLowerCase();

    // Если есть блокировка — замедление или блок
    if (failedLogin[key] && failedLogin[key].blockUntil && Date.now() < failedLogin[key].blockUntil) {
      return res.status(429).json({ message: 'Попробуйте позже (блокировка из-за неудачных попыток)' });
    }

    const user = await db.User.findOne({ where: { email: key } });
    if (!user) {
      failedLogin[key] = failedLogin[key] || { count: 0 };
      failedLogin[key].count++;
      if (failedLogin[key].count >= 5) {
        failedLogin[key].blockUntil = Date.now() + 10 * 60 * 1000; // 10 минут блокировка
      }
      return res.status(401).json({ message: 'Неверный email или пароль.' });
    }

    const passwordMatch = await argon2.verify(user.password, password);
    if (!passwordMatch) {
      failedLogin[key] = failedLogin[key] || { count: 0 };
      failedLogin[key].count++;
      if (failedLogin[key].count >= 5) {
        failedLogin[key].blockUntil = Date.now() + 10 * 60 * 1000;
      }
      return res.status(401).json({ message: 'Неверный email или пароль.' });
    }

    // Очистка после удачного входа
    if (failedLogin[key]) delete failedLogin[key];

    const achievements = await db.UserAchievement.findAll({
      where: { user_id: user.id },
      include: [{ model: db.Achievement, as: 'achievement' }]
    });

    const inventory = await db.UserInventory.findAll({
      where: { user_id: user.id },
      include: [{ model: db.Item, as: 'item' }]
    });

    const token = generateToken(user);

    return res.json({
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
        steam_avatar: user.steam_avatar,
        steam_profile_url: user.steam_profile_url,
        steam_trade_url: user.steam_trade_url,
        is_email_verified: user.is_email_verified,
        role: user.role,
      },
      achievements,
      inventory
    });

  } catch (error) {
    logger.error('Ошибка при входе:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  login
};
