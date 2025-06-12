const { UserInventory, Item } = require('../models');

(async () => {
  try {
    // Находим withdrawal с Well-Worn предметом
    const inventoryItem = await UserInventory.findOne({
      where: {
        withdrawal_id: '841c063f-5e22-43b0-8025-7e44a3e3639a'
      },
      include: [{
        model: Item,
        as: 'item'
      }]
    });

    if (inventoryItem) {
      console.log('Найден withdrawal item:', inventoryItem.item.steam_market_hash_name);

      // Находим Battle-Scarred предмет
      const battleScarredItem = await Item.findOne({
        where: {
          steam_market_hash_name: 'MP9 | Black Sand (Battle-Scarred)'
        }
      });

      if (battleScarredItem) {
        // Обновляем item_id в user_inventory
        await UserInventory.update({
          item_id: battleScarredItem.id
        }, {
          where: {
            withdrawal_id: '841c063f-5e22-43b0-8025-7e44a3e3639a'
          }
        });

        console.log('✅ Withdrawal исправлен на Battle-Scarred!');
      } else {
        console.log('❌ Battle-Scarred предмет не найден');
      }
    } else {
      console.log('❌ Withdrawal не найден');
    }
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
  process.exit(0);
})();
