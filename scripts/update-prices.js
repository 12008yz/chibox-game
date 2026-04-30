const db = require('../models');
const SteamPriceService = require('../services/steamPriceService');
const ProfitabilityCalculator = require('../utils/profitabilityCalculator');
const logger = require('../utils/logger');

// Инициализируем сервисы
const steamPriceService = new SteamPriceService(process.env.STEAM_API_KEY);
const profitabilityCalculator = new ProfitabilityCalculator(0.2);

/**
 * Отключает предмет: удаляет из шаблонов кейсов и помечает is_available = false.
 * После этого предмет нигде не показывается на фронте.
 */
async function disableItem(itemId, logName = '') {
  try {
    const deleted = await db.CaseTemplateItem.destroy({ where: { item_id: itemId } });
    await db.Item.update({ is_available: false }, { where: { id: itemId } });
    console.log(`🗑️ ${logName || itemId}: удалён из кейсов и отключён (цена недоступна)`);
    return deleted;
  } catch (err) {
    console.error(`Ошибка при отключении предмета ${itemId}:`, err.message);
    return 0;
  }
}

/**
 * Обновление цен всех предметов из Steam Market
 */
async function updateAllPrices() {
  console.log('🔄 Начинаем обновление цен всех предметов...\n');

  try {
    // Получаем все предметы с их market_hash_name
    const items = await db.Item.findAll({
      where: {
        steam_market_hash_name: {
          [db.Sequelize.Op.ne]: null
        },
        is_available: true
      },
      attributes: ['id', 'steam_market_hash_name', 'price', 'rarity', 'price_last_updated']
    });

    console.log(`📊 Найдено ${items.length} предметов для обновления`);

    let updatedCount = 0;
    let errorCount = 0;

    // Обновляем цены батчами
    const batchSize = 50;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      console.log(`\n📦 Обрабатываем batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`);

      // Обрабатываем предметы последовательно с задержкой 8 секунд между запросами
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        try {
          const priceData = await steamPriceService.getItemPrice(item.steam_market_hash_name);

          if (priceData.success && priceData.price_rub > 0) {
            // Обновляем цену и категорию если они изменились
            const updates = {
              actual_price_rub: priceData.price_rub,
              price_last_updated: new Date(),
              price_source: 'steam_api'
            };

            // Обновляем основную цену если изменилась значительно
            const priceDiff = Math.abs(item.price - priceData.price_rub) / item.price;
            if (priceDiff > 0.1) { // Если изменение больше 10%
              updates.price = priceData.price_rub;
              console.log(`💰 ${item.steam_market_hash_name}: цена изменена ${item.price} → ${priceData.price_rub} КР`);
            }

            // Обновляем категорию если изменилась
            if (item.rarity !== priceData.category) {
              updates.rarity = priceData.category;
              console.log(`📝 ${item.steam_market_hash_name}: категория изменена ${item.rarity} → ${priceData.category}`);
            }

            await db.Item.update(updates, {
              where: { id: item.id }
            });

            updatedCount++;
            console.log(`✅ ${item.steam_market_hash_name}: ₽${priceData.price_rub}`);
          } else {
            errorCount++;
            await disableItem(item.id, item.steam_market_hash_name);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ ${item.steam_market_hash_name}: ${error.message}`);
          await disableItem(item.id, item.steam_market_hash_name);
        }

        // Задержка 8 секунд между запросами (кроме последнего в батче)
        if (j < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 8000));
        }
      }

      // Пауза между батчами (8 сек)
      if (i + batchSize < items.length) {
        console.log('⏳ Пауза между батчами...');
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
    }

    console.log('\n📊 РЕЗУЛЬТАТЫ ОБНОВЛЕНИЯ:');
    console.log(`✅ Обновлено: ${updatedCount}`);
    console.log(`❌ Ошибок: ${errorCount}`);
    console.log(`📈 Успешность: ${((updatedCount / items.length) * 100).toFixed(1)}%`);

    // Пересчитываем веса после обновления цен
    console.log('\n⚖️ Пересчитываем веса кейсов...');
    await recalculateCaseWeights();

    // Пересчитываем лучшие предметы пользователей после обновления цен
    console.log('\n🏆 Пересчитываем лучшие предметы пользователей...');
    const bestItemsResult = await recalculateUserBestItems();
    console.log(`✅ Обновлено лучших предметов: ${bestItemsResult.updated} пользователей`);

    // Очищаем кэш
    steamPriceService.cleanExpiredCache();

    console.log('\n🎉 Обновление цен завершено!');
    return {
      updated: updatedCount,
      errors: errorCount,
      total: items.length,
      bestItemsUpdated: bestItemsResult.updated
    };

  } catch (error) {
    console.error('❌ Критическая ошибка обновления цен:', error);
    throw error;
  }
}

/**
 * Пересчет весов кейсов после обновления цен
 */
async function recalculateCaseWeights() {
  try {
    // Получаем все предметы сгруппированные по origin (типу кейса)
    const items = await db.Item.findAll({
      where: {
        is_available: true,
        origin: {
          [db.Sequelize.Op.ne]: null
        }
      }
    });

    // Группируем по типу кейса и категории
    const itemsByCase = new Map();
    for (const item of items) {
      const caseType = item.origin.replace('_case', '');
      if (!itemsByCase.has(caseType)) {
        itemsByCase.set(caseType, new Map());
      }
      const caseBucket = itemsByCase.get(caseType);
      if (!caseBucket.has(item.rarity)) {
        caseBucket.set(item.rarity, []);
      }
      caseBucket.get(item.rarity).push(item);
    }

    // Базовые конфигурации кейсов
    const caseConfigs = [
      ['purchase', { price: 99, name: 'Покупной кейс' }],
      ['premium', { price: 499, name: 'Премиум кейс' }]
    ];

    // Пересчитываем веса для платных кейсов
    for (const [caseType, config] of caseConfigs) {
      if (itemsByCase.has(caseType)) {
        console.log(`🎯 Пересчитываем веса для: ${config.name}`);

        const optimization = profitabilityCalculator.calculateOptimalWeights(
          Object.fromEntries(itemsByCase.get(caseType).entries()),
          config.price
        );

        if (optimization.isOptimal) {
          // Обновляем веса в базе данных
          await updateWeightsInDatabase(
            Object.fromEntries(itemsByCase.get(caseType).entries()),
            optimization.weights
          );
          console.log(`✅ Веса обновлены для ${config.name} (рентабельность: ${(optimization.profitMargin * 100).toFixed(1)}%)`);
        } else {
          console.log(`⚠️ Не удалось оптимизировать веса для ${config.name}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Ошибка пересчета весов:', error);
  }
}

/**
 * Обновление весов в базе данных
 */
async function updateWeightsInDatabase(itemsByCategory, weights) {
  const weightMap = new Map(Object.entries(weights));
  for (const [category, items] of Object.entries(itemsByCategory)) {
    const baseWeight = weightMap.get(category) || 1;

    for (const item of items) {
      // Добавляем небольшую вариацию в веса (±5%)
      const variation = (Math.random() - 0.5) * 0.1;
      const finalWeight = Math.max(0.01, baseWeight * (1 + variation));

      await db.Item.update(
        { drop_weight: Math.round(finalWeight * 100) / 100 },
        { where: { id: item.id } }
      );
    }
  }
}

/**
 * Обновление цен только устаревших предметов (старше 6 часов)
 */
async function updateOutdatedPrices() {
  console.log('🔄 Обновляем только устаревшие цены (старше 6 часов)...\n');

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const outdatedItems = await db.Item.findAll({
    where: {
      steam_market_hash_name: {
        [db.Sequelize.Op.ne]: null
      },
      is_available: true,
      [db.Sequelize.Op.or]: [
        { price_last_updated: null },
        { price_last_updated: { [db.Sequelize.Op.lt]: sixHoursAgo } }
      ]
    },
    attributes: ['id', 'steam_market_hash_name', 'price', 'rarity', 'price_last_updated']
  });

  console.log(`📊 Найдено ${outdatedItems.length} устаревших предметов`);

  if (outdatedItems.length === 0) {
    console.log('✅ Все цены актуальны!');
    return { updated: 0, errors: 0, total: 0 };
  }

  // Используем ту же логику что и для полного обновления
  return await updateSpecificItems(outdatedItems);
}

/**
 * Обновление конкретного списка предметов
 */
async function updateSpecificItems(items) {
  let updatedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const priceData = await steamPriceService.getItemPrice(item.steam_market_hash_name);

      if (priceData.success && priceData.price_rub > 0) {
        const updates = {
          actual_price_rub: priceData.price_rub,
          price_last_updated: new Date(),
          price_source: 'steam_api'
        };

        // Обновляем основную цену если изменилась значительно
        const priceDiff = Math.abs(item.price - priceData.price_rub) / item.price;
        if (priceDiff > 0.1) {
          updates.price = priceData.price_rub;
          console.log(`💰 ${item.steam_market_hash_name}: цена изменена ${item.price} → ${priceData.price_rub} КР`);
        }

        // Обновляем категорию если изменилась
        if (item.rarity !== priceData.category) {
          updates.rarity = priceData.category;
          console.log(`📝 ${item.steam_market_hash_name}: категория изменена ${item.rarity} → ${priceData.category}`);
        }

        await db.Item.update(updates, {
          where: { id: item.id }
        });

        updatedCount++;
        console.log(`✅ ${item.steam_market_hash_name}: ₽${priceData.price_rub}`);
      } else {
        errorCount++;
        await disableItem(item.id, item.steam_market_hash_name);
      }
    } catch (error) {
      errorCount++;
      console.error(`❌ ${item.steam_market_hash_name}: ${error.message}`);
      await disableItem(item.id, item.steam_market_hash_name);
    }

    // Задержка 8 секунд между запросами (кроме последнего предмета)
    if (i < items.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 8000));
    }
  }

  return { updated: updatedCount, errors: errorCount, total: items.length };
}

/**
 * Пересчет лучших предметов всех пользователей
 */
async function recalculateUserBestItems() {
  try {
    console.log('🔄 Начинаем пересчет лучших предметов пользователей...');

    // Получаем всех пользователей, у которых есть предметы
    const usersWithItems = await db.sequelize.query(`
      SELECT DISTINCT ui.user_id
      FROM user_inventory ui
      INNER JOIN items i ON ui.item_id = i.id
      WHERE i.price IS NOT NULL
    `, { type: db.Sequelize.QueryTypes.SELECT });

    console.log(`👥 Найдено ${usersWithItems.length} пользователей с предметами`);

    let updatedCount = 0;

    for (const userRow of usersWithItems) {
      const userId = userRow.user_id;

      try {
        // Получаем все предметы пользователя
        const userItems = await db.UserInventory.findAll({
          where: { user_id: userId },
          include: [{
            model: db.Item,
            as: 'item',
            attributes: ['price']
          }]
        });

        // Находим максимальную цену
        let maxPrice = 0;
        let totalValue = 0;

        userItems.forEach(inventoryItem => {
          if (inventoryItem.item && inventoryItem.item.price) {
            const price = parseFloat(inventoryItem.item.price);
            totalValue += price;
            if (price > maxPrice) {
              maxPrice = price;
            }
          }
        });

        // Обновляем данные пользователя
        if (maxPrice > 0) {
          await db.User.update({
            best_item_value: maxPrice,
            total_items_value: totalValue
          }, {
            where: { id: userId }
          });

          updatedCount++;

          if (updatedCount % 10 === 0) {
            console.log(`📊 Обработано: ${updatedCount}/${usersWithItems.length} пользователей`);
          }
        }

      } catch (userError) {
        console.error(`❌ Ошибка обработки пользователя ${userId}:`, userError.message);
      }
    }

    console.log(`✅ Пересчет завершен! Обновлено ${updatedCount} пользователей`);
    return { updated: updatedCount, total: usersWithItems.length };

  } catch (error) {
    console.error('❌ Ошибка пересчета лучших предметов:', error);
    return { updated: 0, total: 0 };
  }
}

/**
 * Получение статистики по ценам
 */
async function getPriceStatistics() {
  const stats = await db.Item.findAll({
    attributes: [
      'price_source',
      [db.Sequelize.fn('COUNT', db.Sequelize.col('*')), 'count'],
      [db.Sequelize.fn('AVG', db.Sequelize.col('actual_price_rub')), 'avg_price'],
      [db.Sequelize.fn('MAX', db.Sequelize.col('price_last_updated')), 'latest_update']
    ],
    where: {
      is_available: true
    },
    group: 'price_source',
    raw: true
  });

  console.log('\n📊 СТАТИСТИКА ЦЕН:');
  for (const stat of stats) {
    console.log(`${stat.price_source}: ${stat.count} предметов, средняя цена: ₽${parseFloat(stat.avg_price || 0).toFixed(2)}`);
  }

  // Статистика кэша
  const cacheStats = steamPriceService.getCacheStats();
  console.log('\n🗄️ СТАТИСТИКА КЭША:');
  console.log(`Всего записей: ${cacheStats.totalEntries}`);
  console.log(`Актуальных: ${cacheStats.validEntries}`);
  console.log(`Устаревших: ${cacheStats.expiredEntries}`);
  console.log(`Очередь запросов: ${cacheStats.queueLength}`);
  console.log(`Текущий rate limit: ${cacheStats.currentRateLimit}ms`);
}

module.exports = {
  updateAllPrices,
  updateOutdatedPrices,
  recalculateCaseWeights,
  recalculateUserBestItems,
  getPriceStatistics,
  steamPriceService,
  profitabilityCalculator
};

// Запуск если вызван напрямую
if (require.main === module) {
  const command = process.argv[2] || 'outdated';

  console.log('🔄 Запуск обновления цен...');
  console.log(`📊 Steam API ключ: ${process.env.STEAM_API_KEY ? 'Настроен' : 'НЕ НАСТРОЕН'}`);
  console.log(`⚙️ Команда: ${command}\n`);

  let updatePromise;

  switch (command) {
    case 'all':
      updatePromise = updateAllPrices();
      break;
    case 'outdated':
      updatePromise = updateOutdatedPrices();
      break;
    case 'stats':
      updatePromise = getPriceStatistics();
      break;
    default:
      console.error('❌ Неизвестная команда. Используйте: all, outdated, stats');
      process.exit(1);
  }

  updatePromise
    .then((result) => {
      if (result) {
        console.log(`\n🎉 Обновление завершено! Обновлено: ${result.updated}/${result.total}`);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка обновления цен:', error);
      process.exit(1);
    });
}
