const db = require('../models');

async function fixSubscriptionOrigin() {
  console.log('🔧 Обновляем origin для подписочных предметов...\n');

  try {
    // Обновляем все предметы с origin subscription_tier*_case на subscription_case
    const [updatedCount] = await db.Item.update(
      { origin: 'subscription_case' },
      {
        where: {
          origin: {
            [db.Sequelize.Op.in]: [
              'subscription_tier1_case',
              'subscription_tier2_case',
              'subscription_tier3_case'
            ]
          }
        }
      }
    );

    console.log(`✅ Обновлено ${updatedCount} предметов для подписочных кейсов`);

    // Проверяем результат
    const subscriptionItems = await db.Item.findAll({
      where: { origin: 'subscription_case' },
      attributes: ['rarity'],
      raw: true
    });

    // Группируем по редкости
    const rarityCount = {};
    subscriptionItems.forEach(item => {
      rarityCount[item.rarity] = (rarityCount[item.rarity] || 0) + 1;
    });

    console.log('\n📊 Распределение предметов для подписки:');
    Object.entries(rarityCount).forEach(([rarity, count]) => {
      console.log(`   ${rarity}: ${count} предметов`);
    });

    console.log(`\n🎯 Всего предметов для подписочных кейсов: ${subscriptionItems.length}`);

    console.log('\n✅ Готово! Теперь все три уровня подписки будут использовать одинаковые предметы');

  } catch (error) {
    console.error('❌ Ошибка при обновлении origin:', error);
    throw error;
  }
}

// Запуск если вызван напрямую
if (require.main === module) {
  fixSubscriptionOrigin()
    .then(() => {
      console.log('\n🎉 Origin успешно обновлен!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка:', error);
      process.exit(1);
    });
}

module.exports = { fixSubscriptionOrigin };
