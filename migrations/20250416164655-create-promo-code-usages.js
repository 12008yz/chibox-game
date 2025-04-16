'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('promo_code_usages', {
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
        comment: "ID промокода, который был использован"
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: "ID пользователя, который использовал промокод"
      },
      usage_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата и время использования промокода"
      },
      applied_value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: "Фактическое примененное значение промокода (сумма скидки, бонуса и т.д.)"
      },
      original_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: "Исходная сумма платежа или стоимость до применения промокода"
      },
      final_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: "Итоговая сумма после применения промокода"
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "IP-адрес, с которого был использован промокод"
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "User-Agent браузера, с которого был использован промокод"
      },
      payment_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'payments',
          key: 'id'
        },
        comment: "ID платежа, в котором был использован промокод (если применимо)"
      },
      subscription_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID подписки, к которой был применен промокод (если применимо)"
      },
      cases_added: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Количество добавленных кейсов (для 'case_bonus')"
      },
      subscription_days_added: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Количество добавленных дней подписки (для 'subscription_extend')"
      },
      drop_rate_boost_percentage: {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: "Процент увеличения шанса выпадения редких предметов (для 'drop_rate_boost')"
      },
      boost_expiry_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата истечения временного буста (для 'drop_rate_boost')"
      },
      status: {
        type: Sequelize.ENUM('applied', 'cancelled', 'refunded', 'expired'),
        defaultValue: 'applied',
        comment: "Статус применения промокода"
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
    await queryInterface.addIndex('promo_code_usages', ['promo_code_id']);
    await queryInterface.addIndex('promo_code_usages', ['user_id']);
    await queryInterface.addIndex('promo_code_usages', ['usage_date']);
    await queryInterface.addIndex('promo_code_usages', ['promo_code_id', 'user_id']);
    await queryInterface.addIndex('promo_code_usages', ['payment_id']);
    await queryInterface.addIndex('promo_code_usages', ['status']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('promo_code_usages');
  }
};
