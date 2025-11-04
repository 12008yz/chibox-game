const db = require('../../models');
const { logger } = require('../../utils/logger');

async function getLiveDrops(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 17;
    const offset = parseInt(req.query.offset) || 0;

    // Получаем последние падения с пользователями и предметами
    const liveDrops = await db.LiveDrop.findAll({
      where: {
        is_hidden: false
      },
      include: [
        {
          model: db.User,
          as: 'user',
          attributes: ['id', 'username', 'level', 'steam_avatar_url', 'avatar_url'],
          required: true
        },
        {
          model: db.Item,
          as: 'item',
          attributes: ['id', 'name', 'image_url', 'price', 'rarity'],
          required: true
        },
        {
          model: db.Case,
          as: 'case',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      order: [['drop_time', 'DESC']],
      limit: Math.min(limit, 50), // Максимум 50 записей за раз
      offset
    });

    // Форматируем данные для фронтенда
    const formattedDrops = liveDrops.map(drop => ({
      id: drop.id,
      user: {
        id: drop.user.id,
        username: drop.user.username,
        level: drop.user.level,
        // Приоритет: кастомный аватар > Steam аватар
        avatar: drop.user.avatar_url
          ? `${process.env.BASE_URL || 'http://localhost:3000'}/api${drop.user.avatar_url}`
          : drop.user.steam_avatar_url || null
      },
      item: {
        id: drop.item.id,
        name: drop.item.name,
        image: drop.item.image_url,
        price: parseFloat(drop.item.price || 0),
        rarity: drop.item.rarity
      },
      case: drop.case ? {
        id: drop.case.id,
        name: drop.case.name
      } : null,
      dropTime: drop.drop_time,
      isRare: drop.is_rare_item,
      isHighlighted: drop.is_highlighted,
      price: parseFloat(drop.item_price || 0)
    }));

    return res.json({
      success: true,
      data: {
        drops: formattedDrops,
        pagination: {
          limit,
          offset,
          hasMore: formattedDrops.length === limit
        }
      }
    });
  } catch (error) {
    logger.error('Ошибка получения живых падений:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

module.exports = {
  getLiveDrops
};
