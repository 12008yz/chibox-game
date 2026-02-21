'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Streamers (partner streamers, created by admin)
    await queryInterface.createTable('streamers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      balance: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0,
        allowNull: false,
        comment: 'Баланс стримера (начисления минус выплаты)'
      },
      percent_from_deposit: {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 5,
        allowNull: false,
        comment: 'Процент от депозитов рефералов'
      },
      fixed_registration: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        allowNull: false,
        comment: 'Фикс за регистрацию реферала'
      },
      fixed_first_deposit: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        allowNull: false,
        comment: 'Фикс за первый депозит реферала'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('streamers', ['user_id'], { unique: true });

    // 2. Referral links (multiple per streamer)
    await queryInterface.createTable('referral_links', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      streamer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'streamers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      code: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'Уникальный код в URL (streamer.site.com/CODE)'
      },
      label: {
        type: Sequelize.STRING(128),
        allowNull: true,
        comment: 'Название (Twitch, YouTube и т.д.)'
      },
      clicks_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      registrations_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      first_deposits_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('referral_links', ['code'], { unique: true });
    await queryInterface.addIndex('referral_links', ['streamer_id']);

    // 3. User: referred_by_streamer_id, referred_by_link_id, referred_at
    await queryInterface.addColumn('users', 'referred_by_streamer_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'streamers', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('users', 'referred_by_link_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'referral_links', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('users', 'referred_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addIndex('users', ['referred_by_streamer_id']);
    await queryInterface.addIndex('users', ['referred_by_link_id']);

    // 4. Streamer earnings (ledger)
    await queryInterface.createTable('streamer_earnings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      streamer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'streamers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      type: {
        type: Sequelize.ENUM('registration', 'first_deposit', 'deposit_percent'),
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      referral_link_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'referral_links', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      referred_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      payment_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'payments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('streamer_earnings', ['streamer_id']);
    await queryInterface.addIndex('streamer_earnings', ['created_at']);

    // 5. Streamer payouts
    await queryInterface.createTable('streamer_payouts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      streamer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'streamers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      method: {
        type: Sequelize.ENUM('balance', 'card', 'steam', 'other'),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'completed', 'cancelled'),
        defaultValue: 'pending',
        allowNull: false
      },
      details: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Реквизиты (карта, Steam и т.д.)'
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('streamer_payouts', ['streamer_id']);

    // 6. Streamer materials (banners, texts for stream/chat) — global or per streamer
    await queryInterface.createTable('streamer_materials', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      streamer_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'streamers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      type: {
        type: Sequelize.ENUM('banner', 'text'),
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'URL баннера или файла'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Текст для чата/стрима'
      },
      sort_order: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('streamer_materials', ['streamer_id']);

    // 7. promo_codes: optional streamer_id (promos for this streamer)
    await queryInterface.addColumn('promo_codes', 'streamer_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'streamers', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addIndex('promo_codes', ['streamer_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('promo_codes', 'streamer_id');
    await queryInterface.dropTable('streamer_materials');
    await queryInterface.dropTable('streamer_payouts');
    await queryInterface.dropTable('streamer_earnings');
    await queryInterface.removeColumn('users', 'referred_by_streamer_id');
    await queryInterface.removeColumn('users', 'referred_by_link_id');
    await queryInterface.removeColumn('users', 'referred_at');
    await queryInterface.dropTable('referral_links');
    await queryInterface.dropTable('streamers');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_streamer_earnings_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_streamer_payouts_method";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_streamer_payouts_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_streamer_materials_type";');
  }
};
