// Скрипт для проверки PRODUCTION базы данных
// Использует credentials напрямую (не из .env)

const { Sequelize, QueryTypes } = require('sequelize');

// Production настройки
const PROD_CONFIG = {
  username: 'chibox',
  password: 'chibox123',
  database: 'chibox-game',
  host: '127.0.0.1',
  dialect: 'postgres'
};

const sequelize = new Sequelize(
  PROD_CONFIG.database,
  PROD_CONFIG.username,
  PROD_CONFIG.password,
  {
    host: PROD_CONFIG.host,
    dialect: PROD_CONFIG.dialect,
    logging: false
  }
);

async function checkProductionInventory(userId) {
  try {
    console.log(`\n🔍 Проверка PRODUCTION инвентаря пользователя: ${userId}\n`);

    // Подключаемся к БД
    await sequelize.authenticate();
    console.log('✅ Подключение к PRODUCTION базе данных успешно\n');

    // Получаем информацию о пользователе
    const user = await sequelize.query(
      `SELECT id, username, email, steam_id, balance, subscription_tier, level, xp, total_xp_earned
       FROM users
       WHERE id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (user.length === 0) {
      console.log('❌ Пользователь не найден');
      return;
    }

    console.log('👤 Информация о пользователе:');
    console.log('━'.repeat(80));
    console.log(`Username: ${user[0].username}`);
    console.log(`Email: ${user[0].email}`);
    console.log(`Steam ID: ${user[0].steam_id || 'не привязан'}`);
    console.log(`Баланс: ${user[0].balance} ₽`);
    console.log(`Подписка: ${user[0].subscription_tier || 'нет'}`);
    console.log(`Уровень: ${user[0].level} (XP: ${user[0].xp}/${user[0].total_xp_earned} всего)`);
    console.log('━'.repeat(80));

    // Получаем инвентарь
    const inventory = await sequelize.query(
      `SELECT
        ui.id,
        ui.item_id,
        i.name as item_name,
        i.rarity,
        i.category,
        i.price_rub,
        ui.status,
        ui.source,
        ui.acquisition_date,
        ui.transaction_date
       FROM user_inventory ui
       LEFT JOIN items i ON ui.item_id = i.id
       WHERE ui.user_id = :userId
       ORDER BY ui.acquisition_date DESC`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    console.log(`\n📦 Инвентарь (${inventory.length} предметов):\n`);

    if (inventory.length === 0) {
      console.log('  Инвентарь пустой');
    } else {
      // Группируем по статусу
      const byStatus = inventory.reduce((acc, item) => {
        if (!acc[item.status]) acc[item.status] = [];
        acc[item.status].push(item);
        return acc;
      }, {});

      for (const [status, items] of Object.entries(byStatus)) {
        console.log(`\n📌 ${status.toUpperCase()} (${items.length}):`);
        console.log('─'.repeat(80));

        items.forEach((item, index) => {
          console.log(`${index + 1}. ${item.item_name || 'Кейс/Предмет'}`);
          console.log(`   ID: ${item.id}`);
          console.log(`   Редкость: ${item.rarity || 'N/A'}`);
          console.log(`   Цена: ${item.price_rub || 0} ₽`);
          console.log(`   Источник: ${item.source}`);
          console.log(`   Дата получения: ${new Date(item.acquisition_date).toLocaleString('ru-RU')}`);
          if (item.transaction_date) {
            console.log(`   Дата транзакции: ${new Date(item.transaction_date).toLocaleString('ru-RU')}`);
          }
          console.log('');
        });
      }

      // Статистика
      console.log('\n📊 Статистика:');
      console.log('─'.repeat(80));
      const totalValue = inventory
        .filter(item => item.status === 'inventory')
        .reduce((sum, item) => sum + (parseFloat(item.price_rub) || 0), 0);
      console.log(`Общая стоимость предметов в инвентаре: ${totalValue.toFixed(2)} ₽`);
      console.log(`В инвентаре: ${byStatus.inventory?.length || 0}`);
      console.log(`Продано: ${byStatus.sold?.length || 0}`);
      console.log(`Выведено: ${byStatus.withdrawn?.length || 0}`);
      console.log(`Ожидает вывода: ${byStatus.pending_withdrawal?.length || 0}`);
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

// Получаем ID из аргументов командной строки
const userId = process.argv[2] || 'e0d82dfd-c10a-4415-a958-7f9b96ef2a84';

checkProductionInventory(userId);
