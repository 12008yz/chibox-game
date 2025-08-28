const db = require('../models');

// 🎯 ПРОСТО ДОБАВЬТЕ ID ПРЕДМЕТОВ СЮДА:
const ITEM_IDS = [
  '00d3ddfb-314e-4b09-a71b-51912945611f', // P250 | Metallic DDPAT (Battle-Scarred)
  '024447d7-095f-4e2f-b1b1-e3790e04ded8', // M4A1-S | Boreal Forest (Battle-Scarred)
  '050c98f4-aee6-47de-bfb0-cce4b4305923', // USP-S | Forest Leaves (Battle-Scarred)
  '14988199-8997-4b9b-a609-cf6ccdae9e40', // P250 | Sand Dune (Factory New)
  '1924d3d1-3fcf-4d36-8035-e4e9a43fc018', // AWP | Forest DDPAT (Battle-Scarred)
  '1b38d9da-aec6-487b-9747-261d4ac51588', // FAMAS | Blue Spraypaint (Factory New)
  '0c597eaf-b385-4501-a793-d87d1121e0e2', // Sawed-Off | Blue Spraypaint (Factory New)
  '0e5c997f-b699-43cc-b8c3-62ad3f04e1f7', // Sawed-Off | Blue Spraypaint (Factory New)
  '1157a376-bacf-43fb-b28b-abaeb57b443f', // Sawed-Off | Blue Spraypaint (Factory New)
  '12d81534-ab8a-49ad-a431-604ca46ffee2', // Sawed-Off | Blue Spraypaint (Factory New)
  '164c3dc2-8e6c-47cd-a6b5-46559e009738', // Sawed-Off | Blue Spraypaint (Factory New)
  '21c2d046-757b-4ac6-a902-ee10a063d06d',
  '28bee93e-c7f3-4bfd-9b5e-be465a201f62', // Sawed-Off | Blue Spraypaint (Factory New)
  '2a7026b3-ef66-4f56-9b5e-73c1bcb8e321', // Sawed-Off | Blue Spraypaint (Factory New)
  '33b1b049-bab1-449f-9b8d-302410d93e9d', // Sawed-Off | Blue Spraypaint (Factory New)
  '393b7673-a989-4a63-82e1-33137e9957ca', // Sawed-Off | Blue Spraypaint (Factory New)
  '39e86152-5210-4276-9d83-fb6cafced65b', // Sawed-Off | Blue Spraypaint (Factory New)
  '3c47cc31-27dc-4c73-826b-80c87b5fcba2', // Sawed-Off | Blue Spraypaint (Factory New)
  '341a7a25-6aa3-4cb4-a97f-69bed4fe33eb', // Sawed-Off | Blue Spraypaint (Factory New)

  // 👇 ДОБАВЛЯЙТЕ НОВЫЕ ID ЗДЕСЬ:

];

/**
 * Определяет вес выпадения на основе цены предмета
 */
function getDropWeight(price) {
  if (price < 10) return 10.0;     // Очень дешевые - высокий вес
  if (price < 50) return 8.0;      // Дешевые - высокий вес
  if (price < 200) return 5.0;     // Средние - средний вес
  if (price < 500) return 3.0;     // Дорогие - низкий вес
  if (price < 1500) return 1.0;    // Очень дорогие - очень низкий вес
  return 0.5;                      // Ультра-дорогие - минимальный вес
}

/**
 * Добавляет все предметы из списка в слот-игру
 */
async function addItemsToSlot() {
  try {
    console.log('🎰 Добавляем предметы в слот-игру...\n');

    let successCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;

    for (const itemId of ITEM_IDS) {
      try {
        console.log(`🔍 Обрабатываем: ${itemId}`);

        // Найти предмет в базе данных
        const item = await db.Item.findByPk(itemId);

        if (!item) {
          console.log(`❌ Предмет не найден: ${itemId}`);
          notFoundCount++;
          continue;
        }

        // Определить вес выпадения
        const price = parseFloat(item.price) || 0;
        const dropWeight = getDropWeight(price);

        // Обновить предмет для слота
        await item.update({
          origin: 'slot_machine',
          drop_weight: dropWeight,
          is_available: true,
          in_stock: true
        });

        console.log(`✅ ${item.name} (${price}₽) - вес: ${dropWeight}`);
        successCount++;

      } catch (error) {
        console.error(`❌ Ошибка с ${itemId}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n🎉 Результат:`);
    console.log(`  ✅ Успешно добавлено: ${successCount}`);
    console.log(`  ❌ Ошибок: ${errorCount}`);
    console.log(`  🔍 Не найдено: ${notFoundCount}`);
    console.log(`  📊 Всего обработано: ${ITEM_IDS.length}`);

    // Показать итоговую статистику
    console.log('\n📋 Статистика предметов в слоте:');
    await showSlotStats();

  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
  } finally {
    await db.sequelize.close();
  }
}

/**
 * Показывает статистику предметов в слоте
 */
async function showSlotStats() {
  try {
    const slotItems = await db.Item.findAll({
      where: {
        origin: 'slot_machine',
        is_available: true
      },
      attributes: ['name', 'price', 'rarity', 'drop_weight'],
      order: [['price', 'ASC']]
    });

    const cheapItems = slotItems.filter(item => item.price <= 50);
    const mediumItems = slotItems.filter(item => item.price > 50 && item.price <= 500);
    const expensiveItems = slotItems.filter(item => item.price > 500);

    console.log(`💰 Дешевые (до 50₽): ${cheapItems.length} предметов`);
    console.log(`💎 Средние (51-500₽): ${mediumItems.length} предметов`);
    console.log(`🏆 Дорогие (500₽+): ${expensiveItems.length} предметов`);
    console.log(`📈 Общий вес: ${slotItems.reduce((sum, item) => sum + parseFloat(item.drop_weight || 0), 0)}`);

    // Топ-5 самых дорогих предметов
    const topExpensive = slotItems.slice(-5).reverse();
    console.log('\n🏆 Самые дорогие предметы в слоте:');
    topExpensive.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - ${item.price}₽ (вес: ${item.drop_weight})`);
    });

  } catch (error) {
    console.error('❌ Ошибка при получении статистики:', error.message);
  }
}

// Запуск скрипта
if (require.main === module) {
  console.log('🚀 Начинаем добавление предметов в слот...');
  console.log(`📝 Предметов к обработке: ${ITEM_IDS.length}\n`);
  addItemsToSlot();
}

module.exports = { addItemsToSlot, ITEM_IDS };
