#!/usr/bin/env node

/**
 * Скрипт для импорта предметов с LIS-Skins в базу данных
 * Запускается командой: node scripts/import-lis-items.js
 */

const LisService = require('../services/lisService');
const db = require('../models');
const winston = require('winston');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'import-lis-items.log' })
  ],
});

async function importLisItems() {
  logger.info('Начало импорта предметов с LIS-Skins...');

  // Загружаем конфигурацию LIS-Skins
  const lisConfig = LisService.loadConfig();
  const lisService = new LisService(lisConfig);

  try {
    // Инициализация сервиса
    logger.info('Инициализация сервиса LIS-Skins...');
    await lisService.initialize();

    if (!lisService.isLoggedIn) {
      logger.error('Ошибка авторизации на LIS-Skins. Проверьте cookies и CSRF-токен.');
      return;
    }

    // Получаем категории оружия
    const weaponCategories = [
      { id: 'knife', name: 'Ножи' },
      { id: 'pistol', name: 'Пистолеты' },
      { id: 'rifle', name: 'Винтовки' },
      { id: 'smg', name: 'Пистолеты-пулеметы' },
      { id: 'heavy', name: 'Тяжелое оружие' },
      { id: 'glove', name: 'Перчатки' },
      { id: 'sticker', name: 'Наклейки' },
      { id: 'agent', name: 'Агенты' }
    ];

    // Статистика импорта
    let totalItems = 0;
    let newItems = 0;
    let updatedItems = 0;
    let errors = 0;

    // Проходим по всем категориям оружия
    for (const category of weaponCategories) {
      logger.info(`Обработка категории: ${category.name} (${category.id})...`);

      try {
        // API может отличаться, предполагаем, что у LIS-Skins есть метод для получения предметов по категории
        const response = await lisService.axiosInstance.get(`/api/market/items?game=csgo&category=${category.id}&page=1&limit=100`);

        if (!response.data || !response.data.success || !response.data.items) {
          logger.warn(`Ошибка получения предметов категории ${category.name}: ${response.data?.message || 'Неизвестная ошибка'}`);
          continue;
        }

        const items = response.data.items;
        logger.info(`Получено ${items.length} предметов категории ${category.name}`);

        // Обрабатываем предметы
        for (const item of items) {
          try {
            totalItems++;

            // Получаем детальную информацию о предмете
            const itemDetails = await lisService.getItemDetails(item.id);
            if (!itemDetails) {
              logger.warn(`Не удалось получить детали предмета ${item.market_hash_name} (ID: ${item.id})`);
              errors++;
              continue;
            }

            // Проверяем, существует ли предмет в нашей базе
            let dbItem = await db.Item.findOne({
              where: {
                steam_market_hash_name: itemDetails.market_hash_name
              }
            });

            // Подготавливаем данные для создания/обновления записи
            const itemData = {
              name: itemDetails.name,
              steam_market_hash_name: itemDetails.market_hash_name,
              image_url: itemDetails.image,
              price: itemDetails.min_price || 0,
              lis_id: itemDetails.id,
              lis_rarity: itemDetails.rarity || '',
              lis_quality: itemDetails.quality || '',
              lis_type: itemDetails.type || '',
              lis_exterior: itemDetails.exterior || '',
              lis_weapon: category.id === 'knife' ? 'knife' : (itemDetails.name.split('|')[0] || '').trim(),
              lis_category: category.id,
              lis_tags: itemDetails.tags || {}
            };

            // Создаем или обновляем запись в базе данных
            if (dbItem) {
              await dbItem.update(itemData);
              updatedItems++;
              logger.info(`Обновлен предмет: ${itemDetails.market_hash_name}`);
            } else {
              dbItem = await db.Item.create(itemData);
              newItems++;
              logger.info(`Создан новый предмет: ${itemDetails.market_hash_name}`);
            }

            // Делаем небольшую паузу, чтобы не перегружать API
            await new Promise(resolve => setTimeout(resolve, 500));

          } catch (itemError) {
            logger.error(`Ошибка при обработке предмета ID: ${item.id}:`, itemError);
            errors++;
          }
        }

      } catch (categoryError) {
        logger.error(`Ошибка при обработке категории ${category.name}:`, categoryError);
        errors++;
      }
    }

    // Выводим статистику импорта
    logger.info('=== Статистика импорта предметов ===');
    logger.info(`Всего обработано: ${totalItems} предметов`);
    logger.info(`Создано новых: ${newItems} предметов`);
    logger.info(`Обновлено: ${updatedItems} предметов`);
    logger.info(`Ошибок: ${errors}`);

    console.log('\n=== Статистика импорта предметов ===');
    console.log(`Всего обработано: ${totalItems} предметов`);
    console.log(`Создано новых: ${newItems} предметов`);
    console.log(`Обновлено: ${updatedItems} предметов`);
    console.log(`Ошибок: ${errors}`);

  } catch (error) {
    logger.error('Общая ошибка при импорте предметов:', error);
    console.log('\x1b[31m%s\x1b[0m', `Ошибка при импорте предметов: ${error.message}`);
  } finally {
    // Закрываем сервис
    logger.info('Закрытие сервиса LIS-Skins...');
    await lisService.close();
  }
}

// Запускаем импорт
importLisItems().catch(error => {
  logger.error('Необработанная ошибка:', error);
  console.log('\x1b[31m%s\x1b[0m', `Необработанная ошибка: ${error.message}`);
  process.exit(1);
}).finally(() => {
  // Даем логгеру время завершить запись
  setTimeout(() => process.exit(0), 2000);
});
