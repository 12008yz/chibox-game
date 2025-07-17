'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Сначала проверим, существует ли таблица user_inventory
      const tableExists = await queryInterface.tableExists('user_inventory');
      if (!tableExists) {
        throw new Error('Таблица user_inventory не существует');
      }

      // Удалим существующие enum типы если они есть
      await queryInterface.sequelize.query(`
        DROP TYPE IF EXISTS "enum_user_inventory_item_type" CASCADE;
      `);

      // Проверим существование столбцов через SQL запрос
      const [results] = await queryInterface.sequelize.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'user_inventory'
        AND column_name IN ('item_type', 'case_template_id', 'expires_at')
      `);

      const existingColumns = results.map(row => row.column_name);
      console.log('Существующие столбцы:', existingColumns);

      // Проверим и добавим поле item_type если его нет
      if (!existingColumns.includes('item_type')) {
        await queryInterface.addColumn('user_inventory', 'item_type', {
          type: Sequelize.ENUM('item', 'case'),
          allowNull: false,
          defaultValue: 'item',
          comment: 'Тип предмета: обычный предмет или кейс'
        });
        console.log('✅ Поле item_type добавлено');
      } else {
        console.log('ℹ️ Поле item_type уже существует');
      }

      // Проверим и добавим поле case_template_id если его нет
      if (!existingColumns.includes('case_template_id')) {
        await queryInterface.addColumn('user_inventory', 'case_template_id', {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'case_templates',
            key: 'id'
          },
          comment: 'ID шаблона кейса, если это кейс в инвентаре'
        });
        console.log('✅ Поле case_template_id добавлено');
      } else {
        console.log('ℹ️ Поле case_template_id уже существует');
      }

      // Проверим и добавим поле expires_at если его нет
      if (!existingColumns.includes('expires_at')) {
        await queryInterface.addColumn('user_inventory', 'expires_at', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Дата истечения срока действия кейса/предмета'
        });
        console.log('✅ Поле expires_at добавлено');
      } else {
        console.log('ℹ️ Поле expires_at уже существует');
      }

      // Проверим существование индексов
      const [indexResults] = await queryInterface.sequelize.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'user_inventory'
        AND indexname IN ('user_inventory_item_type_idx', 'user_inventory_case_template_id_idx', 'user_inventory_user_id_item_type_idx')
      `);

      const existingIndexes = indexResults.map(row => row.indexname);
      console.log('Существующие индексы:', existingIndexes);

      // Добавим индексы только если столбцы существуют
      if (existingColumns.includes('item_type') && !existingIndexes.includes('user_inventory_item_type_idx')) {
        try {
          await queryInterface.addIndex('user_inventory', ['item_type'], {
            name: 'user_inventory_item_type_idx'
          });
          console.log('✅ Индекс для item_type добавлен');
        } catch (error) {
          console.log('⚠️ Ошибка при добавлении индекса item_type:', error.message);
        }
      } else {
        console.log('ℹ️ Индекс для item_type пропущен (столбец не существует или индекс уже есть)');
      }

      if (existingColumns.includes('case_template_id') && !existingIndexes.includes('user_inventory_case_template_id_idx')) {
        try {
          await queryInterface.addIndex('user_inventory', ['case_template_id'], {
            name: 'user_inventory_case_template_id_idx'
          });
          console.log('✅ Индекс для case_template_id добавлен');
        } catch (error) {
          console.log('⚠️ Ошибка при добавлении индекса case_template_id:', error.message);
        }
      } else {
        console.log('ℹ️ Индекс для case_template_id пропущен (столбец не существует или индекс уже есть)');
      }

      if (existingColumns.includes('item_type') && !existingIndexes.includes('user_inventory_user_id_item_type_idx')) {
        try {
          await queryInterface.addIndex('user_inventory', ['user_id', 'item_type'], {
            name: 'user_inventory_user_id_item_type_idx'
          });
          console.log('✅ Составной индекс для user_id и item_type добавлен');
        } catch (error) {
          console.log('⚠️ Ошибка при добавлении составного индекса:', error.message);
        }
      } else {
        console.log('ℹ️ Составной индекс пропущен (столбец item_type не существует или индекс уже есть)');
      }

    } catch (error) {
      console.error('❌ Ошибка при выполнении миграции:', error.message);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Безопасно удаляем индексы
      const indexesToRemove = [
        'user_inventory_user_id_item_type_idx',
        'user_inventory_case_template_id_idx',
        'user_inventory_item_type_idx'
      ];

      for (const indexName of indexesToRemove) {
        try {
          await queryInterface.removeIndex('user_inventory', indexName);
          console.log(`✅ Индекс ${indexName} удален`);
        } catch (error) {
          console.log(`ℹ️ Индекс ${indexName} не найден или уже удален`);
        }
      }

      // Безопасно удаляем столбцы
      const columnsToRemove = ['expires_at', 'case_template_id', 'item_type'];

      for (const columnName of columnsToRemove) {
        try {
          await queryInterface.removeColumn('user_inventory', columnName);
          console.log(`✅ Столбец ${columnName} удален`);
        } catch (error) {
          console.log(`ℹ️ Столбец ${columnName} не найден или уже удален`);
        }
      }

      console.log('✅ Откат миграции выполнен успешно');
    } catch (error) {
      console.error('❌ Ошибка при откате миграции:', error.message);
      throw error;
    }
  }
};
