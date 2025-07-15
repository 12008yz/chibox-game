'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const levels = [];

    // Генерируем 100 уровней с прогрессивным увеличением XP
    let totalXpRequired = 0;

    for (let level = 1; level <= 100; level++) {
      let xpToNextLevel;

      // Формула для расчета XP для следующего уровня
      if (level <= 10) {
        // Первые 10 уровней: базовые требования
        xpToNextLevel = 100 + (level - 1) * 50;
      } else if (level <= 25) {
        // Уровни 11-25: умеренное увеличение
        xpToNextLevel = 500 + (level - 10) * 100;
      } else if (level <= 50) {
        // Уровни 26-50: среднее увеличение
        xpToNextLevel = 2000 + (level - 25) * 200;
      } else if (level <= 75) {
        // Уровни 51-75: значительное увеличение
        xpToNextLevel = 7000 + (level - 50) * 400;
      } else {
        // Уровни 76-100: максимальное увеличение
        xpToNextLevel = 17000 + (level - 75) * 800;
      }

      // Последний уровень не нуждается в XP для следующего
      if (level === 100) {
        xpToNextLevel = 0;
      }

      const bonusPercentage = level * 0.02; // 0.02% за каждый уровень (100 уровень = 2%)
      const dailyCasesBonus = Math.floor(level / 10); // +1 кейс каждые 10 уровней
      const isMilestone = level % 10 === 0; // Каждый 10-й уровень - важный

      levels.push({
        id: `level-${level.toString().padStart(3, '0')}-${'x'.repeat(8)}-${'y'.repeat(4)}-${'z'.repeat(4)}-${'w'.repeat(12)}`.replace(/[xyz]/g, () => Math.floor(Math.random() * 16).toString(16)),
        level: level,
        xp_required: totalXpRequired,
        xp_to_next_level: xpToNextLevel,
        bonus_percentage: bonusPercentage,
        daily_cases_bonus: dailyCasesBonus,
        is_milestone: isMilestone,
        created_at: new Date(),
        updated_at: new Date()
      });

      totalXpRequired += xpToNextLevel;
    }

    await queryInterface.bulkInsert('level_settings', levels, {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('level_settings', null, {});
  }
};
