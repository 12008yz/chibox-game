const db = require('../models');

// 🎯 ПРОСТО ДОБАВЬТЕ ID ПРЕДМЕТОВ СЮДА:
const ITEM_IDS = [
  '00bd1077-1a17-400f-8f82-4bdb55cbecf9', // StatTrak™ MP5-SD | Liquidation (Battle-Scarred)
  '01cfa208-af21-443d-bba4-53c5c9e99bb7', // M249 | Contrast Spray (Battle-Scarred)
  '06031971-5358-4e6b-8ba0-eb2e4d95bea4', // Souvenir FAMAS | Faulty Wiring (Field-Tested)
  '0ac99b5c-f1ef-464c-a056-18832ee56701', // UMP-45 | Green Swirl (Battle-Scarred)
  '115c1bf4-4acf-4af8-af2b-2251918b3245', // AK-47 | Safari Mesh (Well-Worn)
  '13d1f941-1a7d-482f-bd9d-28ab78ad8b22', // Little Kev | The Professionals
  '13f5f792-6fa7-4e55-8e88-76bcecc905fd', // StatTrak™ USP-S | 27 (Field-Tested)
  '15802d9f-4360-43b8-997e-92107e8ba291', // SG 553 | Basket Halftone (Minimal Wear)
  '1688c661-f11c-4983-9dee-e1d7c865ddcd', // ★ Driver Gloves | King Snake (Field-Tested)

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
