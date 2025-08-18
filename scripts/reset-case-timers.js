#!/usr/bin/env node

/**
 * Скрипт для сброса таймеров ежедневных кейсов
 * Обнуляет next_case_available_time для всех пользователей
 * Позволяет немедленно получать кейсы после изменения логики с 24 часов на 10 секунд
 */

const db = require('../models');

async function resetCaseTimers() {
  try {
    console.log('🔄 Начинаем сброс таймеров кейсов...');

    // Обновляем всех пользователей
    const [updatedCount] = await db.User.update(
      {
        next_case_available_time: null,
        cases_opened_today: 0,
        last_reset_date: new Date()
      },
      {
        where: {}
      }
    );

    console.log(`✅ Успешно сброшены таймеры для ${updatedCount} пользователей`);
    console.log('🎯 Теперь все пользователи могут получать кейсы каждые 10 секунд!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при сбросе таймеров:', error);
    process.exit(1);
  }
}

// Запускаем скрипт
resetCaseTimers();
