const db = require('../models');

async function recalculateBestItem(userId) {
  try {
    // Получаем ВСЕ предметы пользователя
    const allUserItems = await db.UserInventory.findAll({
      where: { user_id: userId },
      include: [
        {
          model: db.Item,
          as: 'item',
          attributes: ['id', 'name', 'rarity', 'price', 'weapon_type', 'image_url']
        }
      ]
    });

    console.log(`Найдено ${allUserItems.length} предметов для пользователя ${userId}`);

    if (allUserItems.length === 0) {
      console.log('У пользователя нет предметов');
      return;
    }

    // Находим самый дорогой предмет
    const validItems = allUserItems.filter(inventoryItem =>
      inventoryItem.item !== null && inventoryItem.item.price > 0
    );

    if (validItems.length === 0) {
      console.log('У пользователя нет предметов с ценой');
      return;
    }

    const bestItem = validItems.reduce((prev, current) => {
      const prevPrice = parseFloat(prev.item.price) || 0;
      const currentPrice = parseFloat(current.item.price) || 0;
      return (prevPrice > currentPrice) ? prev : current;
    });

    const bestPrice = parseFloat(bestItem.item.price);

    console.log(`Лучший предмет: ${bestItem.item.name} - ${bestPrice} КР`);

    // Обновляем пользователя
    const user = await db.User.findByPk(userId);
    if (user) {
      const currentBestValue = parseFloat(user.best_item_value) || 0;
      console.log(`Текущий рекорд: ${currentBestValue} КР`);

      if (bestPrice > currentBestValue) {
        user.best_item_value = bestPrice;
        await user.save();
        console.log(`Обновлен рекорд: ${currentBestValue} -> ${bestPrice} КР`);
      } else {
        console.log(`Рекорд не изменился: ${currentBestValue} КР`);
      }
    }

    // Показываем топ-5 предметов
    const sortedItems = validItems
      .sort((a, b) => parseFloat(b.item.price) - parseFloat(a.item.price))
      .slice(0, 5);

    console.log('Топ-5 предметов:');
    sortedItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.item.name} - ${item.item.price} КР (${item.item.rarity})`);
    });

  } catch (error) {
    console.error('Ошибка пересчета:', error);
  }
}

// Если скрипт запущен напрямую
if (require.main === module) {
  const userId = process.argv[2];
  if (!userId) {
    console.log('Использование: node recalculate-best-item.js <user_id>');
    process.exit(1);
  }

  recalculateBestItem(userId).then(() => {
    console.log('Пересчет завершен');
    process.exit(0);
  }).catch(error => {
    console.error('Ошибка:', error);
    process.exit(1);
  });
}

module.exports = { recalculateBestItem };
