const { User } = require('../../models');
const { logger } = require('../../utils/logger');

// Конфигурация слотов Plinko - должна быть синхронизирована с playPlinko.js
const PLINKO_SLOTS = [
  { type: 'coins', value: 8 },
  { type: 'coins', value: 6 },
  { type: 'coins', value: 5 },
  { type: 'coins', value: 7 },
  { type: 'coins', value: 9 },
  { type: 'coins', value: 6 },
  { type: 'coins', value: 10 },
  { type: 'coins', value: 5 },
  { type: 'status', days: 1 },
  { type: 'coins', value: 5 },
  { type: 'coins', value: 10 },
  { type: 'coins', value: 6 },
  { type: 'coins', value: 9 },
  { type: 'coins', value: 7 },
  { type: 'coins', value: 5 },
  { type: 'status', days: 2 },
  { type: 'coins', value: 8 }
];

/**
 * Получить статус игры Plinko
 */
const getPlinkoStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // Получаем информацию о пользователе
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Инициализируем массив занятых слотов если его нет
    const occupiedSlots = user.plinko_occupied_slots || [];

    // Формируем информацию о всех слотах
    const allSlots = PLINKO_SLOTS.map((slot, index) => ({
      index,
      type: slot.type,
      value: slot.value || slot.days,
      occupied: occupiedSlots.includes(index)
    }));

    const response = {
      success: true,
      occupied_slots: occupiedSlots,
      remaining_attempts: user.game_attempts || 0,
      all_slots: allSlots,
      total_slots: PLINKO_SLOTS.length,
      game_completed: occupiedSlots.length >= PLINKO_SLOTS.length
    };

    res.json(response);

  } catch (error) {
    logger.error('Ошибка при получении статуса Plinko:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = getPlinkoStatus;
