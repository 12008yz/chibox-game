#!/usr/bin/env node

/**
 * Скрипт для импорта предметов с CS.Money в базу данных
 * Запускается командой: node scripts/import-csmoney-items.js
 */

const CSMoneyService = require('../services/csmoneyService');
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
    new winston.transports.File({ filename: 'import-csmoney-items.log' })
  ],
});

async function importCSMoneyItems() {
  logger.info('Начало импорта предметов с CS.Money...');

  // Загружаем конфигурацию CS.Money
  const csmoneyConfig = CSMoneyService.loadConfig();
  const csmoneyService = new CSMoneyService(csmoneyConfig);

  try {
    // Инициализация сервиса
    logger.info('Инициализация сервиса CS.Money...');
    await csmoneyService.initialize();

    // Проверяем авторизацию, но для CS.Money возможен импорт и без неё
    if (!csmoneyService.isLoggedIn) {
      logger.warn('Авторизация на CS.Money не выполнена. Продолжаем импорт без авторизации.');
    }

    // Статистика импорта
    let totalItems = 0;
    let newItems = 0;
    let updatedItems = 0;
    let errors = 0;

    // Импорт по страницам с улучшенной логикой
    let offset = 0;
    const limit = 60; // Это максимальный лимит, указанный в API
    let hasMoreItems = true;
    let emptyResponsesCount = 0;
    const maxEmptyResponses = 3; // Максимум пустых ответов подряд

    logger.info('=== Начало импорта предметов с CS.Money ===');
    logger.info('Используется улучшенная логика с infinite scroll и множественными селекторами');

    while (hasMoreItems) {
      logger.info(`\n--- Загрузка предметов с CS.Money (offset: ${offset}, limit: ${limit}) ---`);

      try {
        // Получаем список предметов
        const response = await csmoneyService.getItems(offset, limit);

        logger.info(`Ответ содержит success: ${response.success}, items: ${response.items ? response.items.length : 0}`);

        if (!response.success || !response.items || response.items.length === 0) {
          emptyResponsesCount++;
          logger.warn(`Нет доступных предметов или ошибка запроса (попытка ${emptyResponsesCount}/${maxEmptyResponses})`);

          if (emptyResponsesCount >= maxEmptyResponses) {
            logger.info('Достигнут максимум пустых ответов. Завершаем импорт.');
            break;
          }

          // Увеличиваем offset даже при пустом ответе, чтобы попробовать следующую "страницу"
          offset += limit;
          continue;
        }

        // Сбрасываем счетчик пустых ответов
        emptyResponsesCount = 0;

        const items = response.items;
        logger.info(`✓ Получено ${items.length} предметов с CS.Money`);

        if (response.total) {
          logger.info(`Общее количество доступных предметов на сайте: ${response.total}`);
        }

        // Обновляем статистику
        totalItems += items.length;
        logger.info(`Общий прогресс: ${totalItems} предметов обработано`);

        // Импортируем предметы в БД
        for (const item of items) {
          try {
            // Проверяем, существует ли предмет в нашей базе
            let dbItem = await db.Item.findOne({
              where: {
                [db.Sequelize.Op.or]: [
                  { csmoney_id: item.id },
                  { steam_market_hash_name: item.name }
                ]
              }
            });

            // Определяем редкость предмета
            const rarityMap = {
              'common': 'consumer',
              'uncommon': 'industrial',
              'rare': 'milspec',
              'mythical': 'restricted',
              'legendary': 'covert',
              'ancient': 'exotic',
              'immortal': 'contraband'
            };

            // Определяем quality и exterior
            let exterior = null;
            if (item.name) {
              const exteriorMatch = item.name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/);
              if (exteriorMatch) {
                exterior = exteriorMatch[1];
              }
            }

            // Подготавливаем данные для создания/обновления записи
            const itemData = {
              name: item.name || '',
              steam_market_hash_name: item.name || '',
              image_url: item.image || '',
              price: item.price || 0,
              csmoney_id: item.id,
              rarity: rarityMap[item.rarity] || 'consumer',
              drop_weight: 1,
              weapon_type: item.type || null,
              exterior: exterior,
              float_value: item.float || null,
              quality: item.quality || null,
              csmoney_rarity: item.rarity || '',
              csmoney_quality: item.quality || '',
              csmoney_type: item.type || '',
              csmoney_tags: item.tags || {},
              asset_id: item.assetId || null,
              is_tradable: item.is_tradable !== false,
              in_stock: item.in_stock !== false
            };

            // Создаем или обновляем запись в базе данных
            if (dbItem) {
              await dbItem.update(itemData);
              updatedItems++;
              if (updatedItems % 10 === 0) {
                logger.info(`Обновлено предметов: ${updatedItems}`);
              }
            } else {
              dbItem = await db.Item.create(itemData);
              newItems++;
              if (newItems % 10 === 0) {
                logger.info(`Создано новых предметов: ${newItems}`);
              }
            }

            // Делаем небольшую паузу, чтобы не перегружать API
            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (itemError) {
            logger.error(`Ошибка при обработке предмета ID: ${item.id}:`, itemError);
            errors++;
          }
        }

        // Логика определения продолжения импорта
        if (items.length < limit) {
          // Если получили меньше предметов чем лимит, значит достигли конца
          hasMoreItems = false;
          logger.info('✓ Все доступные предметы загружены (получено меньше лимита).');
        } else {
          // Увеличиваем смещение для следующей "страницы"
          offset += limit;
          logger.info(`→ Переходим к следующей части. Новый offset: ${offset}`);

          // Делаем паузу перед следующим запросом для избежания блокировки
          logger.info('Пауза 3 секунды перед следующим запросом...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (pageError) {
        logger.error(`Ошибка при загрузке страницы (offset: ${offset}):`, pageError);
        errors++;
        // Прерываем цикл в случае ошибки
        break;
      }
    }

    // Выводим статистику импорта
    logger.info('=== Статистика импорта предметов CS.Money ===');
    logger.info(`Всего обработано: ${totalItems} предметов`);
    logger.info(`Создано новых: ${newItems} предметов`);
    logger.info(`Обновлено: ${updatedItems} предметов`);
    logger.info(`Ошибок: ${errors}`);

    console.log('\n=== Статистика импорта предметов CS.Money ===');
    console.log(`Всего обработано: ${totalItems} предметов`);
    console.log(`Создано новых: ${newItems} предметов`);
    console.log(`Обновлено: ${updatedItems} предметов`);
    console.log(`Ошибок: ${errors}`);

  } catch (error) {
    logger.error('Общая ошибка при импорте предметов:', error);
    console.log('\x1b[31m%s\x1b[0m', `Ошибка при импорте предметов: ${error.message}`);
  } finally {
    // Закрываем сервис
    logger.info('Закрытие сервиса CS.Money...');
    await csmoneyService.close();
  }
}

// Запускаем импорт
importCSMoneyItems().catch(error => {
  logger.error('Необработанная ошибка:', error);
  console.log('\x1b[31m%s\x1b[0m', `Необработанная ошибка: ${error.message}`);
  process.exit(1);
}).finally(() => {
  // Даем логгеру время завершить запись
  setTimeout(() => process.exit(0), 2000);
});
