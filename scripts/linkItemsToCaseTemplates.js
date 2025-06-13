const db = require('../models');

// Конфигурация соответствия кейсов и их origin
const CASE_ITEM_MAPPING = {
  'Ежедневный кейс (Уровень 1)': 'subscription_case',
  'Ежедневный кейс (Уровень 2)': 'subscription_case',
  'Ежедневный кейс (Уровень 3)': 'subscription_case',
  'Покупной кейс': 'purchase_case',
  'Премиум кейс': 'premium_case'
};

async function linkItemsToCaseTemplates() {
  try {
    console.log('🔗 Начинаем связывание предметов с шаблонами кейсов...\n');

    // Получаем все активные шаблоны кейсов
    const caseTemplates = await db.CaseTemplate.findAll({
      where: {
        is_active: true
      }
    });

    if (caseTemplates.length === 0) {
      console.log('❌ Нет активных шаблонов кейсов');
      return;
    }

    console.log(`📦 Найдено ${caseTemplates.length} активных шаблонов кейсов\n`);

    // Связываем каждый шаблон кейса с соответствующими предметами
    for (const template of caseTemplates) {
      console.log(`\n🎯 Обрабатываем кейс: ${template.name}`);

      // Определяем origin для данного кейса
      let originPattern = CASE_ITEM_MAPPING[template.name];

      if (!originPattern) {
        // Если точного соответствия нет, пытаемся определить по типу
        if (template.name.includes('Ежедневный') || template.type === 'daily') {
          originPattern = 'subscription_case';
        } else if (template.name.includes('Покупной') || template.price && template.price <= 150) {
          originPattern = 'purchase_case';
        } else if (template.name.includes('Премиум') || template.price && template.price > 150) {
          originPattern = 'premium_case';
        } else {
          console.warn(`⚠️  Не удалось определить тип для кейса: ${template.name}, используем все предметы`);
          originPattern = null;
        }
      }

      // Получаем предметы для данного типа кейса
      let whereClause = { is_available: true };
      if (originPattern) {
        whereClause.origin = originPattern;
      }

      const items = await db.Item.findAll({
        where: whereClause
      });

      if (items.length === 0) {
        console.log(`   ❌ Нет предметов с origin: ${originPattern}`);
        continue;
      }

      console.log(`   📋 Найдено ${items.length} предметов для связывания`);

      // Группируем предметы по редкости для отчета
      const itemsByRarity = {};
      items.forEach(item => {
        if (!itemsByRarity[item.rarity]) {
          itemsByRarity[item.rarity] = 0;
        }
        itemsByRarity[item.rarity]++;
      });

      console.log('   📊 Распределение по редкости:');
      Object.entries(itemsByRarity).forEach(([rarity, count]) => {
        console.log(`      ${rarity}: ${count} предметов`);
      });

      // Очищаем текущие связи и добавляем новые
      await template.setItems([]);
      await template.addItems(items);

      console.log(`   ✅ Связано ${items.length} предметов с кейсом: ${template.name}`);
    }

    console.log('\n🎉 Связывание предметов с шаблонами кейсов завершено успешно!');

    // Проверяем результат
    await validateCaseItems();

  } catch (error) {
    console.error('❌ Ошибка при связывании предметов с кейсами:', error);
    throw error;
  }
}

// Функция для проверки корректности связывания
async function validateCaseItems() {
  console.log('\n🔍 ПРОВЕРКА РЕЗУЛЬТАТОВ СВЯЗЫВАНИЯ:\n');

  const caseTemplates = await db.CaseTemplate.findAll({
    where: { is_active: true },
    include: [{
      model: db.Item,
      as: 'items',
      through: { attributes: [] }
    }]
  });

  for (const template of caseTemplates) {
    console.log(`📦 ${template.name}:`);
    console.log(`   Всего предметов: ${template.items.length}`);

    if (template.items.length === 0) {
      console.log('   ❌ НЕТ ПРЕДМЕТОВ! Кейс не будет работать.');
      continue;
    }

    // Группируем по редкости
    const rarityCount = {};
    template.items.forEach(item => {
      if (!rarityCount[item.rarity]) {
        rarityCount[item.rarity] = 0;
      }
      rarityCount[item.rarity]++;
    });

    console.log('   Распределение по редкости:');
    Object.entries(rarityCount).forEach(([rarity, count]) => {
      console.log(`      ${rarity}: ${count}`);
    });

    // Проверяем ценовой диапазон
    const prices = template.items.map(item => parseFloat(item.price)).filter(p => p > 0);
    if (prices.length > 0) {
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      console.log(`   Ценовой диапазон: ₽${minPrice.toFixed(2)} - ₽${maxPrice.toFixed(2)} (средняя: ₽${avgPrice.toFixed(2)})`);
    }

    console.log('   ✅ Кейс готов к использованию\n');
  }
}

// Запуск если вызван напрямую
if (require.main === module) {
  linkItemsToCaseTemplates()
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
  linkItemsToCaseTemplates,
  validateCaseItems
};
