const { sequelize } = require('../config/database');

async function updateCaseImages() {
  try {
    console.log('🔄 Обновление изображений кейсов...');

    // Обновляем изображение для кейса Статус+
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = 'https://tempfile.aiquickdraw.com/s/475bbe22895043478fd0531dd11701c6_0_1760727687_4420.png',
          updated_at = NOW()
      WHERE id = '33333333-3333-3333-3333-333333333333'
    `);
    console.log('✅ Обновлено изображение для кейса "Статус+"');

    // Обновляем изображение для кейса Статус++
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = 'https://tempfile.aiquickdraw.com/s/ed7b0a105d3e46da9dcab0380772e4c6_0_1760726597_3944.png',
          updated_at = NOW()
      WHERE id = '44444444-4444-4444-4444-444444444444'
    `);
    console.log('✅ Обновлено изображение для кейса "Статус++"');

    // Обновляем изображение для Бонусного кейса
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = 'https://tempfile.aiquickdraw.com/s/e6df1da5bc5c41eeb084b17475730c20_0_1760728419_6087.png',
          updated_at = NOW()
      WHERE id = '55555555-5555-5555-5555-555555555555'
    `);
    console.log('✅ Обновлено изображение для "Бонусного кейса"');

    // Проверяем результаты
    const [results] = await sequelize.query(`
      SELECT name, image_url
      FROM case_templates
      WHERE id IN (
        '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444',
        '55555555-5555-5555-5555-555555555555'
      )
      ORDER BY min_subscription_tier
    `);

    console.log('\n📋 Текущие изображения кейсов:');
    results.forEach(row => {
      console.log(`   - ${row.name}: ${row.image_url}`);
    });

    console.log('\n✨ Обновление завершено успешно!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при обновлении изображений:', error);
    process.exit(1);
  }
}

updateCaseImages();
