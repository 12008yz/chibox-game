const db = require('../models');

// 🎯 ПРОСТО ДОБАВЬТЕ ID ПРЕДМЕТОВ СЮДА:
const ITEM_IDS = [
  // Дешевые (1-12₽) - часто выпадают
  '58e2cd94-f365-427e-b823-c6bcc1cafc6b', // UMP-45 | Green Swirl (Battle-Scarred) - 2.29₽
  '4f80b633-2c6c-45bb-80b0-fad7620b7ad0', // Tec-9 | Army Mesh (Battle-Scarred) - 2.35₽
  '1a2b00f4-af5a-4b74-9cd0-f1612878cf70', // Souvenir SG 553 | Bleached (Well-Worn) - 4.03₽
  '1709210e-1538-4f68-a4f1-f1d2356c79d9', // Desert Eagle | Mudder (Battle-Scarred) - 8.57₽
  '186e14ff-00fc-4b27-8592-5bd73be6c861', // P2000 | Granite Marbleized (Well-Worn) - 11.12₽

  // Средние (12-300₽) - редкие выигрыши
  '02831efb-7cdd-475f-958f-04e74a5d10c1', // StatTrak™ Tec-9 | Rebel (Well-Worn) - 14.53₽
  '028d19f1-385e-48d4-a7b9-3aa23250fdfa', // Zeus x27 | Electric Blue (Minimal Wear) - 37.48₽
  '1eb4e984-d098-4444-8a10-2bd0cb4f8689', // FAMAS | Cyanospatter (Factory New) - 111.20₽
  '08b34ebf-eddf-4ab2-b1e6-8ca688fe2f6a', // XM1014 | Jungle (Battle-Scarred) - 270.45₽

  // Дорогой (500+₽) - джекпот
  '036dc064-4df6-4cba-a7a8-89460c03b7c3', // P2000 | Handgun (Factory New) - 693.53₽
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
