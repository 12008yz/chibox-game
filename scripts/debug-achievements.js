const db = require('../models');

async function debugAchievements() {
  try {
    console.log('🔍 Диагностика системы достижений...\n');

    // 1. Проверяем количество достижений в системе
    const totalAchievements = await db.Achievement.findAll({
      where: { is_active: true }
    });
    console.log(`📊 Всего активных достижений в системе: ${totalAchievements.length}`);

    totalAchievements.forEach(ach => {
      console.log(`  - ${ach.name} (${ach.requirement_type}: ${ach.requirement_value})`);
    });
    console.log('');

    // 2. Находим пользователей с открытыми кейсами
    const usersWithCases = await db.User.findAll({
      where: {
        total_cases_opened: { [db.Sequelize.Op.gt]: 0 }
      },
      attributes: ['id', 'username', 'email', 'total_cases_opened'],
      order: [['total_cases_opened', 'DESC']],
      limit: 5
    });

    console.log(`👥 Пользователи с открытыми кейсами (топ 5):`);
    for (const user of usersWithCases) {
      console.log(`  - ${user.username} (${user.email}): ${user.total_cases_opened} кейсов`);

      // Проверяем достижения пользователя
      const userAchievements = await db.UserAchievement.findAll({
        where: { user_id: user.id },
        include: [{
          model: db.Achievement,
          as: 'achievement',
          attributes: ['name', 'requirement_type', 'requirement_value']
        }]
      });

      if (userAchievements.length === 0) {
        console.log(`    ❌ У пользователя НЕТ записей в user_achievements`);
      } else {
        console.log(`    ✅ У пользователя ${userAchievements.length} записей достижений:`);
        userAchievements.forEach(ua => {
          const ach = ua.achievement;
          console.log(`      - ${ach.name}: ${ua.current_progress}/${ach.requirement_value} (${ua.is_completed ? 'выполнено' : 'в процессе'})`);
        });
      }
    }
    console.log('');

    // 3. Проверяем достижение "Новичок" (cases_opened: 10)
    const noviceAchievement = await db.Achievement.findOne({
      where: {
        requirement_type: 'cases_opened',
        requirement_value: 10
      }
    });

    if (noviceAchievement) {
      console.log(`🎯 Достижение "Новичок" найдено: ${noviceAchievement.name}`);

      const usersWithProgress = await db.UserAchievement.findAll({
        where: { achievement_id: noviceAchievement.id },
        include: [{
          model: db.User,
          as: 'user',
          attributes: ['username', 'total_cases_opened']
        }],
        order: [['current_progress', 'DESC']],
        limit: 10
      });

      console.log(`📈 Прогресс пользователей по достижению "Новичок":`);
      if (usersWithProgress.length === 0) {
        console.log(`    ❌ НЕТ записей прогресса для достижения "Новичок"`);
      } else {
        usersWithProgress.forEach(ua => {
          console.log(`    - ${ua.user.username}: ${ua.current_progress}/10 (total_cases_opened: ${ua.user.total_cases_opened})`);
        });
      }
    }
    console.log('');

    // 4. Проверяем последние открытые кейсы
    const recentCases = await db.Case.findAll({
      where: { is_opened: true },
      include: [{
        model: db.User,
        as: 'user',
        attributes: ['username', 'total_cases_opened']
      }],
      order: [['opened_date', 'DESC']],
      limit: 5
    });

    console.log(`📦 Последние открытые кейсы:`);
    recentCases.forEach(case_ => {
      console.log(`    - ${case_.user.username}: кейс #${case_.id} открыт ${case_.opened_date} (всего кейсов: ${case_.user.total_cases_opened})`);
    });
    console.log('');

    // 5. Проверяем работу функции updateUserAchievementProgress
    console.log(`🔧 Тестируем функцию updateUserAchievementProgress...`);
    if (usersWithCases.length > 0) {
      const testUser = usersWithCases[0];
      console.log(`   Тестируем на пользователе: ${testUser.username} (${testUser.total_cases_opened} кейсов)`);

      try {
        const { updateUserAchievementProgress } = require('../services/achievementService');

        // Проверяем, есть ли уже запись для достижения "Новичок"
        const existingProgress = await db.UserAchievement.findOne({
          where: {
            user_id: testUser.id,
            achievement_id: noviceAchievement?.id
          }
        });

        if (!existingProgress && noviceAchievement) {
          console.log(`   Создаем запись для достижения "Новичок"...`);
          await updateUserAchievementProgress(testUser.id, 'cases_opened', testUser.total_cases_opened);

          const newProgress = await db.UserAchievement.findOne({
            where: {
              user_id: testUser.id,
              achievement_id: noviceAchievement.id
            }
          });

          if (newProgress) {
            console.log(`   ✅ Запись создана! Прогресс: ${newProgress.current_progress}/${noviceAchievement.requirement_value}`);
          } else {
            console.log(`   ❌ Запись НЕ создана`);
          }
        } else {
          console.log(`   ℹ️  Запись уже существует: ${existingProgress?.current_progress || 0}/${noviceAchievement?.requirement_value || 'N/A'}`);
        }
      } catch (error) {
        console.log(`   ❌ Ошибка при тестировании: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Ошибка при диагностике:', error);
  }
}

// Запускаем диагностику при прямом вызове скрипта
if (require.main === module) {
  debugAchievements().then(() => {
    console.log('\n✅ Диагностика завершена');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  });
}

module.exports = { debugAchievements };
