'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Марафонец (30 дней) привязываем к ежедневной серии заходов (daily_streak), а не к case_opening_streak,
    // чтобы достижение выполнялось при 30 днях входа в приложение подряд.
    await queryInterface.sequelize.query(`
      UPDATE achievements
      SET requirement_type = 'daily_streak'
      WHERE id = '70707070-7070-7070-7070-707070707070'
        AND requirement_type = 'case_opening_streak';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE achievements
      SET requirement_type = 'case_opening_streak'
      WHERE id = '70707070-7070-7070-7070-707070707070'
        AND requirement_type = 'daily_streak';
    `);
  }
};
