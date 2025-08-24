const db = require('../models');

// Функция для создания URL страницы Steam Market из market_hash_name
function createMarketPageUrl(marketHashName) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
}

// Основная функция для исправления URL изображений
async function fixImageUrls() {
  console.log('🔧 Начинаем исправление URL изображений...\n');

  try {
    // Находим все предметы с прямыми ссылками на изображения Steam
    const items = await db.Item.findAll({
      where: {
        image_url: {
          [db.Sequelize.Op.like]: '%steamstatic.com%'
        },
        steam_market_hash_name: {
          [db.Sequelize.Op.not]: null
        }
      }
    });

    console.log(`🔍 Найдено ${items.length} предметов для обновления`);

    let updated = 0;
    let errors = 0;

    for (const item of items) {
      try {
        // Создаем новый URL страницы Steam Market
        const newImageUrl = createMarketPageUrl(item.steam_market_hash_name);

        // Обновляем запись
        await item.update({ image_url: newImageUrl });

        updated++;
        console.log(`✅ ${updated}/${items.length} Обновлен: ${item.name}`);
        console.log(`   Старый URL: ${item.image_url}`);
        console.log(`   Новый URL: ${newImageUrl}\n`);

      } catch (error) {
        errors++;
        console.error(`❌ Ошибка для ${item.name}:`, error.message);
      }
    }

    console.log('\n🎉 Исправление завершено!');
    console.log(`📊 Статистика:`);
    console.log(`   ✅ Успешно обновлено: ${updated}`);
    console.log(`   ❌ Ошибок: ${errors}`);
    console.log(`   📋 Всего обработано: ${items.length}`);

  } catch (error) {
    console.error('❌ Критическая ошибка:', error.message);
  }
}

// Функция для проверки текущего состояния
async function checkCurrentState() {
  console.log('🔍 Проверяем текущее состояние базы данных...\n');

  try {
    const totalItems = await db.Item.count();

    const steamImageItems = await db.Item.count({
      where: {
        image_url: {
          [db.Sequelize.Op.like]: '%steamstatic.com%'
        }
      }
    });

    const marketPageItems = await db.Item.count({
      where: {
        image_url: {
          [db.Sequelize.Op.like]: '%steamcommunity.com/market/listings%'
        }
      }
    });

    const nullImageItems = await db.Item.count({
      where: {
        [db.Sequelize.Op.or]: [
          { image_url: null },
          { image_url: '' }
        ]
      }
    });

    console.log('📊 Статистика изображений:');
    console.log(`   Всего предметов: ${totalItems}`);
    console.log(`   Прямые ссылки на изображения: ${steamImageItems}`);
    console.log(`   Ссылки на страницы Steam Market: ${marketPageItems}`);
    console.log(`   Без изображений: ${nullImageItems}`);
    console.log(`   Другие: ${totalItems - steamImageItems - marketPageItems - nullImageItems}`);

    // Показываем примеры
    console.log('\n📋 Примеры текущих URL:');

    const examples = await db.Item.findAll({
      limit: 5,
      attributes: ['name', 'image_url'],
      order: [['createdAt', 'DESC']]
    });

    examples.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name}`);
      console.log(`   URL: ${item.image_url || 'НЕТ'}\n`);
    });

  } catch (error) {
    console.error('❌ Ошибка проверки:', error.message);
  }
}

// Экспорт функций
module.exports = {
  fixImageUrls,
  checkCurrentState,
  createMarketPageUrl
};

// Запуск если вызван напрямую
if (require.main === module) {
  const action = process.argv[2];

  if (action === 'fix') {
    fixImageUrls()
      .then(() => process.exit(0))
      .catch(error => {
        console.error('❌ Ошибка:', error);
        process.exit(1);
      });
  } else {
    checkCurrentState()
      .then(() => process.exit(0))
      .catch(error => {
        console.error('❌ Ошибка:', error);
        process.exit(1);
      });
  }
}
