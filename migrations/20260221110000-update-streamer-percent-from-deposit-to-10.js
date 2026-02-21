'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE streamers SET percent_from_deposit = 10 WHERE percent_from_deposit = 5;`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE streamers SET percent_from_deposit = 5 WHERE percent_from_deposit = 10;`
    );
  }
};
