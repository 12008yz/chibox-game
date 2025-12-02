const db = require('../../models');
const winston = require('winston');
const { Op } = require('sequelize');

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

// Функция для получения случайных пользователей при одинаковых очках
function randomizeEqualScores(users, limit = 10) {
  if (users.length <= limit) return users;

  // Группируем пользователей по очкам
  const scoreGroups = {};
  users.forEach(user => {
    const score = user.score || user.level || user.cases_opened || user.max_item_value || 0;
    if (!scoreGroups[score]) scoreGroups[score] = [];
    scoreGroups[score].push(user);
  });

  const result = [];
  const sortedScores = Object.keys(scoreGroups).sort((a, b) => parseFloat(b) - parseFloat(a));

  for (const score of sortedScores) {
    const group = scoreGroups[score];
    if (result.length + group.length <= limit) {
      result.push(...group);
    } else {
      // Если группа не помещается полностью, выбираем случайно
      const remaining = limit - result.length;
      const shuffled = group.sort(() => Math.random() - 0.5);
      result.push(...shuffled.slice(0, remaining));
      break;
    }
  }

  return result;
}

async function getLeaderboard(req, res) {
  try {
    const type = req.query.type || 'level';
    const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Максимум 50, по умолчанию 10

    let leaderboardData = [];

    switch (type) {
      case 'level':
        await getLeaderboardByLevel(limit, leaderboardData);
        break;
      case 'cases_opened':
        await getLeaderboardByCasesOpened(limit, leaderboardData);
        break;
      case 'most_expensive_item':
        await getLeaderboardByMostExpensiveItem(limit, leaderboardData);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Неверный тип leaderboard. Доступные типы: level, cases_opened, most_expensive_item'
        });
    }

    // Рандомизируем при одинаковых результатах и ограничиваем до нужного количества
    const finalData = randomizeEqualScores(leaderboardData, limit);

    // Присваиваем ранги
    finalData.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return res.json({
      success: true,
      data: {
        type,
        leaderboard: finalData,
        totalItems: finalData.length,
        limit
      }
    });
  } catch (error) {
    logger.error('Ошибка получения лидерборда:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

// Таблица лидеров по уровню
async function getLeaderboardByLevel(limit, leaderboardData) {
  const users = await db.User.findAll({
    attributes: [
      'id',
      'username',
      'level',
      'total_xp_earned',
      'subscription_tier',
      'subscription_days_left',
      'avatar_url',
      'steam_avatar_url',
      'steam_profile',
      'created_at'
    ],
    where: {
      is_active: true,
      is_banned: false
    },
    order: [
      ['level', 'DESC'],
      ['total_xp_earned', 'DESC'],
      [db.Sequelize.fn('RANDOM')] // Рандомизация при одинаковых уровнях
    ],
    limit: limit * 2 // Берём больше для рандомизации
  });

  leaderboardData.push(...users.map(user => ({
    user_id: user.id,
    username: user.username,
    level: user.level,
    total_xp_earned: user.total_xp_earned,
    subscription_tier: user.subscription_tier,
    subscription_days_left: user.subscription_days_left,
    avatar_url: user.avatar_url ? `${process.env.BASE_URL || 'https://chibox-game.ru'}${user.avatar_url}` : null,
    steam_avatar: user.steam_avatar_url,
    steam_profile: user.steam_profile,
    score: user.level, // Для сортировки
    created_at: user.created_at
  })));
}

// Таблица лидеров по открытым кейсам
async function getLeaderboardByCasesOpened(limit, leaderboardData) {
  const usersWithCases = await db.User.findAll({
    attributes: [
      'id',
      'username',
      'level',
      'subscription_tier',
      'subscription_days_left',
      'avatar_url',
      'steam_avatar_url',
      'steam_profile',
      [
        db.Sequelize.literal(`(
          SELECT COUNT(*)
          FROM cases
          WHERE cases.user_id = "User".id
          AND cases.is_opened = true
        )`),
        'cases_opened'
      ]
    ],
    where: {
      is_active: true,
      is_banned: false
    },
    order: [
      [db.Sequelize.literal('cases_opened'), 'DESC'],
      [db.Sequelize.fn('RANDOM')] // Рандомизация при одинаковом количестве кейсов
    ],
    limit: limit * 2,
    subQuery: false
  });

  leaderboardData.push(...usersWithCases.map(user => ({
    user_id: user.id,
    username: user.username,
    level: user.level,
    subscription_tier: user.subscription_tier,
    subscription_days_left: user.subscription_days_left,
    avatar_url: user.avatar_url ? `${process.env.BASE_URL || 'https://chibox-game.ru'}${user.avatar_url}` : null,
    steam_avatar: user.steam_avatar_url,
    steam_profile: user.steam_profile,
    cases_opened: parseInt(user.dataValues.cases_opened) || 0,
    score: parseInt(user.dataValues.cases_opened) || 0, // Для сортировки
  })));
}

// Таблица лидеров по самому дорогому предмету
async function getLeaderboardByMostExpensiveItem(limit, leaderboardData) {
  const usersWithItems = await db.User.findAll({
    attributes: [
      'id',
      'username',
      'level',
      'subscription_tier',
      'subscription_days_left',
      'avatar_url',
      'steam_avatar_url',
      'steam_profile',
      'best_item_value',
      [
        db.Sequelize.literal(`(
          SELECT items.name
          FROM user_inventory
          JOIN items ON user_inventory.item_id = items.id
          WHERE user_inventory.user_id = "User".id
          ORDER BY items.price DESC
          LIMIT 1
        )`),
        'most_expensive_item_name'
      ]
    ],
    where: {
      is_active: true,
      is_banned: false,
      best_item_value: {
        [Op.gt]: 0
      }
    },
    order: [
      ['best_item_value', 'DESC'],
      [db.Sequelize.fn('RANDOM')] // Рандомизация при одинаковой стоимости
    ],
    limit: limit * 2,
    subQuery: false
  });

  leaderboardData.push(...usersWithItems.map(user => ({
    user_id: user.id,
    username: user.username,
    level: user.level,
    subscription_tier: user.subscription_tier,
    subscription_days_left: user.subscription_days_left,
    avatar_url: user.avatar_url ? `${process.env.BASE_URL || 'https://chibox-game.ru'}${user.avatar_url}` : null,
    steam_avatar: user.steam_avatar_url,
    steam_profile: user.steam_profile,
    max_item_value: parseFloat(user.best_item_value) || 0,
    most_expensive_item_name: user.dataValues.most_expensive_item_name || null,
    score: parseFloat(user.best_item_value) || 0, // Для сортировки
  })));

  // Если недостаточно пользователей с предметами, добавляем пользователей с нулевой стоимостью
  if (leaderboardData.length < limit) {
    const usersWithoutItems = await db.User.findAll({
      attributes: ['id', 'username', 'level', 'subscription_tier', 'subscription_days_left', 'avatar_url', 'steam_avatar_url', 'steam_profile'],
      where: {
        is_active: true,
        is_banned: false,
        id: {
          [Op.notIn]: leaderboardData.map(u => u.user_id)
        }
      },
      order: [db.Sequelize.fn('RANDOM')],
      limit: limit - leaderboardData.length
    });

    leaderboardData.push(...usersWithoutItems.map(user => ({
      user_id: user.id,
      username: user.username,
      level: user.level,
      subscription_tier: user.subscription_tier,
      subscription_days_left: user.subscription_days_left,
      avatar_url: user.avatar_url ? `${process.env.BASE_URL || 'https://chibox-game.ru'}${user.avatar_url}` : null,
      steam_avatar: user.steam_avatar_url,
      steam_profile: user.steam_profile,
      max_item_value: 0,
      most_expensive_item_name: null,
      score: 0,
    })));
  }
}

module.exports = {
  getLeaderboard
};
