'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Создание ENUM типов
    try {
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_payments_payment_system" AS ENUM(
          'ukassa',
          'paypal',
          'stripe',
          'qiwi',
          'webmoney',
          'crypto',
          'bank_card',
          'sbp',
          'mir',
          'other'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_payments_payment_system" уже существует');
        } else {
          throw err;
        }
      });

      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_payments_status" AS ENUM(
          'created',
          'pending',
          'authorized',
          'processing',
          'completed',
          'failed',
          'cancelled',
          'refunded',
          'partially_refunded',
          'dispute'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_payments_status" уже существует');
        } else {
          throw err;
        }
      });

      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_payments_purpose" AS ENUM(
          'deposit',
          'subscription',
          'case_purchase',
          'vip',
          'other'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_payments_purpose" уже существует');
        } else {
          throw err;
        }
      });
    } catch (error) {
      console.error('Ошибка при создании ENUM типов:', error.message);
    }

    await queryInterface.createTable('payments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: "ID пользователя, совершающего платеж"
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: "Сумма платежа"
      },
      payment_system: {
        type: Sequelize.ENUM('ukassa', 'paypal', 'stripe', 'qiwi', 'webmoney', 'crypto', 'bank_card', 'sbp', 'mir', 'other'),
        allowNull: false,
        comment: "Платежная система, через которую совершается платеж"
      },
      status: {
        type: Sequelize.ENUM('created', 'pending', 'authorized', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'dispute'),
        defaultValue: 'created',
        comment: "Статус платежа"
      },
      payment_id: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Внешний ID платежа в платежной системе"
      },
      payment_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL для оплаты (перенаправление пользователя)"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание платежа"
      },
      purpose: {
        type: Sequelize.ENUM('deposit', 'subscription', 'case_purchase', 'vip', 'other'),
        allowNull: false,
        defaultValue: 'deposit',
        comment: "Назначение платежа"
      },
      promo_code_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'promo_codes',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: "ID промокода, примененного к платежу"
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Время истечения неоплаченного платежа"
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата и время успешного завершения платежа"
      },
      refunded_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата и время возврата платежа"
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "IP-адрес, с которого был создан платеж"
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "User-Agent браузера, с которого был создан платеж"
      },
      payment_method: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Метод оплаты, выбранный пользователем (карта, эл. кошелек и т.д.)"
      },
      payment_details: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Дополнительные детали платежа (в формате JSON)"
      },
      currency: {
        type: Sequelize.STRING,
        defaultValue: 'RUB',
        comment: "Валюта платежа (ISO код)"
      },
      notified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Было ли отправлено уведомление пользователю о статусе платежа"
      },
      notification_attempts: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Количество попыток уведомления пользователя"
      },
      promo_code: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Промокод, примененный при оплате (если был)"
      },
      discount_amount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: "Сумма скидки (если был применен промокод)"
      },
      original_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: "Изначальная сумма до применения скидки"
      },
      webhook_received: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Был ли получен webhook от платежной системы"
      },
      webhook_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Данные, полученные из webhook платежной системы"
      },
      retry_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Количество попыток обработки платежа"
      },
      next_retry_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Время следующей попытки обработки"
      },
      fees: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: "Комиссия платежной системы"
      },
      net_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: "Чистая сумма после вычета комиссий"
      },
      receipt_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL на чек/квитанцию об оплате"
      },
      receipt_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Данные для формирования чека по 54-ФЗ"
      },
      subscription_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID подписки, оплаченной этим платежом"
      },
      case_purchase_ids: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        comment: "ID кейсов, приобретенных этим платежом"
      },
      refund_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Причина возврата средств"
      },
      refund_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: "Сумма возврата (если частичный возврат)"
      },
      is_test: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Тестовый платеж (не учитывается в статистике)"
      },
      admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID администратора, создавшего или изменившего платеж"
      },
      admin_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Примечания администратора"
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Создаем индексы
    try {
      await queryInterface.addIndex('payments', ['user_id']);
      await queryInterface.addIndex('payments', ['status']);
      await queryInterface.addIndex('payments', ['payment_id']);
      await queryInterface.addIndex('payments', ['created_at']);
      await queryInterface.addIndex('payments', ['completed_at']);
      await queryInterface.addIndex('payments', ['purpose']);
      await queryInterface.addIndex('payments', ['currency']);
      await queryInterface.addIndex('payments', ['user_id', 'status']);
      await queryInterface.addIndex('payments', ['promo_code_id']);
      await queryInterface.addIndex('payments', ['subscription_id']);
      await queryInterface.addIndex('payments', ['expires_at']);
    } catch (error) {
      console.error('Ошибка при создании индексов:', error.message);
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('payments');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payments_payment_system";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payments_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payments_purpose";');
  }
};
