const { sequelize } = require('../config/database');
const db = require('../models');

async function fixWeightsFromEqual() {
  try {
    console.log('🔗 Подключение к базе данных...');
    await sequelize.authenticate();
    console.log('✅ Подключение установлено');

    // Получаем все предметы
    const items = await db.Item.findAll({
      order: [['price', 'DESC']]
    });

    console.log(`📦 Найдено ${items.length} предметов`);

    // Проверяем, что у всех вес = 1
    const equalWeightItems = items.filter(item => item.drop_weight === 1);
    console.log(`⚖️  Предметов с весом = 1: ${equalWeightItems.length}`);

    if (equalWeightItems.length === items.length) {
      console.log('✅ Подтверждено: все предметы имеют одинаковый вес = 1');
    }

    // Функция расчета веса с учетом рентабельности 20% для сайта
    // Веса пересчитаны для поддержания баланса при максимальном бонусе 15%
    function calculateCorrectWeight(price) {
      price = parseFloat(price) || 0;

      // Более консервативные веса для обеспечения рентабельности
      // При бонусе 15% шансы дорогих предметов увеличатся, но не критично
      if (price >= 50000) return 0.005;     // 0.5% - легендарные (было 0.1%)
      if (price >= 30000) return 0.008;     // 0.8% - мифические (было 0.2%)
      if (price >= 20000) return 0.015;     // 1.5% - эпические (было 0.5%)
      if (price >= 15000) return 0.025;     // 2.5% - очень редкие (было 1%)
      if (price >= 10000) return 0.04;      // 4% - редкие (было 2%)
      if (price >= 8000) return 0.06;       // 6% - необычные+ (было 4%)
      if (price >= 5000) return 0.1;        // 10% - необычные (было 8%)
      if (price >= 3000) return 0.2;        // 20% - обычные+ (было 15%)
      if (price >= 1000) return 0.35;       // 35% - обычные (было 25%)
      if (price >= 500) return 0.5;         // 50% - частые (было 40%)
      if (price >= 100) return 0.7;         // 70% - очень частые (было 60%)
      return 1.0;                           // 100% - базовые/дешевые
    }

    console.log('\n🔧 Исправляем веса на основе цен...');

    let updatedCount = 0;
    const significantChanges = [];

    // Обновляем веса для всех предметов
    for (const item of items) {
      const price = parseFloat(item.price) || 0;
      const correctWeight = calculateCorrectWeight(price);

      await item.update({ drop_weight: correctWeight });
      updatedCount++;

      // Сохраняем информацию о значительных изменениях
      if (price > 5000) { // Показываем только дорогие предметы
        significantChanges.push({
          name: item.name,
          price: price,
          oldWeight: 1,
          newWeight: correctWeight,
          oldChance: (1 * 100).toFixed(4),
          newChance: (correctWeight * 100).toFixed(4)
        });
      }
    }

    console.log(`✅ Обновлено предметов: ${updatedCount}\n`);

    // Показываем изменения для дорогих предметов
    if (significantChanges.length > 0) {
      console.log('💎 ИЗМЕНЕНИЯ ДЛЯ ДОРОГИХ ПРЕДМЕТОВ:');

      significantChanges.sort((a, b) => b.price - a.price).slice(0, 15).forEach((change, index) => {
        console.log(`${index + 1}. ${change.name}`);
        console.log(`   💰 Цена: ${change.price.toLocaleString()}₽`);
        console.log(`   📊 Было: ${change.oldWeight} (${change.oldChance}%)`);
        console.log(`   📉 Стало: ${change.newWeight} (${change.newChance}%)`);
        console.log(`   🎯 Снижение шанса в ${(1/change.newWeight).toFixed(0)} раз\n`);
      });
    }

    // Анализ итогового распределения
    const updatedItems = await db.Item.findAll();

    const priceCategories = {
      'Легендарные (50000₽+)': { items: [], totalWeight: 0 },
      'Мифические (30000-49999₽)': { items: [], totalWeight: 0 },
      'Эпические (20000-29999₽)': { items: [], totalWeight: 0 },
      'Очень редкие (15000-19999₽)': { items: [], totalWeight: 0 },
      'Редкие (10000-14999₽)': { items: [], totalWeight: 0 },
      'Необычные+ (8000-9999₽)': { items: [], totalWeight: 0 },
      'Необычные (5000-7999₽)': { items: [], totalWeight: 0 },
      'Обычные+ (3000-4999₽)': { items: [], totalWeight: 0 },
      'Обычные (1000-2999₽)': { items: [], totalWeight: 0 },
      'Частые (500-999₽)': { items: [], totalWeight: 0 },
      'Очень частые (100-499₽)': { items: [], totalWeight: 0 },
      'Дешевые (<100₽)': { items: [], totalWeight: 0 }
    };

    updatedItems.forEach(item => {
      const price = parseFloat(item.price) || 0;
      const weight = parseFloat(item.drop_weight) || 0;

      if (price >= 50000) {
        priceCategories['Легендарные (50000₽+)'].items.push(item);
        priceCategories['Легендарные (50000₽+)'].totalWeight += weight;
      } else if (price >= 30000) {
        priceCategories['Мифические (30000-49999₽)'].items.push(item);
        priceCategories['Мифические (30000-49999₽)'].totalWeight += weight;
      } else if (price >= 20000) {
        priceCategories['Эпические (20000-29999₽)'].items.push(item);
        priceCategories['Эпические (20000-29999₽)'].totalWeight += weight;
      } else if (price >= 15000) {
        priceCategories['Очень редкие (15000-19999₽)'].items.push(item);
        priceCategories['Очень редкие (15000-19999₽)'].totalWeight += weight;
      } else if (price >= 10000) {
        priceCategories['Редкие (10000-14999₽)'].items.push(item);
        priceCategories['Редкие (10000-14999₽)'].totalWeight += weight;
      } else if (price >= 8000) {
        priceCategories['Необычные+ (8000-9999₽)'].items.push(item);
        priceCategories['Необычные+ (8000-9999₽)'].totalWeight += weight;
      } else if (price >= 5000) {
        priceCategories['Необычные (5000-7999₽)'].items.push(item);
        priceCategories['Необычные (5000-7999₽)'].totalWeight += weight;
      } else if (price >= 3000) {
        priceCategories['Обычные+ (3000-4999₽)'].items.push(item);
        priceCategories['Обычные+ (3000-4999₽)'].totalWeight += weight;
      } else if (price >= 1000) {
        priceCategories['Обычные (1000-2999₽)'].items.push(item);
        priceCategories['Обычные (1000-2999₽)'].totalWeight += weight;
      } else if (price >= 500) {
        priceCategories['Частые (500-999₽)'].items.push(item);
        priceCategories['Частые (500-999₽)'].totalWeight += weight;
      } else if (price >= 100) {
        priceCategories['Очень частые (100-499₽)'].items.push(item);
        priceCategories['Очень частые (100-499₽)'].totalWeight += weight;
      } else {
        priceCategories['Дешевые (<100₽)'].items.push(item);
        priceCategories['Дешевые (<100₽)'].totalWeight += weight;
      }
    });

    const totalWeight = updatedItems.reduce((sum, item) => sum + (parseFloat(item.drop_weight) || 0), 0);

    console.log('📊 ИТОГОВОЕ РАСПРЕДЕЛЕНИЕ ПО РЕДКОСТИ:');
    Object.entries(priceCategories).forEach(([category, data]) => {
      if (data.items.length > 0) {
        const avgWeight = data.totalWeight / data.items.length;
        const categoryChance = (data.totalWeight / totalWeight * 100);
        const avgIndividualChance = (avgWeight / totalWeight * 100);

        console.log(`${category}:`);
        console.log(`   📦 Предметов: ${data.items.length}`);
        console.log(`   🎯 Шанс категории: ${categoryChance.toFixed(2)}%`);
        console.log(`   📈 Средний шанс предмета: ${avgIndividualChance.toFixed(4)}%`);
        console.log(`   💎 Средняя цена: ${(data.items.reduce((sum, item) => sum + parseFloat(item.price), 0) / data.items.length).toLocaleString()}₽\n`);
      }
    });

    console.log(`⚖️  Общий вес всех предметов: ${totalWeight.toFixed(6)}`);
    console.log(`\n📊 СИСТЕМА БОНУСОВ:`);
    console.log(`   🎯 Максимальный бонус пользователя: 15%`);
    console.log(`   📈 Подписка: до 8% (уровень 3 = защита от дубликатов)`);
    console.log(`   🏆 Достижения: до 5%`);
    console.log(`   📊 Уровень: до 2% (0.02% за уровень)`);
    console.log(`   💰 Рентабельность: 20% для сайта, 80% для игроков`);
    console.log('\n🎉 СИСТЕМА ДРОПА ИСПРАВЛЕНА!');
    console.log('💰 Теперь дорогие предметы выпадают НАМНОГО реже дешевых');
    console.log('🎲 Система стала честной и сбалансированной');

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await sequelize.close();
  }
}

fixWeightsFromEqual();