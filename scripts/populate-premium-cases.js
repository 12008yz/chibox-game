const { sequelize, Item, CaseTemplate } = require('../models');
const { Op } = require('sequelize');

// ===============================
// КОНФИГУРАЦИЯ КЕЙСОВ И ИХ НАПОЛНЕНИЯ
// ===============================

const CASE_CONFIGS = [
  {
    id: '88888888-8888-8888-8888-888888888888',
    name: 'Ночной дозор',
    price: 17,
    // Для дешевого кейса: 85% дешевых, 12% средних, 3% дорогих
    priceRanges: [
      { min: 5, max: 50, count: 60 },      // 60 дешевых предметов
      { min: 50, max: 200, count: 15 },     // 15 средних
      { min: 200, max: 500, count: 5 }      // 5 дорогих
    ]
  },
  {
    id: '99999999-9999-9999-9999-999999999999',
    name: 'Пушистый кейс',
    price: 49,
    // 70% дешевых, 22% средних, 8% дорогих
    priceRanges: [
      { min: 8, max: 80, count: 50 },
      { min: 80, max: 300, count: 20 },
      { min: 300, max: 800, count: 10 }
    ]
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Санитарный набор',
    price: 101,
    // СПЕЦИАЛЬНАЯ КОНФИГУРАЦИЯ: 16 предметов (12 дешевых + 4 дорогих)
    priceRanges: [
      { min: 10, max: 100, count: 12 },     // 12 дешевых (75%)
      { min: 500, max: 5000, count: 4 }     // 4 дорогих (25%)
    ]
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Платиновый кейс',
    price: 250,
    // 50% дешевых, 35% средних, 15% дорогих
    priceRanges: [
      { min: 20, max: 200, count: 35 },
      { min: 200, max: 800, count: 30 },
      { min: 800, max: 2500, count: 15 }
    ]
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    name: 'Космический кейс',
    price: 601,
    // СПЕЦИАЛЬНАЯ КОНФИГУРАЦИЯ: 16 предметов (12 дешевых + 4 дорогих)
    priceRanges: [
      { min: 30, max: 300, count: 12 },     // 12 дешевых (75%)
      { min: 1500, max: 10000, count: 4 }   // 4 дорогих (25%)
    ]
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    name: 'Морской кейс',
    price: 998,
    // 30% дешевых, 45% средних, 25% дорогих
    priceRanges: [
      { min: 50, max: 500, count: 25 },
      { min: 500, max: 2000, count: 35 },
      { min: 2000, max: 10000, count: 20 }
    ]
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    name: 'Чешуйчатый кейс',
    price: 2499,
    // СПЕЦИАЛЬНАЯ КОНФИГУРАЦИЯ: 16 предметов (12 дешевых + 4 дорогих)
    priceRanges: [
      { min: 100, max: 1000, count: 12 },   // 12 дешевых (75%)
      { min: 5000, max: 20000, count: 4 }   // 4 дорогих (25%)
    ]
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    name: 'Бурый кейс',
    price: 5000,
    // 10% дешевых, 50% средних, 40% дорогих
    priceRanges: [
      { min: 200, max: 1000, count: 10 },
      { min: 1000, max: 5000, count: 35 },
      { min: 5000, max: 25000, count: 30 }
    ]
  },
  {
    id: '10101010-1010-1010-1010-101010101010',
    name: 'Демонический кейс',
    price: 10000,
    // 5% дешевых, 45% средних, 50% дорогих
    priceRanges: [
      { min: 500, max: 2000, count: 5 },
      { min: 2000, max: 10000, count: 30 },
      { min: 10000, max: 50000, count: 35 }
    ]
  }
];

// ===============================
// ОСНОВНАЯ ФУНКЦИЯ
// ===============================

async function populatePremiumCases() {
  try {
    console.log('🎯 ЗАПОЛНЕНИЕ ПРЕМИУМ КЕЙСОВ ПРЕДМЕТАМИ\n');

    for (const config of CASE_CONFIGS) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📦 Обрабатываем: ${config.name} (${config.price} chiCoins)`);
      console.log(`${'='.repeat(80)}\n`);

      // Находим кейс
      const caseTemplate = await CaseTemplate.findOne({
        where: { id: config.id }
      });

      if (!caseTemplate) {
        console.error(`❌ Кейс не найден: ${config.name} (ID: ${config.id})`);
        continue;
      }

      let allSelectedItems = [];

      // Подбираем предметы для каждого ценового диапазона
      for (const range of config.priceRanges) {
        console.log(`\n💰 Подбираем предметы в диапазоне ₽${range.min}-${range.max} (нужно: ${range.count})`);

        const itemsInRange = await Item.findAll({
          where: {
            price: {
              [Op.between]: [range.min, range.max]
            },
            is_available: true
          },
          attributes: ['id', 'name', 'rarity', 'price'],
          order: sequelize.random(),
          limit: range.count * 2 // Берем с запасом
        });

        if (itemsInRange.length === 0) {
          console.warn(`⚠️  Не найдено предметов в диапазоне ₽${range.min}-${range.max}`);
          continue;
        }

        console.log(`   ✅ Найдено ${itemsInRange.length} предметов`);

        // Выбираем случайные предметы
        const selectedFromRange = getRandomItems(itemsInRange, range.count);
        allSelectedItems = allSelectedItems.concat(selectedFromRange);

        const avgPrice = selectedFromRange.reduce((sum, item) => sum + parseFloat(item.price), 0) / selectedFromRange.length;
        console.log(`   📊 Выбрано ${selectedFromRange.length} предметов, средняя цена: ₽${avgPrice.toFixed(2)}`);
      }

      if (allSelectedItems.length === 0) {
        console.error(`❌ Не удалось подобрать предметы для кейса ${config.name}`);
        continue;
      }

      // Добавляем предметы в кейс
      await caseTemplate.setItems(allSelectedItems);

      // Статистика
      console.log(`\n📊 ИТОГОВАЯ СТАТИСТИКА ДЛЯ "${config.name}":`);
      console.log(`   📦 Всего предметов: ${allSelectedItems.length}`);

      const totalPrice = allSelectedItems.reduce((sum, item) => sum + parseFloat(item.price), 0);
      const avgPrice = totalPrice / allSelectedItems.length;
      const minPrice = Math.min(...allSelectedItems.map(item => parseFloat(item.price)));
      const maxPrice = Math.max(...allSelectedItems.map(item => parseFloat(item.price)));

      console.log(`   💰 Средняя цена предмета: ₽${avgPrice.toFixed(2)}`);
      console.log(`   💰 Минимальная цена: ₽${minPrice.toFixed(2)}`);
      console.log(`   💰 Максимальная цена: ₽${maxPrice.toFixed(2)}`);

      // Распределение по редкости
      const rarityDistribution = {};
      allSelectedItems.forEach(item => {
        rarityDistribution[item.rarity] = (rarityDistribution[item.rarity] || 0) + 1;
      });

      console.log(`   📋 Распределение по редкости:`);
      Object.entries(rarityDistribution).forEach(([rarity, count]) => {
        const percentage = (count / allSelectedItems.length * 100).toFixed(1);
        console.log(`      ${rarity}: ${count} предметов (${percentage}%)`);
      });

      // Расчет теоретического RTP
      const theoreticalRTP = (avgPrice / config.price) * 100;
      console.log(`   🎲 Теоретический RTP: ${theoreticalRTP.toFixed(2)}%`);

      console.log(`\n✅ Кейс "${config.name}" успешно заполнен!`);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('🎉 ВСЕ КЕЙСЫ УСПЕШНО ЗАПОЛНЕНЫ!');
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ Ошибка при заполнении кейсов:', error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

// ===============================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ===============================

function getRandomItems(items, count) {
  if (items.length === 0 || count <= 0) return [];

  // Перемешиваем массив и берем нужное количество
  const shuffled = [...items].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, items.length));
}

// Запуск скрипта
console.log('🚀 Запуск скрипта заполнения премиум кейсов...\n');
populatePremiumCases();

