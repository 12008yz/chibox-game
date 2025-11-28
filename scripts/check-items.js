const { sequelize } = require('../config/database');
const db = require('../models');
const Item = db.Item;

async function checkItems() {
  try {
    console.log('Подключение к базе данных...\n');
    await sequelize.authenticate();
    
    // Получаем все предметы из таблицы
    const items = await Item.findAll({
      order: [['id', 'ASC']],
      limit: 300 // Ограничиваем вывод первыми 100 предметами
    });
    
    console.log(`Всего предметов в базе данных: ${items.length}\n`);
    console.log('ID | Название | Редкость | Цена (RUB) | Цена (USD) | В наличии | Торгуемый');
    console.log('─'.repeat(100));
    
    items.forEach(item => {
      console.log(
        `${String(item.id).substring(0, 8).padEnd(10)} | ` +
        `${String(item.name).substring(0, 30).padEnd(30)} | ` +
        `${String(item.rarity || 'N/A').padEnd(10)} | ` +
        `${String(item.price_rub || 'N/A').padEnd(12)} | ` +
        `${String(item.price_usd || 'N/A').padEnd(12)} | ` +
        `${String(item.in_stock ? 'Да' : 'Нет').padEnd(10)} | ` +
        `${String(item.is_tradable ? 'Да' : 'Нет')}`
      );
    });
    
    // Статистика по редкости
    console.log('\n' + '─'.repeat(100));
    console.log('\nСтатистика по редкости:');
    const rarityStats = await Item.findAll({
      attributes: [
        'rarity',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['rarity']
    });
    
    rarityStats.forEach(stat => {
      console.log(`${stat.rarity}: ${stat.dataValues.count} предметов`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при проверке предметов:', error);
    process.exit(1);
  }
}

checkItems();
