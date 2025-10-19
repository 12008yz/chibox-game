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
      SET image_url = 'https://tempfile.aiquickdraw.com/s/8729a654796c49669b8887953a4d16a0_0_1760822322_9560.png',
          updated_at = NOW()
      WHERE id = '44444444-4444-4444-4444-444444444444'
    `);
    console.log('✅ Обновлено изображение для кейса "Статус++"');

    // Обновляем изображение для кейса бесплатный
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = 'https://tempfile.aiquickdraw.com/s/8481c85343394be38b2a4fada0b75432_0_1760778030_8892.png',
        updated_at = NOW()
      WHERE id = '11111111-1111-1111-1111-111111111111'
    `);     
      console.log('✅ Обновлено изображение для кейса "Статус++"');


       // Обновляем изображение для кейса 499
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = 'https://tempfile.aiquickdraw.com/s/349c36631e9245baa290bcd19cb21c67_0_1760780444_5576.png',
        updated_at = NOW()
      WHERE id = '77777777-7777-7777-7777-777777777777'
    `);     
      console.log('✅ Обновлено изображение для кейса "499"');


         // Обновляем изображение для кейса 99
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = 'https://tempfile.aiquickdraw.com/s/391a1fd06ec241d6aed9eb65c0daef90_0_1760780787_9196.png',
        updated_at = NOW()
      WHERE id = '66666666-6666-6666-6666-666666666666'
    `);     
      console.log('✅ Обновлено изображение для кейса "99"');




    // Обновляем изображение для кейса Статус
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = 'https://tempfile.aiquickdraw.com/s/8a85630f511543da9c7a52277a592c05_0_1760777459_8266.png',
          updated_at = NOW()
      WHERE id = '22222222-2222-2222-2222-222222222222'
    `);
    console.log('✅ Обновлено изображение для кейса "Статус++"');

    // Обновляем изображение для Бонусного кейса
    await sequelize.query(`
      UPDATE case_templates
      SET image_url = 'https://tempfile.aiquickdraw.com/s/84cba77ac84f4e42a5faa0649a139a21_0_1760825034_4819.png',
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
