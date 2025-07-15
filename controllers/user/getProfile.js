const db = require('../../models');
const { logger } = require('../../middleware/logger');
const cache = require('../../middleware/cache');

async function getProfile(req, res) {
  // Защита от IDOR: только если указан конкретный ID в параметрах
  const targetUserId = req.query.id || req.params.id;
  if (targetUserId && (!req.user || String(req.user.id) !== String(targetUserId))) {
    return res.status(403).json({ message: 'Доступ к чужому профилю запрещён' });
  }

  // Если ID не указан, возвращаем профиль текущего пользователя
  if (!req.user) {
    return res.status(401).json({ message: 'Пользователь не авторизован' });
  }

  try {
    const userId = req.user.id;

    const user = await db.User.findByPk(userId, {
      attributes: [
        'id', 'email', 'username', 'createdAt', 'updatedAt', 'role', 'is_email_verified',
        'level', 'xp', 'xp_to_next_level', 'level_bonus_percentage', 'total_xp_earned',
        'subscription_tier', 'subscription_purchase_date', 'subscription_expiry_date', 'subscription_days_left',
        'cases_available', 'cases_opened_today', 'total_cases_opened', 'next_case_available_time', 'max_daily_cases',
        'next_bonus_available_time', 'last_bonus_date', 'lifetime_bonuses_claimed', 'successful_bonus_claims',
        'drop_rate_modifier', 'achievements_bonus_percentage', 'subscription_bonus_percentage', 'total_drop_bonus_percentage',
        'balance',
        'steam_id', 'steam_profile', 'steam_avatar', 'steam_profile_url', 'steam_trade_url', 'auth_provider'
      ],
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

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    return res.json({
      success: true,
      user
    });

  } catch (error) {
    logger.error('Ошибка получения профиля:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}
// // Оборачиваем getProfile в middleware кэширования
// const cachedGetProfile = [cache(300), getProfile];

// module.exports = {
//   getProfile: cachedGetProfile
// };
// Убираем кэширование для getProfile, чтобы Steam данные обновлялись сразу
module.exports = {
  getProfile: getProfile
};
