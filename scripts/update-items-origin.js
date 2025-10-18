const db = require('../models');

// Функция для связывания предметов с шаблонами кейсов
async function linkItemsToCaseTemplates() {
  console.log('\n🔗 Связываем предметы с шаблонами кейсов...\n');

  try {
    const caseTemplates = await db.CaseTemplate.findAll({
      where: { is_active: true }
    });

    // Получаем ВСЕ доступные предметы
    const allItems = await db.Item.findAll({
      where: { is_available: true }
    });

    console.log(`📊 Всего доступных предметов: ${allItems.length}\n`);

    for (const template of caseTemplates) {
      console.log(`🎯 Обрабатываем кейс: ${template.name}`);

      let items = [];

      // Распределяем предметы по кейсам в зависимости от их цены
      switch(template.name) {
        case 'Ежедневный кейс - Бесплатный':
          // Дешевые предметы (до 50₽)
          items = allItems.filter(item => item.price <= 50);
          break;

        case 'Ежедневный кейс - Статус':
          // Дешевые и средние предметы (до 150₽)
          items = allItems.filter(item => item.price <= 150);
          break;

        case 'Ежедневный кейс - Статус+':
          // Средние предметы (до 800₽)
          items = allItems.filter(item => item.price <= 800);
          break;

        case 'Ежедневный кейс - Статус++':
          // Дорогие предметы (до 5000₽)
          items = allItems.filter(item => item.price <= 5000);
          break;

        case 'Бонусный кейс':
          // Средние и хорошие предметы (30₽ - 1000₽)
          items = allItems.filter(item => item.price >= 30 && item.price <= 1000);
          break;

        case 'Стандартный кейс':
          // Средние предметы для покупного кейса (30₽ - 500₽)
          items = allItems.filter(item => item.price >= 30 && item.price <= 500);
          break;

        case 'Премиум кейс':
          // Дорогие предметы (от 100₽)
          items = allItems.filter(item => item.price >= 100);
          break;

        default:
          console.warn(`⚠️ Неизвестный кейс: ${template.name}`);
          continue;
      }

      if (items.length === 0) {
        console.log(`   ❌ Нет предметов для кейса: ${template.name}`);
        continue;
      }

      // Очищаем старые связи и добавляем новые
      await template.setItems([]);
      await template.addItems(items);

      console.log(`   ✅ Связано ${items.length} предметов с кейсом: ${template.name}`);
    }

    console.log('\n🎉 Связывание завершено успешно!');
  } catch (error) {
    console.error('❌ Ошибка при связывании предметов с кейсами:', error);
    throw error;
  }
}

// Запуск
if (require.main === module) {
  linkItemsToCaseTemplates()
    .then(() => {
      console.log('\n✅ Скрипт выполнен успешно!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка:', error);
      process.exit(1);
    });
}

module.exports = { linkItemsToCaseTemplates };
