const db = require('../models');

async function fixBestItemValues() {
  try {
    console.log('Начинаем исправление best_item_value для всех пользователей...');

    // Получаем всех пользователей
    const users = await db.User.findAll({
      attributes: ['id', 'username', 'best_item_value']
    });

    console.log(`Найдено ${users.length} пользователей для проверки`);

    let fixedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        console.log(`\nПроверяем пользователя ${user.username} (ID: ${user.id})`);

        // Получаем ВСЕ предметы пользователя
        const allUserItems = await db.UserInventory.findAll({
          where: { user_id: user.id },
          include: [
            {
              model: db.Item,
              as: 'item',
              attributes: ['id', 'name', 'rarity', 'price', 'weapon_type', 'image_url']
            }
          ]
        });

        console.log(`Найдено ${allUserItems.length} предметов в инвентаре`);

        if (allUserItems.length === 0) {
          console.log('У пользователя нет предметов - пропускаем');
          continue;
        }

        // Находим самый дорогой предмет
        const validItems = allUserItems.filter(inventoryItem =>
          inventoryItem.item !== null && inventoryItem.item.price > 0
        );

        if (validItems.length === 0) {
          console.log('У пользователя нет предметов с ценой - пропускаем');
          continue;
        }

        const bestItem = validItems.reduce((prev, current) => {
          const prevPrice = parseFloat(prev.item.price) || 0;
          const currentPrice = parseFloat(current.item.price) || 0;
          return (prevPrice > currentPrice) ? prev : current;
        });

        const actualBestPrice = parseFloat(bestItem.item.price);
        const currentBestValue = parseFloat(user.best_item_value) || 0;

        console.log(`Лучший предмет: ${bestItem.item.name} - ${actualBestPrice} КР`);
        console.log(`Текущий рекорд в БД: ${currentBestValue} КР`);

        if (actualBestPrice > currentBestValue) {
          console.log(`🔧 ИСПРАВЛЯЕМ: Обновляем рекорд с ${currentBestValue} на ${actualBestPrice} КР`);

          await db.User.update(
            { best_item_value: actualBestPrice },
            { where: { id: user.id } }
          );

          fixedCount++;
          console.log(`✅ Исправлено для пользователя ${user.username}`);
        } else {
          console.log(`✅ Рекорд корректный для пользователя ${user.username}`);
        }

        // Показываем топ-3 предметов
        const sortedItems = validItems
          .sort((a, b) => parseFloat(b.item.price) - parseFloat(a.item.price))
          .slice(0, 3);

        console.log('Топ-3 предметов:');
        sortedItems.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.item.name} - ${item.item.price} КР (${item.item.rarity})`);
        });

      } catch (userError) {
        console.error(`Ошибка при обработке пользователя ${user.username}:`, userError);
        errorCount++;
      }
    }

    console.log('\n=== ИТОГИ ===');
    console.log(`Всего пользователей проверено: ${users.length}`);
    console.log(`Исправлено записей: ${fixedCount}`);
    console.log(`Ошибок: ${errorCount}`);
    console.log('Исправление завершено!');

  } catch (error) {
    console.error('Общая ошибка скрипта:', error);
  }
}

// Если скрипт запущен напрямую
if (require.main === module) {
  fixBestItemValues().then(() => {
    console.log('\nСкрипт завершен');
    process.exit(0);
  }).catch(error => {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  });
}

module.exports = { fixBestItemValues };
