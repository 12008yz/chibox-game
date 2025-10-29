const { sequelize } = require('../config/database');

async function fixAchievementImages() {
  try {
    console.log('Исправление путей изображений достижений...');

    // Обновляем пути, которые начинаются с ../public/
    const [results] = await sequelize.query(`
      UPDATE achievements
      SET icon_url = REPLACE(icon_url, '../public/Achievements/', '/Achievements/')
      WHERE icon_url LIKE '../public/Achievements/%'
    `);

    console.log(`Обновлено записей: ${results}`);

    // Выводим все текущие пути для проверки
    const [achievements] = await sequelize.query(`
      SELECT name, icon_url FROM achievements ORDER BY display_order
    `);

    console.log('\nТекущие пути изображений:');
    achievements.forEach(ach => {
      console.log(`${ach.name}: ${ach.icon_url}`);
    });

    console.log('\nГотово!');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка:', error);
    process.exit(1);
  }
}

fixAchievementImages();
