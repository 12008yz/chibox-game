const { TicTacToeGame, User, CaseTemplate, UserInventory } = require('../../models');
const { Op } = require('sequelize');
const ticTacToeService = require('../../services/ticTacToeService');
const { logger } = require('../../utils/logger');
const { checkFreeGameAvailability, updateFreeGameCounters, MAX_FREE_TICTACTOE_ATTEMPTS } = require('../../utils/freeGameHelper');

// Лимиты попыток для разных уровней подписки
const TICTACTOE_LIMITS = {
  0: 0, // Без подписки - нельзя играть
  1: 3, // Тир 1 - 3 попытки
  2: 4, // Тир 2 - 4 попытки
  3: 5  // Тир 3 - 5 попыток
};

/**
 * Проверяет, нужно ли сбросить счетчик попыток крестиков-ноликов
 * @param {Date} lastResetDate - Дата последнего сброса
 * @returns {boolean} - true если нужен сброс
 */
function shouldResetTicTacToeCounter(lastResetDate) {
  if (!lastResetDate) {
    logger.info(`[TICTACTOE RESET DEBUG] No lastResetDate -> RESET NEEDED`);
    return true;
  }

  const now = new Date();
  const lastReset = new Date(lastResetDate);

  // Сегодняшний сброс в 16:00 МСК (в UTC это 13:00)
  const todayReset = new Date(now);
  todayReset.setUTCHours(13, 0, 0, 0); // 16:00 МСК = 13:00 UTC

  // Если сегодня ещё не наступило время сброса (до 16:00), то используем вчерашний сброс
  if (now < todayReset) {
    todayReset.setDate(todayReset.getDate() - 1);
  }

  logger.info(`[TICTACTOE RESET DEBUG] Times:`);
  logger.info(`[TICTACTOE RESET DEBUG] - Current UTC time: ${now.toISOString()}`);
  logger.info(`[TICTACTOE RESET DEBUG] - Target reset time: ${todayReset.toISOString()}`);
  logger.info(`[TICTACTOE RESET DEBUG] - Last reset: ${lastReset.toISOString()}`);

  // Нужен сброс, если последний сброс был ДО текущего планового времени сброса
  if (lastReset < todayReset) {
    logger.info(`[TICTACTOE RESET DEBUG] Last reset before target reset time -> RESET NEEDED`);
    return true;
  }

  logger.info(`[TICTACTOE RESET DEBUG] Last reset after target reset time -> NO RESET NEEDED`);
  return false;
}

/**
 * Получает максимальное количество попыток для уровня подписки
 */
function getTicTacToeLimit(subscriptionTier) {
  return TICTACTOE_LIMITS[subscriptionTier] || 0;
}

/**
 * Проверяет и сбрасывает попытки пользователя, если необходимо
 * @param {Object} user - Объект пользователя
 * @returns {Promise<Object>} - { hasActiveSubscription, resetTime }
 */
async function checkAndResetUserAttempts(user) {
  const now = new Date();

  // Проверяем наличие активной подписки
  const hasActiveSubscription = user.subscription_tier > 0 &&
    user.subscription_expiry_date &&
    new Date(user.subscription_expiry_date) > now;

  // Проверяем, нужно ли сбросить счетчик попыток
  const needsReset = shouldResetTicTacToeCounter(user.last_tictactoe_reset);

  if (needsReset) {
    const limit = hasActiveSubscription ? getTicTacToeLimit(user.subscription_tier) : 0;
    logger.info(`[TICTACTOE] Сброс попыток для пользователя ${user.username}, тир ${user.subscription_tier}, лимит ${limit}`);
    user.tictactoe_attempts_left = limit;

    // Устанавливаем last_tictactoe_reset на время последнего планового сброса (16:00 МСК = 13:00 UTC)
    const resetTime = new Date();
    resetTime.setUTCHours(13, 0, 0, 0);
    // Если текущее время до 16:00 МСК, используем вчерашний сброс
    if (now < resetTime) {
      resetTime.setDate(resetTime.getDate() - 1);
    }
    user.last_tictactoe_reset = resetTime;
    await user.save();
  } else if (!hasActiveSubscription && user.tictactoe_attempts_left > 0) {
    user.tictactoe_attempts_left = 0;
    await user.save();
  }

  return { hasActiveSubscription, now };
}

// Создание новой игры
const createGame = async (req, res) => {
  try {
    const userId = req.user.id;
    logger.info(`Начинаем создание игры для пользователя ${userId}`);

    // Получаем пользователя
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    // Проверяем и сбрасываем попытки пользователя, если необходимо
    const { hasActiveSubscription, now } = await checkAndResetUserAttempts(user);

    // Проверяем бесплатные попытки для новых пользователей
    const freeGameAvailability = checkFreeGameAvailability(user, 'tictactoe');
    const hasFreeAttempts = freeGameAvailability.canPlay;
    const hasRegularAttempts = user.tictactoe_attempts_left > 0;

    // Проверяем, выигрывал ли пользователь сегодня
    const nowLocal = new Date();
    const lastResetTime = new Date();
    lastResetTime.setUTCHours(13, 0, 0, 0); // 16:00 МСК = 13:00 UTC
    if (nowLocal < lastResetTime) {
      lastResetTime.setDate(lastResetTime.getDate() - 1);
    }

    const todayWin = await TicTacToeGame.findOne({
      where: {
        user_id: userId,
        result: 'win',
        reward_given: true,
        updated_at: {
          [Op.gte]: lastResetTime
        }
      }
    });

    if (todayWin) {
      return res.status(403).json({
        success: false,
        error: 'Вы уже победили сегодня! Ждём вас завтра'
      });
    }

    if (!hasActiveSubscription && !hasFreeAttempts) {
      return res.status(403).json({
        success: false,
        error: 'Приобретите статус для доступа к бонусу'
      });
    }

    // Проверяем, остались ли попытки (обычные или бесплатные)
    if (!hasRegularAttempts && !hasFreeAttempts) {
      // Вычисляем время следующего сброса
      const nextReset = new Date();
      nextReset.setUTCHours(13, 0, 0, 0); // 16:00 МСК = 13:00 UTC
      if (now >= nextReset) {
        nextReset.setDate(nextReset.getDate() + 1);
      }

      return res.status(400).json({
        success: false,
        error: hasActiveSubscription 
          ? 'У вас закончились попытки. Следующая попытка будет доступна в 16:00 МСК'
          : 'Приобретите статус для продолжения игры',
        next_time: nextReset.toISOString()
      });
    }

    // Проверяем, есть ли у пользователя незавершенная игра
    const existingGame = await TicTacToeGame.findOne({
      where: {
        user_id: userId,
        result: 'ongoing'
      }
    });

    logger.info(`Существующая игра: ${existingGame ? 'найдена' : 'не найдена'}`);

    if (existingGame) {
      logger.info(`Возвращаем существующую игру`);
      return res.json({
        success: true,
        game: existingGame,
        attempts_left: hasActiveSubscription ? user.tictactoe_attempts_left : 0,
        message: 'У вас есть незавершенная игра'
      });
    }

    // Создаем новую игру
    logger.info(`Создаем состояние новой игры`);
    const gameState = ticTacToeService.createNewGame();
    logger.info(`Состояние игры создано:`, gameState);

    // Если бот ходит первым, делаем его ход
    if (gameState.botGoesFirst) {
      logger.info(`Бот ходит первым, делаем его ход`);
      const updatedGameState = ticTacToeService.makeBotFirstMove(gameState);
      gameState.board = updatedGameState.board;
      gameState.currentPlayer = updatedGameState.currentPlayer;
      logger.info(`Ход бота сделан, новое состояние:`, gameState);
    }

    logger.info(`Сохраняем новую игру в базу данных`);
    const newGame = await TicTacToeGame.create({
      user_id: userId,
      game_state: gameState,
      attempts_left: hasActiveSubscription ? user.tictactoe_attempts_left : 0, // Сохраняем текущее количество попыток
      bot_goes_first: gameState.botGoesFirst
    });

    logger.info(`Создана новая игра крестики-нолики для пользователя ${userId}, ID игры: ${newGame.id}`);

    logger.info(`Отправляем ответ клиенту`);
    res.json({
      success: true,
      game: newGame,
      attempts_left: hasActiveSubscription ? user.tictactoe_attempts_left : 0
    });

  } catch (error) {
    logger.error('Ошибка при создании игры крестики-нолики:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
};

// Получение текущей игры
const getCurrentGame = async (req, res) => {
  try {
    const userId = req.user.id;

    // Получаем пользователя
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    // Проверяем и сбрасываем попытки пользователя, если необходимо
    const { hasActiveSubscription, now } = await checkAndResetUserAttempts(user);

    // Ищем только активную игру
    const game = await TicTacToeGame.findOne({
      where: {
        user_id: userId,
        result: 'ongoing'
      },
      order: [['created_at', 'DESC']]
    });

    // Проверяем, выиграл ли пользователь сегодня
    const lastResetTime = new Date();
    lastResetTime.setUTCHours(13, 0, 0, 0); // 16:00 МСК = 13:00 UTC
    if (now < lastResetTime) {
      lastResetTime.setDate(lastResetTime.getDate() - 1);
    }

    const todayWin = await TicTacToeGame.findOne({
      where: {
        user_id: userId,
        result: 'win',
        reward_given: true,
        updated_at: {
          [Op.gte]: lastResetTime
        }
      },
      order: [['updated_at', 'DESC']]
    });

    const hasWonToday = !!todayWin;

    // Проверяем доступность бесплатных попыток
    const freeGameAvailability = checkFreeGameAvailability(user, 'tictactoe');
    const freeAttemptsRemaining = freeGameAvailability.canPlay ?
      (MAX_FREE_TICTACTOE_ATTEMPTS - (user.free_tictactoe_claim_count || 0)) : 0;

    const canPlay = (hasActiveSubscription && user.tictactoe_attempts_left > 0) || freeGameAvailability.canPlay;

    res.json({
      success: true,
      game,
      canPlay,
      attempts_left: hasActiveSubscription ? user.tictactoe_attempts_left : 0,
      free_attempts_remaining: freeAttemptsRemaining,
      free_attempts_info: {
        can_use: freeGameAvailability.canPlay,
        reason: freeGameAvailability.reason,
        next_available: freeGameAvailability.nextAvailableTime,
        claim_count: user.free_tictactoe_claim_count || 0,
        first_claim_date: user.free_tictactoe_first_claim_date,
        last_claim_date: user.free_tictactoe_last_claim_date
      },
      has_subscription: hasActiveSubscription,
      has_won_today: hasWonToday
    });

  } catch (error) {
    logger.error('Ошибка при получении текущей игры:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
};

// Совершение хода
const makeMove = async (req, res) => {
  try {
    const userId = req.user.id;
    const { position } = req.body;

    if (position < 0 || position > 8) {
      return res.status(400).json({
        success: false,
        error: 'Неверная позиция'
      });
    }

    // Найдем текущую игру
    const game = await TicTacToeGame.findOne({
      where: {
        user_id: userId,
        result: 'ongoing'
      }
    });

    if (!game) {
      return res.status(400).json({
        success: false,
        error: 'Активная игра не найдена'
      });
    }

    // Получаем пользователя
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    // Проверяем подписку
    const now = new Date();
    const hasActiveSubscription = user.subscription_tier > 0 &&
      user.subscription_expiry_date &&
      new Date(user.subscription_expiry_date) > now;
      
    // Проверяем бесплатные попытки
    const freeGameAvailability = checkFreeGameAvailability(user, 'tictactoe');
    const hasFreeAttempts = freeGameAvailability.canPlay;

    if (!hasActiveSubscription && !hasFreeAttempts) {
      return res.status(403).json({
        success: false,
        error: 'Приобретите статус для продолжения игры'
      });
    }

    // Проверяем количество попыток
    if (hasActiveSubscription && user.tictactoe_attempts_left <= 0 && !hasFreeAttempts) {
      return res.status(403).json({
        success: false,
        error: 'Закончились попытки'
      });
    }

    // Делаем ход
    const newGameState = ticTacToeService.makePlayerMove(game.game_state, position);

    // Обновляем состояние игры
    let result = 'ongoing';
    let rewardGiven = false;

    if (newGameState.status === 'finished') {
      // Проверяем доступность бесплатных попыток
      const freeGameAvailability = checkFreeGameAvailability(user, 'tictactoe');
      const hasFreeAttempts = freeGameAvailability.canPlay;

        if (newGameState.winner === 'player') {
        result = 'win';
        logger.info(`Игрок ${userId} выиграл! Пытаемся выдать бонусный кейс...`);
        // Выдаем бонусный кейс ДО списания попытки
        rewardGiven = await giveReward(userId);
        logger.info(`Результат выдачи бонусного кейса: ${rewardGiven}`);
        // Уменьшаем количество попыток (сначала бесплатные, потом обычные)
        if (hasFreeAttempts) {
          await updateFreeGameCounters(user, 'tictactoe');
          await user.reload(); // Перезагружаем пользователя для актуальных данных
          logger.info(`TicTacToe - использована бесплатная попытка. Осталось: ${MAX_FREE_TICTACTOE_ATTEMPTS - user.free_tictactoe_claim_count}`);
        } else if (hasActiveSubscription) {
          user.tictactoe_attempts_left = Math.max(0, user.tictactoe_attempts_left - 1);
          await user.save();
        }
      } else if (newGameState.winner === 'bot') {
        result = 'lose';
        logger.info(`Игрок ${userId} проиграл. Уменьшаем попытки.`);
        // Уменьшаем количество попыток (сначала бесплатные, потом обычные)
        if (hasFreeAttempts) {
          await updateFreeGameCounters(user, 'tictactoe');
          await user.reload(); // Перезагружаем пользователя для актуальных данных
          logger.info(`TicTacToe - использована бесплатная попытка. Осталось: ${MAX_FREE_TICTACTOE_ATTEMPTS - user.free_tictactoe_claim_count}`);
        } else if (hasActiveSubscription) {
          user.tictactoe_attempts_left = Math.max(0, user.tictactoe_attempts_left - 1);
          await user.save();
        }
      } else {
        result = 'draw';
        logger.info(`Ничья для игрока ${userId}. Уменьшаем попытки.`);
        // При ничьей тоже уменьшаем попытки
        if (hasFreeAttempts) {
          await updateFreeGameCounters(user, 'tictactoe');
          await user.reload(); // Перезагружаем пользователя для актуальных данных
          logger.info(`TicTacToe - использована бесплатная попытка. Осталось: ${MAX_FREE_TICTACTOE_ATTEMPTS - user.free_tictactoe_claim_count}`);
        } else if (hasActiveSubscription) {
          user.tictactoe_attempts_left = Math.max(0, user.tictactoe_attempts_left - 1);
          await user.save();
        }
      }
    }

    // Сохраняем изменения в игре
    await game.update({
      game_state: newGameState,
      result,
      reward_given: rewardGiven,
      attempts_left: hasActiveSubscription ? user.tictactoe_attempts_left : 0 // Обновляем на актуальное значение
    });

    if (result !== 'ongoing') {
      try {
        const { updateUserAchievementProgress } = require('../../services/achievementService');
        await updateUserAchievementProgress(userId, 'slot_plays', 1);
      } catch (achErr) {
        logger.error('Ошибка достижения slot_plays (TicTacToe):', achErr);
      }
    }

    let message = '';
    if (result === 'win') {
      message = rewardGiven ? 'Поздравляем! Вы выиграли и получили бонусный кейс!' : 'Вы выиграли, но приз можно получить только один раз в день.';
    } else if (result === 'lose') {
      message = `Вы проиграли. Осталось попыток: ${hasActiveSubscription ? user.tictactoe_attempts_left : 0}`;
    } else if (result === 'draw') {
      message = `Ничья! Осталось попыток: ${hasActiveSubscription ? user.tictactoe_attempts_left : 0}`;
    }

    res.json({
      success: true,
      game: {
        ...game.toJSON(),
        game_state: newGameState,
        result,
        reward_given: rewardGiven
      },
      attempts_left: hasActiveSubscription ? user.tictactoe_attempts_left : 0,
      message
    });

  } catch (error) {
    logger.error('Ошибка при совершении хода:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Внутренняя ошибка сервера'
    });
  }
};

// Функция для выдачи награды (бонусного кейса)
const giveReward = async (userId) => {
  try {
    logger.info(`🎯 [REWARD] Начинаем выдачу награды для пользователя ${userId}`);

    // Проверяем, не получал ли пользователь уже бонусный кейс сегодня
    // Используем время сброса (16:00 МСК = 13:00 UTC)
    const now = new Date();
    const lastResetTime = new Date();
    lastResetTime.setUTCHours(13, 0, 0, 0); // 16:00 МСК = 13:00 UTC

    // Если текущее время до 16:00 МСК, используем вчерашний сброс
    if (now < lastResetTime) {
      lastResetTime.setDate(lastResetTime.getDate() - 1);
    }

    logger.info(`🎯 [REWARD] Проверяем период с ${lastResetTime.toISOString()} до сейчас`);

    const existingReward = await TicTacToeGame.findOne({
      where: {
        user_id: userId,
        result: 'win',
        reward_given: true,
        updated_at: {
          [Op.gte]: lastResetTime
        }
      },
      order: [['updated_at', 'DESC']]
    });

    if (existingReward) {
      logger.info(`🎯 [REWARD] ❌ Награда уже получена сегодня: ${existingReward.updated_at}`);
      return false; // Награда уже получена сегодня
    }

    // Найдем бонусный кейс
    logger.info(`🎯 [REWARD] Ищем шаблон "Бонусный кейс" в базе данных...`);
    const bonusCaseTemplate = await CaseTemplate.findOne({
      where: {
        name: 'Бонусный кейс',
        is_active: true
      }
    });

    logger.info(`🎯 [REWARD] Бонусный кейс шаблон: ${bonusCaseTemplate ? 'найден' : 'не найден'}`);
    if (bonusCaseTemplate) {
      logger.info(`🎯 [REWARD] Детали шаблона:`, {
        id: bonusCaseTemplate.id,
        name: bonusCaseTemplate.name,
        is_active: bonusCaseTemplate.is_active
      });
    }

    if (!bonusCaseTemplate) {
      logger.error('🎯 [REWARD] ❌ Бонусный кейс не найден в базе данных');
      return false;
    }

    // Создаем кейс для пользователя в инвентаре
    logger.info(`🎯 [REWARD] Создаем новый кейс для пользователя ${userId}...`);
    const newCase = await UserInventory.create({
      user_id: userId,
      item_id: null, // Для кейсов item_id не используется
      item_type: 'case',
      case_template_id: bonusCaseTemplate.id,
      source: 'bonus',
      status: 'inventory',
      acquisition_date: new Date(),
      expires_at: bonusCaseTemplate.availability_end || null
    });

    logger.info(`🎯 [REWARD] ✅ Выдан бонусный кейс пользователю ${userId} за победу в крестики-нолики. ID кейса: ${newCase.id}`);
    logger.info(`🎯 [REWARD] Детали созданного кейса:`, {
      id: newCase.id,
      user_id: newCase.user_id,
      case_template_id: newCase.case_template_id,
      status: newCase.status,
      created_at: newCase.created_at
    });

    return true;

  } catch (error) {
    logger.error('🎯 [REWARD] ❌ Ошибка при выдаче награды:', error);
    logger.error('🎯 [REWARD] Stack trace:', error.stack);
    return false;
  }
};

module.exports = {
  createGame,
  getCurrentGame,
  makeMove
};
