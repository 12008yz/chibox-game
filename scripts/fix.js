const db = require('../models');

// Конфигурация для разных типов кейсов
const caseConfigs = {
  // Бесплатные кейсы (ежедневные) - только дешевые предметы
  free: {
    maxItemPrice: 500, // максимальная цена предмета ₽500
    rarityWeights: {
      consumer: 50,     // 50% - самые дешевые
      industrial: 30,   // 30% - дешевые
      milspec: 15,      // 15% - средние
      restricted: 4,    // 4% - дорогие
      classified: 1,    // 1% - очень дорогие
      covert: 0,        // 0% - запрещены
      contraband: 0,    // 0% - запрещены
      exotic: 0         // 0% - запрещены
    }
  },

  // Покупной кейс (₽99) - умеренный баланс
  purchase: {
    maxItemPrice: 2000, // максимальная цена предмета ₽2000
    rarityWeights: {
      consumer: 40,     // 40%
      industrial: 25,   // 25%
      milspec: 20,      // 20%
      restricted: 10,   // 10%
      classified: 4,    // 4%
      covert: 1,        // 1%
      contraband: 0,    // 0%
      exotic: 0         // 0%
    }
  },

  // Премиум кейс (₽499) - сбалансированный
  premium: {
    maxItemPrice: 50000, // максимальная цена предмета ₽50000
    rarityWeights: {
      consumer: 20,     // 20%
      industrial: 20,   // 20%
      milspec: 25,      // 25%
      restricted: 20,   // 20%
      classified: 12,   // 12%
      covert: 2.5,      // 2.5%
      contraband: 0.4,  // 0.4%
      exotic: 0.1       // 0.1%
    }
  }
};

// Маппинг типов кейсов
const caseTypeMapping = {
  'subscription_case': 'free',     // Бесплатные кейсы
  'purchase_case': 'purchase',     // Покупной кейс
  'premium_case': 'premium'        // Премиум кейс
};

async function rebalanceCases() {
  console.log('🎰 Начинаем перебалансировку кейсов CS2');
  console.log('💡 Цель: разбавить кейсы дешевыми предметами для снижения выплат\n');

  try {
    // Получаем все активные кейсы
    const caseTemplates = await db.CaseTemplate.findAll({
      where: { is_active: true },
      include: [{ model: db.Item, as: 'items' }]
    });

    console.log(`📦 Найдено активных кейсов: ${caseTemplates.length}\n`);

    // Получаем все доступные предметы
    const allItems = await db.Item.findAll({
      where: { is_available: true }
    });

    console.log(`🎁 Всего доступных предметов: ${allItems.length}\n`);

    // Группируем предметы по редкости и цене
    const itemsByRarity = {};
    allItems.forEach(item => {
      const rarity = item.rarity;
      const price = parseFloat(item.price || 0);

      if (!itemsByRarity[rarity]) {
        itemsByRarity[rarity] = [];
      }
      itemsByRarity[rarity].push({ ...item.get({ plain: true }), price });
    });

    // Сортируем предметы в каждой редкости по цене (от дешевых к дорогим)
    Object.keys(itemsByRarity).forEach(rarity => {
      itemsByRarity[rarity].sort((a, b) => a.price - b.price);
    });

    console.log('📊 Предметы по редкости:');
    Object.entries(itemsByRarity).forEach(([rarity, items]) => {
      const avgPrice = items.reduce((sum, item) => sum + item.price, 0) / items.length;
      console.log(`   ${rarity}: ${items.length} шт, средняя цена ₽${avgPrice.toFixed(2)}`);
    });
    console.log();

    // Перебалансируем каждый кейс
    for (const caseTemplate of caseTemplates) {
      await rebalanceCase(caseTemplate, itemsByRarity);
    }

    console.log('✅ Перебалансировка завершена!');
    console.log('💡 Запустите скрипт тестирования для проверки результатов: node scripts/fix.js');

  } catch (error) {
    console.error('❌ Ошибка при перебалансировке:', error);
    throw error;
  }
}

async function rebalanceCase(caseTemplate, itemsByRarity) {
  const origin = caseTemplate.items?.[0]?.origin || 'subscription_case';
  const caseType = caseTypeMapping[origin] || 'purchase';
  const config = caseConfigs[caseType];

  console.log(`\n🎲 Перебалансировка кейса: ${caseTemplate.name}`);
  console.log(`   📝 Тип: ${caseType} (${origin})`);
  console.log(`   💰 Цена: ${caseTemplate.price ? `₽${caseTemplate.price}` : 'Бесплатный'}`);
  console.log(`   📊 Текущих предметов: ${caseTemplate.items.length}`);

  // Удаляем все текущие связи
  await db.CaseTemplateItem.destroy({
    where: { case_template_id: caseTemplate.id }
  });

  const newItems = [];
  let totalWeight = 0;

  // Добавляем предметы согласно конфигурации
  Object.entries(config.rarityWeights).forEach(([rarity, weightPercent]) => {
    if (weightPercent === 0 || !itemsByRarity[rarity]) return;

    const availableItems = itemsByRarity[rarity].filter(item =>
      item.price <= config.maxItemPrice
    );

    if (availableItems.length === 0) return;

    // Количество предметов этой редкости (пропорционально весу)
    const itemCount = Math.max(1, Math.round((weightPercent / 100) * 50)); // 50 - базовое количество предметов в кейсе

    for (let i = 0; i < itemCount; i++) {
      // Берем случайный предмет из доступных (с приоритетом к дешевым)
      const index = Math.floor(Math.pow(Math.random(), 2) * availableItems.length); // Квадратичное распределение для приоритета дешевых
      const item = availableItems[index];

      // Рассчитываем вес предмета (дешевые = больший вес)
      const maxPrice = Math.max(...availableItems.map(i => i.price));
      const priceRatio = maxPrice > 0 ? (maxPrice - item.price) / maxPrice : 1;
      const weight = 0.1 + (priceRatio * 2); // От 0.1 до 2.1

      newItems.push({
        item,
        weight: parseFloat(weight.toFixed(3))
      });
      totalWeight += weight;
    }
  });

  console.log(`   ➕ Новых предметов: ${newItems.length}`);
  console.log(`   ⚖️  Общий вес: ${totalWeight.toFixed(3)}`);

  // Создаем новые связи
  const caseTemplateItems = newItems.map(({ item, weight }) => ({
    case_template_id: caseTemplate.id,
    item_id: item.id,
    created_at: new Date(),
    updated_at: new Date()
  }));

  // Обновляем веса предметов
  const itemUpdates = newItems.map(({ item, weight }) =>
    db.Item.update(
      { drop_weight: weight },
      { where: { id: item.id } }
    )
  );

  await Promise.all([
    db.CaseTemplateItem.bulkCreate(caseTemplateItems),
    ...itemUpdates
  ]);

  // Статистика по редкости
  const rarityStats = {};
  newItems.forEach(({ item }) => {
    const rarity = item.rarity;
    if (!rarityStats[rarity]) {
      rarityStats[rarity] = { count: 0, totalPrice: 0, avgWeight: 0 };
    }
    rarityStats[rarity].count++;
    rarityStats[rarity].totalPrice += item.price;
  });

  console.log('   📈 Распределение по редкости:');
  Object.entries(rarityStats).forEach(([rarity, stats]) => {
    const avgPrice = (stats.totalPrice / stats.count).toFixed(2);
    const percentage = ((stats.count / newItems.length) * 100).toFixed(1);
    console.log(`      ${rarity}: ${stats.count} шт (${percentage}%) - Ср. ₽${avgPrice}`);
  });

  // Рассчитываем ожидаемую среднюю выплату
  const expectedPayout = newItems.reduce((sum, { item, weight }) => {
    return sum + (item.price * (weight / totalWeight));
  }, 0);

  console.log(`   💎 Ожидаемая средняя выплата: ₽${expectedPayout.toFixed(2)}`);

  if (caseTemplate.price) {
    const profitMargin = ((caseTemplate.price - expectedPayout) / caseTemplate.price * 100);
    console.log(`   📊 Ожидаемая маржа: ${profitMargin.toFixed(1)}%`);
  }
}

// Экспорт функций
module.exports = {
  rebalanceCases,
  rebalanceCase,
  caseConfigs
};

// Запуск если вызван напрямую
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === '--confirm' || args[0] === '-y') {
    rebalanceCases()
      .then(() => {
        console.log('\n🎉 Готово! Теперь запустите: node scripts/fix.js');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Ошибка:', error);
        process.exit(1);
      });
  } else {
    console.log('🎰 Скрипт перебалансировки кейсов CS2');
    console.log('⚠️  ВНИМАНИЕ: Этот скрипт полностью пересоздаст содержимое всех кейсов!');
    console.log('');
    console.log('Что будет сделано:');
    console.log('• Удалены все текущие предметы из кейсов');
    console.log('• Добавлены новые предметы согласно сбалансированной конфигурации');
    console.log('• Настроены веса для снижения выплат');
    console.log('• Дешевые предметы получат больший вес выпадения');
    console.log('');
    console.log('Для подтверждения запустите:');
    console.log('node scripts/rebalance-cases.js --confirm');
  }
}
