const { sequelize } = require('../config/database');

async function updateCaseImages() {
  try {
    console.log('🔄 Обновление изображений кейсов...');

    // Обновляем изображение для кейса Статус+
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = '../public/images/cases/1760727712765nm01j5an.png',
          updated_at = NOW()
      WHERE id = '33333333-3333-3333-3333-333333333333'
    `);
    console.log('✅ Обновлено изображение для кейса "Статус+"');

    // Обновляем изображение для кейса Статус++
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = '../public/images/cases/1760726634230o9sdib3y.png',
          updated_at = NOW()
      WHERE id = '44444444-4444-4444-4444-444444444444'
    `);
    console.log('✅ Обновлено изображение для кейса "Статус++"');

    // Обновляем изображение для Бонусного кейса
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = '../public/images/cases/1760728443809aohdtco1.png',
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
