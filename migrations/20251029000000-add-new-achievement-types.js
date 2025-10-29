'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Добавляем новые типы требований для достижений
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'exchange_item';

      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'slot_plays';

      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'legendary_item_found';

      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'total_sold_value';

      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'upgrade_success';

      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'level_reached';

      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'roulette_jackpot';

      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'night_case_opened';

      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'early_epic_item';

      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'epic_streak';

      ALTER TYPE "enum_achievements_requirement_type"
      ADD VALUE IF NOT EXISTS 'case_opening_streak';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Невозможно удалить значения из ENUM в PostgreSQL без пересоздания типа
    // Это требует сложной процедуры, поэтому оставляем пустым
    console.log('Cannot remove ENUM values in PostgreSQL. Manual intervention required.');
  }
};
