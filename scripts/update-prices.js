const db = require('../models');
const SteamPriceService = require('../services/steamPriceService');
const ProfitabilityCalculator = require('../utils/profitabilityCalculator');
const logger = require('../utils/logger');

// Инициализируем сервисы
const steamPriceService = new SteamPriceService(process.env.STEAM_API_KEY);
const profitabilityCalculator = new ProfitabilityCalculator(0.2);

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

      const promises = batch.map(async (item) => {
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
            console.log(`⚠️ ${item.steam_market_hash_name}: цена недоступна`);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ ${item.steam_market_hash_name}: ${error.message}`);
        }
      });

      await Promise.all(promises);

      // Пауза между батчами
      if (i + batchSize < items.length) {
        console.log('⏳ Пауза между батчами...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n📊 РЕЗУЛЬТАТЫ ОБНОВЛЕНИЯ:');
    console.log(`✅ Обновлено: ${updatedCount}`);
    console.log(`❌ Ошибок: ${errorCount}`);
    console.log(`📈 Успешность: ${((updatedCount / items.length) * 100).toFixed(1)}%`);

    // Пересчитываем веса после обновления цен
    console.log('\n⚖️ Пересчитываем веса кейсов...');
    await recalculateCaseWeights();

    // Очищаем кэш
    steamPriceService.cleanExpiredCache();

    console.log('\n🎉 Обновление цен завершено!');
    return { updated: updatedCount, errors: errorCount, total: items.length };

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
    const itemsByCase = {};
    for (const item of items) {
      const caseType = item.origin.replace('_case', '');
      if (!itemsByCase[caseType]) {
        itemsByCase[caseType] = {};
      }
      if (!itemsByCase[caseType][item.rarity]) {
        itemsByCase[caseType][item.rarity] = [];
      }
      itemsByCase[caseType][item.rarity].push(item);
    }

    // Базовые конфигурации кейсов
    const caseConfigs = {
      purchase: { price: 99, name: 'Покупной кейс' },
      premium: { price: 499, name: 'Премиум кейс' }
    };

    // Пересчитываем веса для платных кейсов
    for (const [caseType, config] of Object.entries(caseConfigs)) {
      if (itemsByCase[caseType]) {
        console.log(`🎯 Пересчитываем веса для: ${config.name}`);

        const optimization = profitabilityCalculator.calculateOptimalWeights(
          itemsByCase[caseType],
          config.price
        );

        if (optimization.isOptimal) {
          // Обновляем веса в базе данных
          await updateWeightsInDatabase(itemsByCase[caseType], optimization.weights);
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
  for (const [category, items] of Object.entries(itemsByCategory)) {
    const baseWeight = weights[category] || 1;

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

  for (const item of items) {
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
        }

        // Обновляем категорию если изменилась
        if (item.rarity !== priceData.category) {
          updates.rarity = priceData.category;
        }

        await db.Item.update(updates, {
          where: { id: item.id }
        });

        updatedCount++;
        console.log(`✅ ${item.steam_market_hash_name}: ₽${priceData.price_rub}`);
      } else {
        errorCount++;
        console.log(`❌ ${item.steam_market_hash_name}: цена недоступна`);
      }
    } catch (error) {
      errorCount++;
      console.error(`❌ ${item.steam_market_hash_name}: ${error.message}`);
    }
  }

  return { updated: updatedCount, errors: errorCount, total: items.length };
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
