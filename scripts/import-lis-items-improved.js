#!/usr/bin/env node

/**
 * Улучшенный скрипт для импорта предметов с LIS-Skins в базу данных
 * Запускается командой: node scripts/import-lis-items-improved.js
 */

const LisService = require('../services/lisService');
const db = require('../models');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Создаем директорию для логов, если её нет
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logsDir, 'import-lis-items-improved.log')
    })
  ],
});

// Соответствие rarity из LIS-Skins -> ENUM базы данных
const rarityMap = {
  'consumer': 'consumer',
  'industrial': 'industrial',
  'mil-spec': 'milspec',
  'restricted': 'restricted',
  'classified': 'classified',
  'covert': 'covert',
  'contraband': 'contraband',
  'rare': 'exotic',
  'legendary': 'covert',
  'common': 'consumer',
  'uncommon': 'industrial',
  'default': 'consumer'
};

// Категории оружия
const weaponCategories = [
  { id: 'knife', name: 'Ножи' },
  { id: 'pistol', name: 'Пистолеты' },
  { id: 'rifle', name: 'Винтовки' },
  { id: 'smg', name: 'Пистолеты-пулеметы' },
  { id: 'heavy', name: 'Тяжелое оружие' },
  { id: 'glove', name: 'Перчатки' },
  { id: 'sticker', name: 'Наклейки' },
  { id: 'agent', name: 'Агенты' },
  // Добавьте другие категории, если они есть на LIS-Skins
];

// Функция задержки для предотвращения блокировки API
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция для получения предметов с LIS-Skins с поддержкой повторных попыток
async function fetchLisItems(lisService, { category, page = 1, limit = 100, game = 'cs2' }, retries = 3) {
  try {
    logger.info(`Запрос страницы ${page} категории ${category.name} (${category.id})...`);

    // Запрос к API
    const response = await lisService.axiosInstance.get(`/api/market/items`, {
      params: {
        game,
        category: category.id,
        page,
        limit,
        sort: 'price.asc' // Сортировка по возрастанию цены
      }
    });

    if (!response.data || !response.data.success) {
      logger.warn(`Ошибка получения предметов: ${response.data?.message || 'Неизвестная ошибка'}`);
      throw new Error(`Ошибка API LIS-Skins: ${response.data?.message || 'Неизвестная ошибка'}`);
    }

    const items = response.data.items || [];
    logger.info(`Получено ${items.length} предметов на странице ${page} категории ${category.name}`);

    return {
      items,
      hasMore: items.length >= limit,
      service: lisService
    };
  } catch (error) {
    if (retries > 0) {
      logger.warn(`Ошибка при получении предметов (осталось попыток: ${retries}): ${error.message}`);
      // Ждем перед повторной попыткой
      await delay(5000);
      return fetchLisItems(lisService, { category, page, limit, game }, retries - 1);
    }
    throw error;
  }
}

// Получение детальной информации о предмете
async function getItemDetails(itemId, lisService, retries = 3) {
  try {
    logger.debug(`Запрос детальной информации о предмете ${itemId}...`);
    const itemDetails = await lisService.getItemDetails(itemId);
    return itemDetails;
  } catch (error) {
    if (retries > 0) {
      logger.warn(`Ошибка при получении деталей предмета ${itemId} (осталось попыток: ${retries}): ${error.message}`);
      await delay(3000);
      return getItemDetails(itemId, lisService, retries - 1);
    }
    throw error;
  }
}

// Маппинг предмета из LIS-Skins в формат базы данных
function mapLisItemToDb(item, itemDetails, category) {
  // Базовые данные о предмете
  const marketHashName = itemDetails.market_hash_name || item.market_hash_name;
  if (!marketHashName) {
    logger.warn(`Предмет без market_hash_name, пропускаем: ${item.id}`);
    return null;
  }

  // Фильтруем предметы, которые не нужно импортировать
  if (
    (category.id === 'sticker' && !global.IMPORT_STICKERS) || // Стикеры (опционально)
    marketHashName.includes('StatTrak™') && !global.IMPORT_STATTRAK // StatTrak (опционально)
  ) {
    logger.debug(`Предмет отфильтрован: ${marketHashName}`);
    return null;
  }

  // Извлечение названия оружия из market_hash_name
  let weaponType = '';
  if (category.id === 'knife') {
    weaponType = 'knife';
  } else if (marketHashName.includes(' | ')) {
    weaponType = marketHashName.split(' | ')[0].trim();
  }

  // Раритетность
  const rarity = rarityMap[itemDetails.rarity?.toLowerCase()] || rarityMap.default;

  // Минимальная цена из доступных предложений
  const minPrice = itemDetails.min_price || itemDetails.price || 0;

  // Данные для записи в базу данных
  return {
    name: itemDetails.name || marketHashName,
    description: JSON.stringify(itemDetails),
    image_url: itemDetails.image,
    price: parseFloat(minPrice),
    rarity: rarity,
    drop_weight: 1,
    weapon_type: weaponType,
    skin_name: marketHashName.includes(' | ') ? marketHashName.split(' | ')[1] : '',
    category_id: null, // Заполнить при необходимости
    steam_market_hash_name: marketHashName,
    is_available: true,
    min_subscription_tier: 0,
    float_value: null,
    exterior: itemDetails.exterior || null,
    stickers: null,
    quality: itemDetails.quality || null,

    // LIS-Skins специфичные поля
    lis_id: itemDetails.id || item.id,
    lis_rarity: itemDetails.rarity || '',
    lis_quality: itemDetails.quality || '',
    lis_type: itemDetails.type || '',
    lis_exterior: itemDetails.exterior || '',
    lis_weapon: weaponType,
    lis_category: category.id,
    lis_tags: itemDetails.tags || {}
  };
}

// Сохранение или обновление предмета в базе данных
async function saveOrUpdateItem(itemData) {
  if (!itemData || !itemData.steam_market_hash_name) {
    logger.warn('Попытка сохранить предмет без steam_market_hash_name');
    return null;
  }

  try {
    const [item, created] = await db.Item.findOrCreate({
      where: { steam_market_hash_name: itemData.steam_market_hash_name },
      defaults: itemData
    });

    if (!created) {
      // Обновляем только если цена изменилась или добавились новые данные
      if (item.price !== itemData.price || !item.lis_id) {
        await item.update(itemData);
        return { item, status: 'updated' };
      }
      return { item, status: 'unchanged' };
    }

    return { item, status: 'created' };
  } catch (error) {
    logger.error(`Ошибка при сохранении предмета ${itemData.steam_market_hash_name}:`, error);
    return null;
  }
}

// Главная функция импорта
async function importLisItems(options = {}) {
  // Настройки импорта (можно передавать из командной строки)
  global.IMPORT_STICKERS = options.importStickers || false; // Импортировать ли стикеры
  global.IMPORT_STATTRAK = options.importStatTrak || true; // Импортировать ли StatTrak предметы
  global.MAX_PAGES = options.maxPages || Infinity; // Максимальное количество страниц на категорию
  global.MAX_ITEMS = options.maxItems || Infinity; // Максимальное количество предметов на импорт
  global.DELAY_BETWEEN_REQUESTS = options.delay || 1000; // Задержка между запросами в мс

  logger.info('======= Начало улучшенного импорта предметов с LIS-Skins =======');
  logger.info(`Настройки импорта: ${JSON.stringify({
    IMPORT_STICKERS: global.IMPORT_STICKERS,
    IMPORT_STATTRAK: global.IMPORT_STATTRAK,
    MAX_PAGES: global.MAX_PAGES,
    MAX_ITEMS: global.MAX_ITEMS,
    DELAY_BETWEEN_REQUESTS: global.DELAY_BETWEEN_REQUESTS
  })}`);

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

    // Статистика импорта
    const stats = {
      totalProcessed: 0,
      totalAdded: 0,
      totalUpdated: 0,
      totalUnchanged: 0,
      totalErrors: 0,
      totalSkipped: 0,
      byCategory: {}
    };

    // Множество для отслеживания уже обработанных предметов (предотвращение дублей)
    const processedItems = new Set();

    // Обрабатываем каждую категорию
    for (const category of weaponCategories) {
      logger.info(`\n=== Обработка категории: ${category.name} (${category.id}) ===`);

      // Инициализируем статистику для категории
      stats.byCategory[category.id] = {
        processed: 0,
        added: 0,
        updated: 0,
        unchanged: 0,
        errors: 0,
        skipped: 0
      };

      let page = 1;
      let hasMore = true;

      // Перебираем все страницы категории
      while (hasMore && page <= global.MAX_PAGES && stats.totalProcessed < global.MAX_ITEMS) {
        try {
          // Получаем предметы для текущей страницы
          const result = await fetchLisItems(lisService, {
            category,
            page,
            limit: 100,
            game: 'cs2'
          });

          const { items, hasMore: moreItems, service } = result;
          hasMore = moreItems;

          // Обрабатываем предметы на странице
          for (const item of items) {
            // Проверяем лимит на общее количество предметов
            if (stats.totalProcessed >= global.MAX_ITEMS) {
              logger.info(`Достигнут лимит в ${global.MAX_ITEMS} предметов. Прерываем импорт.`);
              hasMore = false;
              break;
            }

            stats.totalProcessed++;
            stats.byCategory[category.id].processed++;

            try {
              // Проверяем, не обрабатывали ли мы уже этот предмет
              if (processedItems.has(item.id)) {
                logger.debug(`Предмет уже обработан, пропускаем: ${item.id}`);
                stats.totalSkipped++;
                stats.byCategory[category.id].skipped++;
                continue;
              }

              // Получаем детальную информацию о предмете
              const itemDetails = await getItemDetails(item.id, service);
              if (!itemDetails) {
                logger.warn(`Не удалось получить детали предмета ID: ${item.id}`);
                stats.totalErrors++;
                stats.byCategory[category.id].errors++;
                continue;
              }

              // Добавляем в множество обработанных предметов
              processedItems.add(item.id);

              // Преобразуем данные для базы данных
              const itemData = mapLisItemToDb(item, itemDetails, category);
              if (!itemData) {
                stats.totalSkipped++;
                stats.byCategory[category.id].skipped++;
                continue;
              }

              // Сохраняем или обновляем предмет в базе данных
              const result = await saveOrUpdateItem(itemData);
              if (!result) {
                stats.totalErrors++;
                stats.byCategory[category.id].errors++;
                continue;
              }

              // Обновляем статистику
              if (result.status === 'created') {
                stats.totalAdded++;
                stats.byCategory[category.id].added++;
                logger.info(`Добавлен новый предмет: ${itemData.steam_market_hash_name} (ID: ${item.id})`);
              } else if (result.status === 'updated') {
                stats.totalUpdated++;
                stats.byCategory[category.id].updated++;
                logger.info(`Обновлен предмет: ${itemData.steam_market_hash_name} (ID: ${item.id})`);
              } else {
                stats.totalUnchanged++;
                stats.byCategory[category.id].unchanged++;
                logger.debug(`Предмет без изменений: ${itemData.steam_market_hash_name} (ID: ${item.id})`);
              }

              // Делаем паузу между запросами для предотвращения блокировки
              await delay(global.DELAY_BETWEEN_REQUESTS);

            } catch (itemError) {
              logger.error(`Ошибка при обработке предмета ID: ${item.id}:`, itemError);
              stats.totalErrors++;
              stats.byCategory[category.id].errors++;
            }
          }

          // Переходим к следующей странице
          page++;

          // Делаем небольшую паузу между страницами
          if (hasMore) {
            await delay(global.DELAY_BETWEEN_REQUESTS * 2);
          }

        } catch (pageError) {
          logger.error(`Ошибка при обработке страницы ${page} категории ${category.name}:`, pageError);
          hasMore = false;
        }
      }

      // Вывод статистики по категории
      logger.info(`\n=== Статистика импорта для категории ${category.name} ===`);
      logger.info(`Обработано: ${stats.byCategory[category.id].processed} предметов`);
      logger.info(`Добавлено: ${stats.byCategory[category.id].added} предметов`);
      logger.info(`Обновлено: ${stats.byCategory[category.id].updated} предметов`);
      logger.info(`Без изменений: ${stats.byCategory[category.id].unchanged} предметов`);
      logger.info(`Пропущено: ${stats.byCategory[category.id].skipped} предметов`);
      logger.info(`Ошибок: ${stats.byCategory[category.id].errors} предметов`);
    }

    // Вывод общей статистики
    logger.info('\n======= Общая статистика импорта предметов =======');
    logger.info(`Всего обработано: ${stats.totalProcessed} предметов`);
    logger.info(`Добавлено: ${stats.totalAdded} предметов`);
    logger.info(`Обновлено: ${stats.totalUpdated} предметов`);
    logger.info(`Без изменений: ${stats.totalUnchanged} предметов`);
    logger.info(`Пропущено: ${stats.totalSkipped} предметов`);
    logger.info(`Ошибок: ${stats.totalErrors} предметов`);

    console.log('\n======= Общая статистика импорта предметов =======');
    console.log(`Всего обработано: ${stats.totalProcessed} предметов`);
    console.log(`Добавлено: ${stats.totalAdded} предметов`);
    console.log(`Обновлено: ${stats.totalUpdated} предметов`);
    console.log(`Без изменений: ${stats.totalUnchanged} предметов`);
    console.log(`Пропущено: ${stats.totalSkipped} предметов`);
    console.log(`Ошибок: ${stats.totalErrors} предметов`);

    return stats;
  } catch (error) {
    logger.error('Общая ошибка при импорте предметов:', error);
    console.log('\x1b[31m%s\x1b[0m', `Ошибка при импорте предметов: ${error.message}`);
    throw error;
  } finally {
    // Закрываем сервис
    logger.info('Закрытие сервиса LIS-Skins...');
    await lisService.close();
  }
}

// Разбор аргументов командной строки
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const options = {
    importStickers: false,
    importStatTrak: true,
    maxPages: Infinity,
    maxItems: Infinity,
    delay: 1000
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stickers' || args[i] === '-s') {
      options.importStickers = true;
    } else if (args[i] === '--no-stattrak' || args[i] === '-ns') {
      options.importStatTrak = false;
    } else if (args[i] === '--max-pages' && i + 1 < args.length) {
      options.maxPages = parseInt(args[++i], 10) || Infinity;
    } else if (args[i] === '--max-items' && i + 1 < args.length) {
      options.maxItems = parseInt(args[++i], 10) || Infinity;
    } else if (args[i] === '--delay' && i + 1 < args.length) {
      options.delay = parseInt(args[++i], 10) || 1000;
    }
  }

  return options;
}

// Если скрипт запускается напрямую
if (require.main === module) {
  const options = parseCommandLineArgs();

  // Запускаем импорт
  importLisItems(options).catch(error => {
    logger.error('Необработанная ошибка:', error);
    console.log('\x1b[31m%s\x1b[0m', `Необработанная ошибка: ${error.message}`);
    process.exit(1);
  }).finally(() => {
    // Даем логгеру время завершить запись
    setTimeout(() => process.exit(0), 2000);
  });
} else {
  // Экспортируем функцию для использования в других модулях
  module.exports = importLisItems;
}
