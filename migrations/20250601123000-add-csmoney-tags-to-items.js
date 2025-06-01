'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('items', 'csmoney_tags', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: "Теги предмета с CS.Money в формате JSON"
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('items', 'csmoney_tags');
  }
};
