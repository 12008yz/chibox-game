'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🔧 Исправляем бонусы достижений...');

      // Исправляем бонусы достижений
      await queryInterface.sequelize.query(`
        UPDATE achievements
        SET bonus_percentage = CASE
          WHEN name = 'Новичок' THEN 1.0
          WHEN name = 'Коллекционер' THEN 2.0
          WHEN name = 'Премиум игрок' THEN 1.5
          WHEN name = 'Подписчик' THEN 1.0
          WHEN name = 'Покупатель подписки' THEN 0.5
          WHEN name = 'Удачливый' THEN 1.0
          WHEN name = 'Миллионер' THEN 2.0
          WHEN name = 'Эксперт' THEN 1.5
          ELSE bonus_percentage
        END;
      `);

      console.log('✅ Бонусы достижений исправлены');
      console.log('🔧 Пересчитываем бонусы пользователей...');

      // Пересчитываем бонусы всех пользователей
      await queryInterface.sequelize.query(`
        UPDATE users
        SET achievements_bonus_percentage = LEAST(achievements_bonus_percentage, 5.0),
            total_drop_bonus_percentage = LEAST(
              LEAST(achievements_bonus_percentage, 5.0) +
              COALESCE(level_bonus_percentage, 0) +
              COALESCE(subscription_bonus_percentage, 0),
              15.0
            )
        WHERE achievements_bonus_percentage > 5.0
           OR total_drop_bonus_percentage > 15.0;
      `);

      console.log('✅ Бонусы пользователей пересчитаны');

      // Показываем статистику
      const [results] = await queryInterface.sequelize.query(`
        SELECT
          COUNT(*) as total_users,
          AVG(achievements_bonus_percentage) as avg_achievement_bonus,
          MAX(achievements_bonus_percentage) as max_achievement_bonus,
          AVG(total_drop_bonus_percentage) as avg_total_bonus,
          MAX(total_drop_bonus_percentage) as max_total_bonus
        FROM users;
      `);

      console.log('📊 Статистика после исправления:', results[0]);

    } catch (error) {
      console.error('❌ Ошибка при исправлении бонусов:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ Откат изменений бонусов достижений...');

    // Возвращаем старые значения бонусов достижений
    await queryInterface.sequelize.query(`
      UPDATE achievements
      SET bonus_percentage = CASE
        WHEN name = 'Новичок' THEN 2.5
        WHEN name = 'Коллекционер' THEN 5.0
        WHEN name = 'Премиум игрок' THEN 7.5
        WHEN name = 'Подписчик' THEN 5.0
        WHEN name = 'Покупатель подписки' THEN 2.0
        WHEN name = 'Удачливый' THEN 2.5
        WHEN name = 'Миллионер' THEN 6.25
        WHEN name = 'Эксперт' THEN 7.5
        ELSE bonus_percentage
      END;
    `);

    console.log('✅ Откат завершен');
  }
};