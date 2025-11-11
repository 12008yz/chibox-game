'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Изменяем тип cooldown_hours с INTEGER на DECIMAL(10,3)
    await queryInterface.changeColumn('case_templates', 'cooldown_hours', {
      type: Sequelize.DECIMAL(10, 3),
      defaultValue: 24,
      allowNull: false,
      comment: "Период ожидания между выдачами кейса в часах (может быть дробным)"
    });
  },

  async down(queryInterface, Sequelize) {
    // Возвращаем обратно к INTEGER
    await queryInterface.changeColumn('case_templates', 'cooldown_hours', {
      type: Sequelize.INTEGER,
      defaultValue: 24,
      allowNull: false,
      comment: "Период ожидания между выдачами кейса в часах"
    });
  }
};
