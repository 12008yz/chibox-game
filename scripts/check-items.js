const { sequelize } = require('../config/database');
const db = require('../models');
const Item = db.Item;

async function checkItems() {
  try {
    console.log('Подключение к базе данных...\n');
    await sequelize.authenticate();

    const items = await Item.findAll({
      order: [['price', 'ASC']],
      attributes: ['id', 'name', 'price', 'actual_price_rub', 'rarity', 'in_stock']
    });

    console.log(`Всего предметов: ${items.length}\n`);
    console.log('ID | Название | Цена (USD) | Цена (RUB) | Редкость | В наличии');
    console.log('─'.repeat(130));

    items.forEach(item => {
      console.log(
        `${String(item.id).substring(0, 36).padEnd(36)} | ` +
        `${String(item.name).substring(0, 35).padEnd(35)} | ` +
        `${String(item.price || 'N/A').padStart(10)} | ` +
        `${String(item.actual_price_rub || 'N/A').padStart(10)} | ` +
        `${String(item.rarity || 'N/A').padEnd(10)} | ` +
        `${String(item.in_stock ? 'Да' : 'Нет')}`
      );
    });

    process.exit(0);
  } catch (error) {
    console.error('Ошибка:', error);
    process.exit(1);
  }
}

checkItems();
