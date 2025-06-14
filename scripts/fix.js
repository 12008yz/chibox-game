const db = require('../models');

// Целевая доходность казино для премиум кейса
const TARGET_HOUSE_EDGE = 0.20; // 20%
const PREMIUM_CASE_PRICE = 499;
const TARGET_AVG_VALUE = PREMIUM_CASE_PRICE * (1 - TARGET_HOUSE_EDGE); // ₽399.2

async function optimizePremiumCase() {
  try {
    console.log('🎯 АГРЕССИВНАЯ ОПТИМИЗАЦИЯ ПРЕМИУМ КЕЙСА\n');

    // Получаем все предметы, отсортированные по цене
    const allItems = await db.Item.findAll({
      where: { is_available: true },
      order: [['price', 'ASC']]
    });

    console.log(`📦 Всего доступных предметов: ${allItems.length}\n`);

    // Группируем предметы по ценовым диапазонам
    const priceRanges = {
      'ultra_cheap': allItems.filter(item => parseFloat(item.price) <= 10), // ≤ ₽10
      'cheap': allItems.filter(item => parseFloat(item.price) > 10 && parseFloat(item.price) <= 50), // ₽10-50
      'low': allItems.filter(item => parseFloat(item.price) > 50 && parseFloat(item.price) <= 200), // ₽50-200
      'medium': allItems.filter(item => parseFloat(item.price) > 200 && parseFloat(item.price) <= 500), // ₽200-500
      'high': allItems.filter(item => parseFloat(item.price) > 500 && parseFloat(item.price) <= 2000), // ₽500-2000
      'expensive': allItems.filter(item => parseFloat(item.price) > 2000) // > ₽2000
    };

    console.log('💰 Распределение предметов по ценовым диапазонам:');
    Object.entries(priceRanges).forEach(([range, items]) => {
      const avgPrice = items.length > 0 ?
        items.reduce((sum, item) => sum + parseFloat(item.price), 0) / items.length : 0;
      console.log(`   ${range}: ${items.length} предметов (средняя цена: ₽${avgPrice.toFixed(2)})`);
    });

    // Получаем премиум кейс
    const caseTemplate = await db.CaseTemplate.findOne({
      where: { name: 'Премиум кейс' },
      include: [{
        model: db.Item,
        as: 'items',
        through: { attributes: [] }
      }]
    });

    if (!caseTemplate) {
      console.log('❌ Премиум кейс не найден');
      return;
    }

    const currentItems = caseTemplate.items || [];
    console.log(`\n📋 Текущее количество предметов: ${currentItems.length}`);

    if (currentItems.length === 0) {
      console.log('⚠️ В кейсе нет предметов, пропускаем оптимизацию');
      return;
    }

    // Рассчитываем текущую среднюю стоимость
    const currentAvgValue = currentItems.reduce((sum, item) => sum + parseFloat(item.price), 0) / currentItems.length;
    const currentHouseEdge = (1 - currentAvgValue / PREMIUM_CASE_PRICE) * 100;

    console.log(`📊 Текущая средняя стоимость: ₽${currentAvgValue.toFixed(2)}`);
    console.log(`📊 Текущая доходность казино: ${currentHouseEdge.toFixed(2)}%`);
    console.log(`🎯 Целевая средняя стоимость: ₽${TARGET_AVG_VALUE.toFixed(2)}`);

    // Создаем новый оптимизированный список предметов
    const optimizedItems = createOptimizedItemList(priceRanges, currentItems);

    if (optimizedItems.length === 0) {
      console.log('❌ Не удалось создать оптимизированный список предметов');
      return;
    }

    // Рассчитываем новые метрики
    const newAvgValue = optimizedItems.reduce((sum, item) => sum + parseFloat(item.price), 0) / optimizedItems.length;
    const newHouseEdge = (1 - newAvgValue / PREMIUM_CASE_PRICE) * 100;

    console.log(`\n✨ РЕЗУЛЬТАТЫ ОПТИМИЗАЦИИ:`);
    console.log(`📊 Новое количество предметов: ${optimizedItems.length}`);
    console.log(`📊 Новая средняя стоимость: ₽${newAvgValue.toFixed(2)}`);
    console.log(`📊 Новая доходность казино: ${newHouseEdge.toFixed(2)}%`);

    // Показываем распределение по ценовым диапазонам
    const distribution = {};
    optimizedItems.forEach(item => {
      const price = parseFloat(item.price);
      const range = getPriceRange(price);
      distribution[range] = (distribution[range] || 0) + 1;
    });

    console.log(`\n📋 Распределение предметов по ценовым диапазонам:`);
    Object.entries(distribution).forEach(([range, count]) => {
      const percentage = (count / optimizedItems.length * 100).toFixed(1);
      console.log(`   ${range}: ${count} предметов (${percentage}%)`);
    });

    // Обновляем кейс в базе данных
    await caseTemplate.setItems(optimizedItems);
    console.log(`\n✅ Премиум кейс успешно оптимизирован!`);

  } catch (error) {
    console.error('❌ Ошибка при оптимизации премиум кейса:', error);
    throw error;
  }
}

function createOptimizedItemList(priceRanges, currentItems) {
  const optimizedItems = [];

  // Стратегия: создаем сбалансированный микс предметов
  // 40% - дешевые предметы (≤₽50)
  // 30% - средние предметы (₽50-500)
  // 20% - дорогие предметы (₽500-2000)
  // 10% - премиум предметы (>₽2000)

  const totalTargetItems = 80; // Увеличиваем общее количество для разбавления

  // Дешевые предметы (40%)
  const cheapCount = Math.floor(totalTargetItems * 0.4);
  const ultraCheapItems = getRandomItems(priceRanges.ultra_cheap, Math.floor(cheapCount * 0.7));
  const cheapItems = getRandomItems(priceRanges.cheap, Math.floor(cheapCount * 0.3));
  optimizedItems.push(...ultraCheapItems, ...cheapItems);

  // Средние предметы (30%)
  const mediumCount = Math.floor(totalTargetItems * 0.3);
  const lowItems = getRandomItems(priceRanges.low, Math.floor(mediumCount * 0.6));
  const mediumItems = getRandomItems(priceRanges.medium, Math.floor(mediumCount * 0.4));
  optimizedItems.push(...lowItems, ...mediumItems);

  // Дорогие предметы (20%)
  const highCount = Math.floor(totalTargetItems * 0.2);
  const highItems = getRandomItems(priceRanges.high, highCount);
  optimizedItems.push(...highItems);

  // Премиум предметы (10%) - только самые дешевые из дорогих
  const premiumCount = Math.floor(totalTargetItems * 0.1);
  const expensiveItems = priceRanges.expensive.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  const premiumItems = getRandomItems(expensiveItems.slice(0, 20), premiumCount); // Берем только 20 самых дешевых из дорогих
  optimizedItems.push(...premiumItems);

  // Убираем дубликаты
  const uniqueItems = optimizedItems.filter((item, index, self) =>
    index === self.findIndex(t => t.id === item.id)
  );

  return uniqueItems;
}

function getRandomItems(items, count) {
  if (items.length === 0 || count <= 0) return [];

  const shuffled = [...items].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, items.length));
}

function getPriceRange(price) {
  if (price <= 10) return 'ultra_cheap (≤₽10)';
  if (price <= 50) return 'cheap (₽10-50)';
  if (price <= 200) return 'low (₽50-200)';
  if (price <= 500) return 'medium (₽200-500)';
  if (price <= 2000) return 'high (₽500-2000)';
  return 'expensive (>₽2000)';
}

// Запуск если вызван напрямую
if (require.main === module) {
  optimizePremiumCase()
    .then(() => {
      console.log('\n✅ Скрипт выполнен успешно!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Ошибка выполнения скрипта:', error);
      process.exit(1);
    })
    .finally(() => {
      db.sequelize.close();
    });
}

module.exports = {
  optimizePremiumCase
};
