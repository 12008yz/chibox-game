const db = require('../models');

async function fixUserLevels() {
  try {
    console.log('🔍 Проверка уровней пользователей...\n');

    // Получаем всех пользователей
    const users = await db.User.findAll({
      attributes: ['id', 'username', 'level', 'xp', 'xp_to_next_level']
    });

    console.log(`Найдено пользователей: ${users.length}\n`);

    for (const user of users) {
      console.log(`\n👤 Пользователь: ${user.username}`);
      console.log(`   Текущий уровень: ${user.level}`);
      console.log(`   Текущий XP: ${user.xp}`);
      console.log(`   XP до следующего уровня: ${user.xp_to_next_level}`);

      // Получаем все настройки уровней
      const levelSettings = await db.LevelSettings.findAll({
        order: [['level', 'ASC']]
      });

      if (levelSettings.length === 0) {
        console.log('   ❌ ОШИБКА: Нет настроек уровней в базе данных!');
        continue;
      }

      // Находим правильный уровень для текущего XP
      let correctLevel = 1;
      let xpToNext = 100;

      for (const levelSetting of levelSettings) {
        if (user.xp >= levelSetting.xp_required) {
          correctLevel = levelSetting.level;
          xpToNext = levelSetting.xp_to_next_level;
        } else {
          break;
        }
      }

      console.log(`   Правильный уровень: ${correctLevel}`);

      if (user.level !== correctLevel) {
        console.log(`   ⚠️  НЕСООТВЕТСТВИЕ! Должен быть уровень ${correctLevel}`);
        console.log(`   🔧 Исправляю...`);

        user.level = correctLevel;
        user.xp_to_next_level = xpToNext;
        await user.save();

        console.log(`   ✅ Уровень обновлен: ${user.level}`);

        // Создаем уведомление, если уровень повысился
        if (correctLevel > user.level) {
          await db.Notification.create({
            user_id: user.id,
            title: 'Уровень обновлен',
            message: `Ваш уровень был пересчитан и установлен на ${correctLevel}`,
            type: 'success',
            category: 'level_up',
            importance: 5
          });
        }
      } else {
        console.log(`   ✅ Уровень корректный`);
      }

      // Показываем детали уровней
      console.log(`\n   📊 Настройки первых 5 уровней:`);
      for (let i = 0; i < Math.min(5, levelSettings.length); i++) {
        const ls = levelSettings[i];
        console.log(`      Уровень ${ls.level}: требуется ${ls.xp_required} XP, до следующего: ${ls.xp_to_next_level} XP`);
      }
    }

    console.log('\n✅ Проверка завершена!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

fixUserLevels();
