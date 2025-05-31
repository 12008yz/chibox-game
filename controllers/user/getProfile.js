const db = require('../../models');
const { logger } = require('../../middleware/logger');
const cache = require('../../middleware/cache');

async function getProfile(req, res) {
  // Защита от IDOR: пользователь запрашивает только свой профиль
  if (!req.user || String(req.user.id) !== String(req.query.id || req.params.id)) {
    return res.status(403).json({ message: 'Доступ к чужому профилю запрещён' });
  }

  try {
    const userId = req.user.id;

    const user = await db.User.findByPk(userId, {
      attributes: [
        'id', 'email', 'username', 'createdAt', 'updatedAt', 'role', 'is_email_verified',
        'level', 'xp', 'xp_to_next_level', 'level_bonus_percentage', 'total_xp_earned',
        'subscription_tier', 'subscription_purchase_date', 'subscription_expiry_date', 'subscription_days_left',
        'cases_available', 'cases_opened_today', 'next_case_available_time', 'max_daily_cases',
        'next_bonus_available_time', 'last_bonus_date', 'lifetime_bonuses_claimed', 'successful_bonus_claims',
        'drop_rate_modifier', 'achievements_bonus_percentage', 'subscription_bonus_percentage', 'total_drop_bonus_percentage',
        'balance',
        'steam_id', 'steam_username', 'steam_avatar', 'steam_profile_url', 'steam_trade_url'
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

// Оборачиваем getProfile в middleware кэширования
const cachedGetProfile = [cache(300), getProfile];

module.exports = {
  getProfile: cachedGetProfile
};
