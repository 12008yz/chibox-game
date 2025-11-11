#!/usr/bin/env node

const { sequelize } = require('../models');
const { logger } = require('../utils/logger');

async function addSafeCrackerFields() {
  try {
    logger.info('🔧 Начинаем добавление полей Safe Cracker...');

    // Добавляем поле last_safecracker_reset
    try {
      await sequelize.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS last_safecracker_reset TIMESTAMP WITH TIME ZONE DEFAULT NULL
      `);
      logger.info('✅ Поле last_safecracker_reset добавлено');
    } catch (error) {
      logger.warn('⚠️ Поле last_safecracker_reset уже существует или ошибка:', error.message);
    }

    // Добавляем комментарий к полю last_safecracker_reset
    try {
      await sequelize.query(`
        COMMENT ON COLUMN users.last_safecracker_reset IS 'Дата последнего сброса попыток Safe Cracker (в 16:00 МСК)'
      `);
    } catch (error) {
      logger.warn('⚠️ Не удалось добавить комментарий:', error.message);
    }

    // Добавляем поле has_won_safecracker
    try {
      await sequelize.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS has_won_safecracker BOOLEAN NOT NULL DEFAULT false
      `);
      logger.info('✅ Поле has_won_safecracker добавлено');
    } catch (error) {
      logger.warn('⚠️ Поле has_won_safecracker уже существует или ошибка:', error.message);
    }

    // Добавляем комментарий к полю has_won_safecracker
    try {
      await sequelize.query(`
        COMMENT ON COLUMN users.has_won_safecracker IS 'Флаг: выигрывал ли пользователь в Safe Cracker (выигрыш доступен один раз)'
      `);
    } catch (error) {
      logger.warn('⚠️ Не удалось добавить комментарий:', error.message);
    }

    // Проверяем, что поля добавлены
    const [results] = await sequelize.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('last_safecracker_reset', 'has_won_safecracker')
      ORDER BY column_name
    `);

    logger.info('📊 Проверка добавленных полей:');
    console.table(results);

    if (results.length === 2) {
      logger.info('✅ Все поля Safe Cracker успешно добавлены!');
    } else {
      logger.error('❌ Не все поля были добавлены. Проверьте логи выше.');
    }

    await sequelize.close();
    process.exit(0);

  } catch (error) {
    logger.error('❌ Критическая ошибка при добавлении полей Safe Cracker:', error);
    await sequelize.close();
    process.exit(1);
  }
}

// Запуск скрипта
addSafeCrackerFields();
