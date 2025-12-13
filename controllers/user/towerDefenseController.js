const { TowerDefenseGame, User, Transaction, UserInventory, Item } = require('../../models');
const { Op } = require('sequelize');
const { logger } = require('../../utils/logger');
const sequelize = require('../../config/database');
const { selectRewardItem } = require('../../services/towerDefenseRewardService');

// Лимиты попыток для разных уровней подписки
const TOWER_DEFENSE_LIMITS = {
  0: 1,  // Без подписки - 1 попытка
  1: 3,  // Тир 1 - 3 попытки
  2: 5,  // Тир 2 - 5 попыток
  3: 10  // Тир 3 - 10 попыток
};

// Награды за прохождение
const REWARDS = {
  BASE_REWARD: 50,           // Базовая награда за победу
  PER_WAVE_BONUS: 10,        // Бонус за каждую пройденную волну
  PERFECT_WIN_BONUS: 100,    // Бонус за идеальную победу (все волны)
  PER_ENEMY_BONUS: 2         // Бонус за каждого убитого врага
};

/**
 * Проверяет, нужно ли сбросить счетчик попыток tower defense
 */
function shouldResetTowerDefenseCounter(lastResetDate) {
  if (!lastResetDate) {
    return true;
  }

  const now = new Date();
  const lastReset = new Date(lastResetDate);

  // Сброс в 16:00 МСК (13:00 UTC)
  const todayReset = new Date(now);
  todayReset.setUTCHours(13, 0, 0, 0);

  if (now < todayReset) {
    todayReset.setDate(todayReset.getDate() - 1);
  }

  return lastReset < todayReset;
}

/**
 * Получает максимальное количество попыток для уровня подписки
 */
function getTowerDefenseLimit(subscriptionTier) {
  return TOWER_DEFENSE_LIMITS[subscriptionTier] || TOWER_DEFENSE_LIMITS[0];
}

/**
 * Проверяет и сбрасывает попытки пользователя
 */
async function checkAndResetUserAttempts(user) {
  const now = new Date();

  const hasActiveSubscription = user.subscription_tier > 0 &&
    user.subscription_expiry_date &&
    new Date(user.subscription_expiry_date) > now;

  const needsReset = shouldResetTowerDefenseCounter(user.last_tower_defense_reset);

  if (needsReset) {
    const limit = getTowerDefenseLimit(user.subscription_tier);
    logger.info(`[TOWER_DEFENSE] Сброс попыток для пользователя ${user.username}, тир ${user.subscription_tier}, лимит ${limit}`);

    user.tower_defense_attempts_left = limit;

    const resetTime = new Date();
    resetTime.setUTCHours(13, 0, 0, 0);
    if (now < resetTime) {
      resetTime.setDate(resetTime.getDate() - 1);
    }
    user.last_tower_defense_reset = resetTime;
    await user.save();
  }

  return { hasActiveSubscription, now };
}

/**
 * Вычисляет награду за игру
 */
function calculateReward(wavesCompleted, totalWaves, enemiesKilled, result) {
  if (result !== 'win') {
    return 0;
  }

  let reward = REWARDS.BASE_REWARD;
  reward += wavesCompleted * REWARDS.PER_WAVE_BONUS;
  reward += enemiesKilled * REWARDS.PER_ENEMY_BONUS;

  // Бонус за идеальную победу
  if (wavesCompleted === totalWaves) {
    reward += REWARDS.PERFECT_WIN_BONUS;
  }

  return Math.floor(reward);
}

/**
 * Получить текущий статус tower defense для пользователя
 */
const getStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    await checkAndResetUserAttempts(user);

    // Получаем текущую незавершенную игру
    const currentGame = await TowerDefenseGame.findOne({
      where: {
        user_id: userId,
        result: 'in_progress'
      },
      order: [['created_at', 'DESC']]
    });

    const limit = getTowerDefenseLimit(user.subscription_tier);

    res.json({
      canPlay: true, // Бесконечные попытки
      attemptsLeft: 999999, // Показываем большое число для UI
      maxAttempts: limit,
      currentGame: currentGame,
      hasSubscription: user.subscription_tier > 0,
      subscriptionTier: user.subscription_tier
    });

  } catch (error) {
    logger.error('[TOWER_DEFENSE] Ошибка получения статуса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

/**
 * Создать новую игру tower defense
 */
const createGame = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user.id;
    const { inventoryItemId } = req.body; // ID предмета из инвентаря для ставки

    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Убрана проверка попыток - бесконечные попытки
    // await checkAndResetUserAttempts(user);
    // if (user.tower_defense_attempts_left <= 0) { ... }

    // Проверяем, нет ли уже активной игры
    const existingGame = await TowerDefenseGame.findOne({
      where: {
        user_id: userId,
        result: 'in_progress'
      },
      transaction
    });

    if (existingGame) {
      await transaction.rollback();
      return res.json({
        game: existingGame,
        message: 'У вас уже есть активная игра'
      });
    }

    let betItem = null;
    let betInventoryItem = null;
    let rewardItem = null;

    // Если указан предмет для ставки, проверяем его
    if (inventoryItemId) {
      betInventoryItem = await UserInventory.findOne({
        where: {
          id: inventoryItemId,
          user_id: userId,
          status: 'inventory',
          item_type: 'item'
        },
        include: [{
          model: Item,
          as: 'item'
        }],
        transaction
      });

      if (!betInventoryItem || !betInventoryItem.item) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Предмет для ставки не найден в вашем инвентаре' });
      }

      betItem = betInventoryItem.item;

      // Выбираем предмет-награду
      rewardItem = await selectRewardItem(betItem.price);
      if (!rewardItem) {
        await transaction.rollback();
        return res.status(500).json({ error: 'Не удалось подобрать предмет-награду. Попробуйте позже.' });
      }

      // Удаляем предмет ставки из инвентаря
      betInventoryItem.status = 'used';
      betInventoryItem.transaction_date = new Date();
      await betInventoryItem.save({ transaction });

      logger.info(`[TOWER_DEFENSE] Пользователь ${user.username} поставил предмет ${betItem.name} (${betItem.price}) на кон`);
    }

    // Создаем новую игру
    const game = await TowerDefenseGame.create({
      user_id: userId,
      total_waves: 10,
      waves_completed: 0,
      enemies_killed: 0,
      towers_built: 0,
      score: 0,
      result: 'in_progress',
      bet_item_id: betItem ? betItem.id : null,
      bet_inventory_id: betInventoryItem ? betInventoryItem.id : null,
      reward_item_id: rewardItem ? rewardItem.id : null
    }, { transaction });

    // Убрано уменьшение попыток - бесконечные попытки
    // user.tower_defense_attempts_left -= 1;
    // await user.save({ transaction });

    await transaction.commit();

    logger.info(`[TOWER_DEFENSE] Игра создана для пользователя ${user.username} (бесконечные попытки)`);

    res.json({
      game: game,
      betItem: betItem ? {
        id: betItem.id,
        name: betItem.name,
        price: betItem.price,
        image_url: betItem.image_url
      } : null,
      rewardItem: rewardItem ? {
        id: rewardItem.id,
        name: rewardItem.name,
        price: rewardItem.price,
        image_url: rewardItem.image_url
      } : null,
      attemptsLeft: 999999, // Бесконечные попытки
      message: 'Игра создана успешно'
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('[TOWER_DEFENSE] Ошибка создания игры:', error);
    res.status(500).json({ error: 'Ошибка создания игры' });
  }
};

/**
 * Завершить игру и выдать награду
 */
const completeGame = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user.id;
    const { gameId, wavesCompleted, enemiesKilled, towersBuilt, result } = req.body;

    // Валидация
    if (!gameId || result === undefined) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Недостаточно данных' });
    }

    if (!['win', 'lose'].includes(result)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Неверный результат игры' });
    }

    const game = await TowerDefenseGame.findOne({
      where: {
        id: gameId,
        user_id: userId,
        result: 'in_progress'
      },
      transaction
    });

    if (!game) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Игра не найдена или уже завершена' });
    }

    const user = await User.findByPk(userId, { transaction });

    // Обновляем данные игры
    game.waves_completed = wavesCompleted || 0;
    game.enemies_killed = enemiesKilled || 0;
    game.towers_built = towersBuilt || 0;
    game.result = result;
    game.completed_at = new Date();

    // Вычисляем награду
    const rewardAmount = calculateReward(
      game.waves_completed,
      game.total_waves,
      game.enemies_killed,
      result
    );

    game.reward_amount = rewardAmount;
    game.score = (game.waves_completed * 100) + (game.enemies_killed * 10);

    await game.save({ transaction });

    // Выдаем награду, если победа
    let rewardItemData = null;
    if (result === 'win') {
      // Если была ставка предметом, выдаем предмет-награду
      if (game.reward_item_id) {
        const rewardItem = await Item.findByPk(game.reward_item_id, { transaction });
        if (rewardItem) {
          // Добавляем предмет-награду в инвентарь
          const rewardInventoryItem = await UserInventory.create({
            user_id: userId,
            item_id: rewardItem.id,
            item_type: 'item',
            source: 'tower_defense',
            status: 'inventory',
            acquisition_date: new Date()
          }, { transaction });

          rewardItemData = {
            id: rewardItem.id,
            name: rewardItem.name,
            price: rewardItem.price,
            image_url: rewardItem.image_url
          };

          logger.info(`[TOWER_DEFENSE] Пользователь ${user.username} получил предмет-награду ${rewardItem.name} (${rewardItem.price}) за победу`);
        }
      }

      // Также выдаем денежную награду, если она есть
      if (rewardAmount > 0) {
        user.balance = parseFloat(user.balance || 0) + rewardAmount;
        await user.save({ transaction });

        // Создаем транзакцию
        await Transaction.create({
          user_id: userId,
          type: 'bonus',
          amount: rewardAmount,
          description: `Награда за Tower Defense (волны: ${game.waves_completed}/${game.total_waves})`,
          status: 'completed'
        }, { transaction });

        logger.info(`[TOWER_DEFENSE] Пользователь ${user.username} получил денежную награду ${rewardAmount} за победу`);
      }
    } else {
      // При поражении предмет ставки теряется (уже удален при создании игры)
      logger.info(`[TOWER_DEFENSE] Пользователь ${user.username} проиграл, предмет ставки потерян`);
    }

    await transaction.commit();

    res.json({
      game: game,
      reward: rewardAmount,
      rewardItem: rewardItemData,
      newBalance: user.balance,
      message: result === 'win' 
        ? (rewardItemData ? 'Победа! Предмет-награда получен!' : 'Победа! Награда получена!')
        : 'Поражение. Предмет ставки потерян.'
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('[TOWER_DEFENSE] Ошибка завершения игры:', error);
    res.status(500).json({ error: 'Ошибка завершения игры' });
  }
};

/**
 * Получить статистику по играм tower defense
 */
const getStatistics = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await TowerDefenseGame.findAll({
      where: { user_id: userId },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_games'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN result = 'win' THEN 1 ELSE 0 END")), 'wins'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN result = 'lose' THEN 1 ELSE 0 END")), 'losses'],
        [sequelize.fn('SUM', sequelize.col('reward_amount')), 'total_rewards'],
        [sequelize.fn('MAX', sequelize.col('waves_completed')), 'best_waves'],
        [sequelize.fn('SUM', sequelize.col('enemies_killed')), 'total_enemies_killed']
      ],
      raw: true
    });

    res.json({
      statistics: stats[0] || {
        total_games: 0,
        wins: 0,
        losses: 0,
        total_rewards: 0,
        best_waves: 0,
        total_enemies_killed: 0
      }
    });

  } catch (error) {
    logger.error('[TOWER_DEFENSE] Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
};

module.exports = {
  getStatus,
  createGame,
  completeGame,
  getStatistics
};
