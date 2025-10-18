const db = require('../models');

async function removeExtraCase() {
  try {
    console.log('🔍 Поиск всех платных кейсов...');

    // Получаем все активные платные кейсы
    const paidCases = await db.CaseTemplate.findAll({
      where: {
        is_active: true,
        price: { [db.Sequelize.Op.gt]: 0 }
      },
      order: [['created_at', 'ASC']]
    });

    console.log(`\n📦 Найдено ${paidCases.length} платных кейсов:\n`);
    paidCases.forEach((c, i) => {
      console.log(`${i + 1}. ${c.name} - ${c.price}₽ (ID: ${c.id})`);
    });

    // Ищем "Покупной кейс" или лишние кейсы
    const knownCaseIds = [
      '66666666-6666-6666-6666-666666666666', // Стандартный кейс
      '77777777-7777-7777-7777-777777777777'  // Премиум кейс
    ];

    const extraCases = paidCases.filter(c => !knownCaseIds.includes(c.id));

    if (extraCases.length > 0) {
      console.log(`\n❌ Найдено ${extraCases.length} лишних кейсов:`);

      for (const extraCase of extraCases) {
        console.log(`\nУдаление: ${extraCase.name} (${extraCase.price}₽)`);

        // Деактивируем кейс вместо удаления
        await extraCase.update({ is_active: false });
        console.log(`✅ Кейс "${extraCase.name}" деактивирован`);
      }
    } else {
      console.log('\n✅ Лишних кейсов не найдено');
    }

    console.log('\n🎉 Операция завершена');
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

removeExtraCase();
