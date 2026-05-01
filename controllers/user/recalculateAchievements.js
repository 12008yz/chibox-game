const db = require('../../models');
const { Op } = require('sequelize');
const { updateUserAchievementProgress, updateInventoryRelatedAchievements } = require('../../services/achievementService');
const { updateUserBonuses } = require('../../utils/userBonusCalculator');

async function recalculateUserAchievements(userId = null) {
  try {
    console.log('🔧 Начинаем пересчет достижений...');

    let users;
    if (userId) {
      users = await db.User.findAll({ where: { id: userId } });
      console.log(`📊 Пересчитываем достижения для пользователя ${userId}`);
    } else {
      users = await db.User.findAll();
      console.log(`📊 Пересчитываем достижения для ${users.length} пользователей`);
    }

    for (const user of users) {
      console.log(`\n👤 Обрабатываем пользователя ${user.id} (${user.email || 'Email не указан'})`);

      try {
        // 1. Пересчитываем достижение "Новичок" - кейсы открыты
        const totalCasesOpened = user.total_cases_opened || 0;
        if (totalCasesOpened > 0) {
          await updateUserAchievementProgress(user.id, 'cases_opened', totalCasesOpened);
          console.log(`  ✅ cases_opened: ${totalCasesOpened}`);
        }

        // 2. Пересчитываем достижения инвентаря (Эксперт и Миллионер)
        await updateInventoryRelatedAchievements(user.id);
        console.log(`  ✅ inventory achievements updated`);

        // 3. Пересчитываем редкие предметы
        const rareItems = await db.UserInventory.count({
          where: {
            user_id: user.id,
            item_type: 'item',
            status: 'inventory'
          },
          include: [{
            model: db.Item,
            as: 'item',
            where: {
              rarity: ['restricted', 'classified', 'covert', 'contraband']
            }
          }]
        });

        if (rareItems > 0) {
          await updateUserAchievementProgress(user.id, 'rare_items_found', rareItems);
          console.log(`  ✅ rare_items_found: ${rareItems}`);
        }

        // 4. Пересчитываем премиум предметы (от 100 руб)
        const premiumItems = await db.UserInventory.count({
          where: {
            user_id: user.id,
            item_type: 'item',
            status: 'inventory'
          },
          include: [{
            model: db.Item,
            as: 'item',
            where: {
              price: { [Op.gte]: 100 }
            }
          }]
        });

        if (premiumItems > 0) {
          await updateUserAchievementProgress(user.id, 'premium_items_found', premiumItems);
          console.log(`  ✅ premium_items_found: ${premiumItems}`);
        }

        // 5. Проверяем подписки
        if (user.subscription_tier && user.subscription_tier > 0) {
          await updateUserAchievementProgress(user.id, 'subscription_purchased', 1);
          console.log(`  ✅ subscription_purchased: 1`);
        }

        // 6. Синхронизируем достижения по ежедневной серии (Удачливый 7 дн., Марафонец 30 дн.)
        const dailyStreak = user.daily_streak || 0;
        if (dailyStreak > 0) {
          await updateUserAchievementProgress(user.id, 'daily_streak', dailyStreak);
          console.log(`  ✅ daily_streak: ${dailyStreak}`);
        }

        // 6b. Дни подряд с активным статусом (Подписчик 30 / Постоянный клиент 45)
        await updateUserAchievementProgress(user.id, 'subscription_days', 0);
        console.log(`  ✅ subscription_days synced from streak`);

        // 6c. Уровень (Элитный игрок 50, Элита элит 100) — прогресс из users.level
        await updateUserAchievementProgress(user.id, 'level_reached', 0);
        console.log(`  ✅ level_reached synced from user.level`);

        // 7. Обновляем все бонусы пользователя
        await updateUserBonuses(user.id);
        console.log(`  ✅ bonuses recalculated`);

        console.log(`  ✅ Пользователь ${user.id} обработан успешно`);

      } catch (userError) {
        console.error(`  ❌ Ошибка обработки пользователя ${user.id}:`, userError);
      }
    }

    console.log('\n🎉 Пересчет достижений завершен!');

  } catch (error) {
    console.error('❌ Ошибка пересчета достижений:', error);
  }
}

// Проверяем, запущен ли скрипт напрямую
if (require.main === module) {
  const userId = process.argv[2]; // Получаем ID пользователя из аргументов командной строки

  recalculateUserAchievements(userId)
    .then(() => {
      console.log('Скрипт завершен');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Критическая ошибка:', error);
      process.exit(1);
    });
}

module.exports = {
  recalculateUserAchievements
};
