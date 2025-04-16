'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('promo_code_users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      promo_code_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'promo_codes',
          key: 'id'
        },
        comment: "ID промокода"
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: "ID пользователя, которому доступен промокод"
      },
      is_used: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Использовал ли пользователь этот промокод"
      },
      expiry_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата истечения доступа к промокоду для этого пользователя"
      },
      notification_sent: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Было ли отправлено уведомление пользователю о промокоде"
      },
      assigned_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID администратора, который назначил промокод пользователю"
      },
      granted_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата и время предоставления доступа к промокоду"
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Добавление индексов
    await queryInterface.addIndex('promo_code_users', ['promo_code_id', 'user_id'], { unique: true });
    await queryInterface.addIndex('promo_code_users', ['user_id']);
    await queryInterface.addIndex('promo_code_users', ['promo_code_id']);
    await queryInterface.addIndex('promo_code_users', ['is_used']);
    await queryInterface.addIndex('promo_code_users', ['expiry_date']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('promo_code_users');
  }
};
