'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_unlockable_contents', {
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
        comment: "ID пользователя"
      },
      content_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'unlockable_contents',
          key: 'id'
        },
        comment: "ID разблокируемого контента"
      },
      is_unlocked: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Разблокирован ли контент"
      },
      progress: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0,
        comment: "Прогресс разблокировки от 0 до 1 (0% - 100%)"
      },
      progress_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Данные о прогрессе в формате JSON"
      },
      unlock_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата разблокировки контента"
      },
      first_view_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата первого просмотра разблокированного контента"
      },
      rewards_claimed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Получены ли награды за разблокировку"
      },
      reward_claim_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата получения наград"
      },
      reward_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Данные о полученных наградах"
      },
      is_visible: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Виден ли контент пользователю (для скрытых квестов)"
      },
      conditions_met_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата выполнения условий разблокировки"
      },
      source: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Источник разблокировки (система, админ, акция и т.д.)"
      },
      admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID администратора, если контент был разблокирован вручную"
      },
      admin_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Примечания администратора"
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Срок действия разблокировки (null - бессрочно)"
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Активен ли контент в данный момент"
      },
      notification_sent: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Было ли отправлено уведомление о разблокировке"
      },
      notification_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID отправленного уведомления"
      },
      meta_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Дополнительные метаданные"
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
    await queryInterface.addIndex('user_unlockable_contents', ['user_id']);
    await queryInterface.addIndex('user_unlockable_contents', ['content_id']);
    await queryInterface.addIndex('user_unlockable_contents', ['is_unlocked']);
    await queryInterface.addIndex('user_unlockable_contents', ['user_id', 'content_id'], { unique: true });
    await queryInterface.addIndex('user_unlockable_contents', ['unlock_date']);
    await queryInterface.addIndex('user_unlockable_contents', ['expires_at']);
    await queryInterface.addIndex('user_unlockable_contents', ['is_active']);
    await queryInterface.addIndex('user_unlockable_contents', ['notification_id']);

    // Добавление внешних ключей
    await queryInterface.addConstraint('user_unlockable_contents', {
      fields: ['admin_id'],
      type: 'foreign key',
      name: 'user_unlockable_contents_admin_fkey',
      references: {
        table: 'users',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    await queryInterface.addConstraint('user_unlockable_contents', {
      fields: ['notification_id'],
      type: 'foreign key',
      name: 'user_unlockable_contents_notification_fkey',
      references: {
        table: 'notifications',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('user_unlockable_contents', 'user_unlockable_contents_admin_fkey');
    await queryInterface.removeConstraint('user_unlockable_contents', 'user_unlockable_contents_notification_fkey');
    await queryInterface.dropTable('user_unlockable_contents');
  }
};
