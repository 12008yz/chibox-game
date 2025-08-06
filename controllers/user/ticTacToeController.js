const { TicTacToeGame, User, CaseTemplate, UserInventory } = require('../../models');
const { Op } = require('sequelize');
const ticTacToeService = require('../../services/ticTacToeService');
const { logger } = require('../../utils/logger');

// Создание новой игры
const createGame = async (req, res) => {
  try {
    const userId = req.user.id;
    logger.info(`Начинаем создание игры для пользователя ${userId}`);

    // Проверяем, есть ли у пользователя незавершенная игра
    const existingGame = await TicTacToeGame.findOne({
      where: {
        user_id: userId,
        result: 'ongoing'
      }
    });

    logger.info(`Существующая игра: ${existingGame ? 'найдена' : 'не найдена'}`);

    if (existingGame && existingGame.attempts_left > 0) {
      logger.info(`Возвращаем существующую игру`);
      return res.json({
        success: true,
        game: existingGame,
        message: 'У вас есть незавершенная игра'
      });
    }

    // Проверяем, остались ли попытки у пользователя
    const recentGame = await TicTacToeGame.findOne({
      where: {
        user_id: userId
      },
      order: [['created_at', 'DESC']]
    });

    logger.info(`Последняя игра: ${recentGame ? 'найдена' : 'не найдена'}`);
    if (recentGame) {
      logger.info(`Попытки в последней игре: ${recentGame.attempts_left}, дата создания: ${recentGame.created_at}`);
    }

    let attemptsLeft = 20;
    if (recentGame && recentGame.attempts_left <= 0) {
      // Проверяем, прошло ли 24 часа с последней игры
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      logger.info(`Проверяем 24 часа: последняя игра ${recentGame.created_at}, 24 часа назад ${twentyFourHoursAgo}`);

      if (recentGame.created_at > twentyFourHoursAgo) {
        logger.info(`Попытки закончились, возвращаем ошибку`);
        return res.status(400).json({
          success: false,
          error: 'У вас закончились попытки. Попробуйте завтра!'
        });
      }
      attemptsLeft = 20; // Сбрасываем попытки через 24 часа
      logger.info(`Сбрасываем попытки через 24 часа`);
    } else if (recentGame) {
      attemptsLeft = recentGame.attempts_left;
      logger.info(`Используем оставшиеся попытки: ${attemptsLeft}`);
    }

    logger.info(`Попытки для новой игры: ${attemptsLeft}`);

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
      attempts_left: attemptsLeft,
      bot_goes_first: gameState.botGoesFirst
    });

    logger.info(`Создана новая игра крестики-нолики для пользователя ${userId}, ID игры: ${newGame.id}`);

    logger.info(`Отправляем ответ клиенту`);
    res.json({
      success: true,
      game: newGame
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

    // Ищем только активную игру
    const game = await TicTacToeGame.findOne({
      where: {
        user_id: userId,
        result: 'ongoing'
      },
      order: [['created_at', 'DESC']]
    });

    // Проверяем, можно ли играть (остались ли попытки)
    const recentGame = await TicTacToeGame.findOne({
      where: {
        user_id: userId
      },
      order: [['created_at', 'DESC']]
    });

    let canPlay = true;
    if (recentGame && recentGame.attempts_left <= 0) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      canPlay = recentGame.created_at <= twentyFourHoursAgo;
    }

    res.json({
      success: true,
      game,
      canPlay
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

    // Делаем ход
    const newGameState = ticTacToeService.makePlayerMove(game.game_state, position);

    // Обновляем состояние игры
    let result = 'ongoing';
    let rewardGiven = false;

    if (newGameState.status === 'finished') {
      if (newGameState.winner === 'player') {
        result = 'win';
        logger.info(`Игрок ${userId} выиграл! Пытаемся выдать бонусный кейс...`);
        // Выдаем бонусный кейс
        rewardGiven = await giveReward(userId);
        logger.info(`Результат выдачи бонусного кейса: ${rewardGiven}`);
      } else if (newGameState.winner === 'bot') {
        result = 'lose';
        logger.info(`Игрок ${userId} проиграл. Уменьшаем попытки.`);
        // Уменьшаем количество попыток
        game.attempts_left = Math.max(0, game.attempts_left - 1);
      } else {
        result = 'draw';
        logger.info(`Ничья для игрока ${userId}. Уменьшаем попытки.`);
        // При ничьей тоже уменьшаем попытки
        game.attempts_left = Math.max(0, game.attempts_left - 1);
      }
    }

    // Сохраняем изменения
    await game.update({
      game_state: newGameState,
      result,
      reward_given: rewardGiven,
      attempts_left: game.attempts_left
    });

    let message = '';
    if (result === 'win') {
      message = rewardGiven ? 'Поздравляем! Вы выиграли и получили бонусный кейс!' : 'Вы выиграли, но кейс уже был получен ранее.';
    } else if (result === 'lose') {
      message = `Вы проиграли. Осталось попыток: ${game.attempts_left}`;
    } else if (result === 'draw') {
      message = `Ничья! Осталось попыток: ${game.attempts_left}`;
    }

    res.json({
      success: true,
      game: {
        ...game.toJSON(),
        game_state: newGameState,
        result,
        reward_given: rewardGiven
      },
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

    // Проверяем, не получал ли пользователь уже бонусный кейс за последнюю минуту
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
    logger.info(`🎯 [REWARD] Проверяем период с ${oneMinuteAgo} до сейчас`);

    const existingReward = await TicTacToeGame.findOne({
      where: {
        user_id: userId,
        result: 'win',
        reward_given: true,
        updated_at: {
          [Op.gte]: oneMinuteAgo
        }
      },
      order: [['updated_at', 'DESC']]
    });

    logger.info(`🎯 [REWARD] Существующая награда за последнюю минуту: ${existingReward ? 'найдена' : 'не найдена'}`);
    if (existingReward) {
      logger.info(`🎯 [REWARD] Детали существующей награды:`, {
        id: existingReward.id,
        updated_at: existingReward.updated_at,
        reward_given: existingReward.reward_given
      });
    }

    if (existingReward) {
      logger.info(`🎯 [REWARD] ❌ Награда уже получена недавно: ${existingReward.updated_at}`);
      return false; // Награда уже получена недавно
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
