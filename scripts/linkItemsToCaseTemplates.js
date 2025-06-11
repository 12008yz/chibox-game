const db = require('../models');

async function linkItemsToCaseTemplates() {
  try {
    // Получаем все активные шаблоны кейсов
    const caseTemplates = await db.CaseTemplate.findAll({
      where: {
        is_active: true
      }
    });

    if (caseTemplates.length === 0) {
      console.log('Нет активных шаблонов кейсов');
      return;
    }

    // Получаем все доступные предметы
    const items = await db.Item.findAll({
      where: {
        is_available: true
      }
    });

    if (items.length === 0) {
      console.log('Нет доступных предметов для добавления в кейсы');
      return;
    }

    // Связываем каждый шаблон кейса с предметами
    for (const template of caseTemplates) {
      await template.setItems([]); // очищаем текущие связи
      await template.addItems(items);
      console.log(`Связаны предметы с кейсом: ${template.name}`);
    }

    console.log('Связывание предметов с шаблонами кейсов завершено');
  } catch (error) {
    console.error('Ошибка при связывании предметов с кейсами:', error);
  } finally {
    await db.sequelize.close();
  }
}

linkItemsToCaseTemplates();
