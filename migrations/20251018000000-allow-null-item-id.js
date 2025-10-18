'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Изменяем поле item_id, чтобы оно могло быть NULL
      // Это необходимо для хранения кейсов в инвентаре, где item_id не используется
      await queryInterface.changeColumn('user_inventory', 'item_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: "ID предмета в инвентаре (null для кейсов)"
      });

      console.log('✓ Поле item_id успешно изменено на allowNull: true');
    } catch (error) {
      console.error('Ошибка при изменении поля item_id:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // Возвращаем обратно allowNull: false
      // ВНИМАНИЕ: это может не сработать, если в таблице есть записи с item_id = NULL
      await queryInterface.changeColumn('user_inventory', 'item_id', {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: "ID предмета в инвентаре"
      });

      console.log('✓ Поле item_id возвращено к allowNull: false');
    } catch (error) {
      console.error('Ошибка при откате миграции:', error.message);
      throw error;
    }
  }
};
