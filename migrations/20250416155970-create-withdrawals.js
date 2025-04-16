'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Создание ENUM типов
    try {
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_withdrawals_status" AS ENUM(
          'pending',
          'queued',
          'processing',
          'waiting_confirmation',
          'completed',
          'failed',
          'cancelled',
          'rejected',
          'expired'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_withdrawals_status" уже существует');
        } else {
          throw err;
        }
      });

      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_withdrawals_steam_trade_status" AS ENUM(
          'pending',
          'sent',
          'accepted',
          'declined',
          'canceled',
          'invalid_items',
          'invalid_url',
          'need_confirmation',
          'escrow',
          'error'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_withdrawals_steam_trade_status" уже существует');
        } else {
          throw err;
        }
      });
    } catch (error) {
      console.error('Ошибка при создании ENUM типов:', error.message);
    }

    await queryInterface.createTable('withdrawals', {
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
        comment: "ID пользователя, запросившего вывод предметов"
      },
      status: {
        type: Sequelize.ENUM('pending', 'queued', 'processing', 'waiting_confirmation', 'completed', 'failed', 'cancelled', 'rejected', 'expired'),
        defaultValue: 'pending',
        comment: "Статус запроса на вывод предметов"
      },
      request_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата создания запроса на вывод"
      },
      processing_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата начала обработки запроса"
      },
      completion_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата завершения запроса (успешного или нет)"
      },
      steam_trade_url: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "URL для обмена Steam, использованный в этом запросе"
      },
      steam_trade_offer_id: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "ID предложения обмена в Steam (если было создано)"
      },
      steam_trade_status: {
        type: Sequelize.ENUM('pending', 'sent', 'accepted', 'declined', 'canceled', 'invalid_items', 'invalid_url', 'need_confirmation', 'escrow', 'error'),
        allowNull: true,
        comment: "Статус предложения обмена в Steam"
      },
      steam_partner_id: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Steam ID партнера для обмена"
      },
      steam_escrow_end_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата окончания периода escrow для обмена (если применимо)"
      },
      admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID администратора, обрабатывающего запрос (если ручная обработка)"
      },
      admin_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Примечания администратора"
      },
      total_items_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Общее количество предметов в запросе на вывод"
      },
      total_items_value: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: "Общая стоимость предметов в запросе"
      },
      failed_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Причина отказа/неудачи при выводе предметов"
      },
      processing_attempts: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Количество попыток обработки запроса"
      },
      last_attempt_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата последней попытки обработки запроса"
      },
      next_attempt_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата следующей запланированной попытки обработки"
      },
      is_automatic: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Обрабатывается ли запрос автоматически или требует ручной обработки"
      },
      steam_api_response: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Ответ API Steam при создании предложения обмена (для отладки)"
      },
      withdrawal_fee: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: "Комиссия за вывод предметов (если применяется)"
      },
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Приоритет обработки (выше число = выше приоритет)"
      },
      user_confirmation_needed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Требуется ли дополнительное подтверждение от пользователя"
      },
      user_confirmation_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата подтверждения запроса пользователем"
      },
      email_notifications_sent: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Были ли отправлены email-уведомления"
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "IP-адрес, с которого был создан запрос"
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "User-Agent браузера, с которого был создан запрос"
      },
      verification_code: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Код подтверждения (если требуется для дополнительной безопасности)"
      },
      is_verified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Подтвержден ли запрос на вывод через дополнительную верификацию"
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата истечения срока действия запроса на вывод"
      },
      tracking_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Данные отслеживания процесса вывода в формате JSON"
      },
      notification_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID уведомления, связанного с этим запросом на вывод"
      },
      original_items: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Оригинальные данные о предметах на момент создания запроса"
      },
      trade_link_validation: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Результаты валидации trade URL"
      },
      cancellation_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Причина отмены запроса (если отменен)"
      },
      cancellation_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата отмены запроса"
      },
      is_test: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Тестовый запрос (не учитывается в статистике)"
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
      await queryInterface.addIndex('withdrawals', ['user_id']);
      await queryInterface.addIndex('withdrawals', ['status']);
      await queryInterface.addIndex('withdrawals', ['user_id', 'status']);
      await queryInterface.addIndex('withdrawals', ['request_date']);
      await queryInterface.addIndex('withdrawals', ['completion_date']);
      await queryInterface.addIndex('withdrawals', ['steam_trade_offer_id']);
      await queryInterface.addIndex('withdrawals', ['priority']);
      await queryInterface.addIndex('withdrawals', ['next_attempt_date']);
      await queryInterface.addIndex('withdrawals', ['is_automatic']);
      await queryInterface.addIndex('withdrawals', ['expires_at']);
      await queryInterface.addIndex('withdrawals', ['admin_id']);
    } catch (error) {
      console.error('Ошибка при создании индексов:', error.message);
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('withdrawals');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_withdrawals_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_withdrawals_steam_trade_status";');
  }
};
