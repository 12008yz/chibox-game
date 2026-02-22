const { sequelize, Item, CaseTemplate } = require('../models');
const { Op } = require('sequelize');

// Конфигурация кейсов с правильным распределением
const CASE_CONFIGS = [
  {
    id: '88888888-8888-8888-8888-888888888888',
    name: 'Ночной дозор',
    price: 17,
    // 30 предметов, RTP ~70%
    priceRanges: [
      { min: 5, max: 25, count: 12 },      // Дешевые (40%)
      { min: 25, max: 60, count: 10 },     // Средние (33%)
      { min: 60, max: 120, count: 5 },     // Хорошие (17%)
      { min: 120, max: 250, count: 3 }     // Отличные (10%)
    ]
  },
  {
    id: '99999999-9999-9999-9999-999999999999',
    name: 'Пушистый кейс',
    price: 49,
    // 25 предметов, RTP ~70%
    priceRanges: [
      { min: 10, max: 35, count: 8 },      // Дешевые (32%)
      { min: 35, max: 100, count: 10 },    // Средние (40%)
      { min: 100, max: 250, count: 5 },    // Хорошие (20%)
      { min: 250, max: 500, count: 2 }     // Отличные (8%)
    ]
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Санитарный набор',
    price: 101,
    // Добавляем 10 предметов к существующим
    priceRanges: [
      { min: 100, max: 200, count: 2 },    // Средние
      { min: 200, max: 500, count: 4 },    // Дорогие
      { min: 500, max: 1200, count: 3 },   // Очень дорогие
      { min: 1200, max: 3000, count: 1 }   // Ультра дорогой
    ],
    mode: 'add' // Добавляем к существующим
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    name: 'Космический кейс',
    price: 601,
    // Добавляем 15 предметов к существующим
    priceRanges: [
      { min: 200, max: 400, count: 3 },    // Средние
      { min: 400, max: 800, count: 4 },    // Дорогие
      { min: 800, max: 2000, count: 5 },   // Очень дорогие
      { min: 2000, max: 6000, count: 3 }  // Ультра дорогие
    ],
    mode: 'add' // Добавляем к существующим
  }
];

async function updateCasesItems() {
  try {
    console.log('🎯 ОБНОВЛЕНИЕ ПРЕДМЕТОВ В КЕЙСАХ\n');
    console.log('='.repeat(80));

    // Обрабатываем каждый кейс
    for (const config of CASE_CONFIGS) {
      console.log('\n' + '='.repeat(80));
      console.log(`📦 Обрабатываем: ${config.name} (${config.price}₽)`);
      console.log('='.repeat(80));

      const caseTemplate = await CaseTemplate.findOne({
        where: { id: config.id },
        include: [{
          model: Item,
          as: 'items',
          through: { attributes: [] }
        }]
      });

      if (!caseTemplate) {
        console.error(`❌ Кейс не найден: ${config.name} (ID: ${config.id})`);
        continue;
      }

      console.log(`📋 Текущее количество предметов: ${caseTemplate.items.length}`);

      let allSelectedItems = [];

      // Подбираем предметы для каждого ценового диапазона
      for (const range of config.priceRanges) {
        console.log(`\n💰 Подбираем предметы в диапазоне ₽${range.min}-${range.max} (нужно: ${range.count})`);

        // Получаем предметы из БД по ценовому диапазону
        const itemsInRange = await Item.findAll({
          where: {
            price: {
              [Op.between]: [range.min, range.max]
            },
            is_available: true
          },
          attributes: ['id', 'name', 'rarity', 'price'],
          order: sequelize.random(),
          limit: range.count * 2 // Берем с запасом для случайного выбора
        });

        if (itemsInRange.length === 0) {
          console.warn(`⚠️  Не найдено доступных предметов в диапазоне ₽${range.min}-${range.max}`);
          continue;
        }

        console.log(`   ✅ Найдено ${itemsInRange.length} доступных предметов`);

        // Выбираем случайные предметы
        const selectedFromRange = getRandomItems(itemsInRange, range.count);
        allSelectedItems = allSelectedItems.concat(selectedFromRange);

        const avgPrice = selectedFromRange.length > 0
          ? selectedFromRange.reduce((sum, item) => sum + parseFloat(item.price), 0) / selectedFromRange.length
          : 0;
        console.log(`   📊 Выбрано ${selectedFromRange.length} предметов, средняя цена: ₽${avgPrice.toFixed(2)}`);

        // Показываем примеры выбранных предметов
        if (selectedFromRange.length > 0) {
          console.log(`   📝 Примеры:`);
          selectedFromRange.slice(0, 3).forEach(item => {
            console.log(`      - ${item.name.substring(0, 50).padEnd(50)} | ${parseFloat(item.price).toFixed(2)}₽`);
          });
        }
      }

      if (allSelectedItems.length === 0) {
        console.error(`❌ Не удалось подобрать предметы для кейса ${config.name}`);
        continue;
      }

      // Применяем изменения
      if (config.mode === 'add') {
        // Добавляем к существующим
        const existingItemIds = caseTemplate.items.map(item => item.id);
        const newItems = allSelectedItems.filter(item => !existingItemIds.includes(item.id));
        
        if (newItems.length > 0) {
          await caseTemplate.addItems(newItems);
          console.log(`\n➕ Добавлено ${newItems.length} новых предметов к существующим ${caseTemplate.items.length}`);
          
          // Перезагружаем для статистики
          await caseTemplate.reload({
            include: [{
              model: Item,
              as: 'items',
              through: { attributes: [] }
            }]
          });
        } else {
          console.log(`\n⚠️  Все выбранные предметы уже есть в кейсе`);
        }
      } else {
        // Заменяем все предметы
        await caseTemplate.setItems(allSelectedItems);
        console.log(`\n🔄 Заменены все предметы в кейсе`);
      }

      // Финальная статистика
      await caseTemplate.reload({
        include: [{
          model: Item,
          as: 'items',
          through: { attributes: [] }
        }]
      });

      const finalItems = caseTemplate.items;
      console.log(`\n📊 ИТОГОВАЯ СТАТИСТИКА ДЛЯ "${config.name}":`);
      console.log(`   📦 Всего предметов: ${finalItems.length}`);

      const prices = finalItems.map(item => parseFloat(item.price)).filter(p => p > 0);
      if (prices.length > 0) {
        const totalPrice = prices.reduce((sum, p) => sum + p, 0);
        const avgPrice = totalPrice / prices.length;
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        console.log(`   💰 Средняя цена предмета: ₽${avgPrice.toFixed(2)}`);
        console.log(`   💰 Минимальная цена: ₽${minPrice.toFixed(2)}`);
        console.log(`   💰 Максимальная цена: ₽${maxPrice.toFixed(2)}`);

        // Расчет теоретического RTP
        const theoreticalRTP = (avgPrice / config.price) * 100;
        console.log(`   🎲 Теоретический RTP: ${theoreticalRTP.toFixed(2)}%`);

        // Распределение по ценовым категориям
        const priceCategories = {
          'Дешевые (<50₽)': prices.filter(p => p < 50).length,
          'Средние (50-200₽)': prices.filter(p => p >= 50 && p < 200).length,
          'Дорогие (200-600₽)': prices.filter(p => p >= 200 && p < 600).length,
          'Очень дорогие (600-2000₽)': prices.filter(p => p >= 600 && p < 2000).length,
          'Ультра дорогие (2000+₽)': prices.filter(p => p >= 2000).length
        };

        console.log(`   📋 Распределение по ценам:`);
        Object.entries(priceCategories).forEach(([category, count]) => {
          if (count > 0) {
            const percentage = (count / prices.length * 100).toFixed(1);
            console.log(`      ${category}: ${count} предметов (${percentage}%)`);
          }
        });
      }

      console.log(`\n✅ Кейс "${config.name}" успешно обновлен!`);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('🎉 ВСЕ КЕЙСЫ УСПЕШНО ОБНОВЛЕНЫ!');
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ Ошибка при обновлении кейсов:', error);
    console.error(error.stack);
    throw error;
  } finally {
    await sequelize.close();
  }
}

function getRandomItems(items, count) {
  if (items.length === 0 || count <= 0) return [];

  // Перемешиваем массив и берем нужное количество
  const shuffled = [...items].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, items.length));
}

// Запуск скрипта
if (require.main === module) {
  updateCasesItems()
    .then(() => {
      console.log('\n✅ Скрипт выполнен успешно!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Ошибка выполнения скрипта:', error);
      process.exit(1);
    });
}

module.exports = { updateCasesItems };
