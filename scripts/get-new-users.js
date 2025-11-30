const { Sequelize, Op } = require('sequelize');
const db = require('../models');

async function getNewUsers() {
  try {
    // Вычисляем дату 2 дня назад от текущего момента
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    console.log('🔍 Поиск пользователей, зарегистрированных с:', twoDaysAgo.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }));
    console.log('📅 По текущее время:', new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }));
    console.log('─'.repeat(80));

    // Получаем пользователей
    const users = await db.User.findAll({
      where: {
        createdAt: {
          [Op.gte]: twoDaysAgo // gte = greater than or equal
        }
      },
      attributes: [
        'id',
        'username',
        'email',
        'role',
        'is_email_verified',
        'balance',
        'level',
        'xp',
        'subscription_tier',
        'total_cases_opened',
        'createdAt'
      ],
      order: [['createdAt', 'DESC']] // Сортируем по дате регистрации (новые сверху)
    });

    console.log(`\n✅ Найдено пользователей: ${users.length}\n`);

    if (users.length === 0) {
      console.log('📭 Нет новых пользователей за последние 2 дня.');
      return;
    }

    // Выводим таблицу с пользователями
    console.log('┌─────────┬────────────────────────────────────────┬──────────────────────────┬─────────────────────────────────────┬────────────────────────┬──────────┬─────────┬────────────────────┐');
    console.log('│   №     │                  ID                    │        Username          │              Email                  │   Дата регистрации     │  Баланс  │  Уровень│  Открыто кейсов    │');
    console.log('├─────────┼────────────────────────────────────────┼──────────────────────────┼─────────────────────────────────────┼────────────────────────┼──────────┼─────────┼────────────────────┤');

    users.forEach((user, index) => {
      const num = String(index + 1).padEnd(7);
      const id = String(user.id).padEnd(38);
      const username = String(user.username).padEnd(24);
      const email = String(user.email).padEnd(35);
      const createdAt = new Date(user.createdAt).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).padEnd(22);
      const balance = String(user.balance || 0).padEnd(8);
      const level = String(user.level || 0).padEnd(7);
      const casesOpened = String(user.total_cases_opened || 0).padEnd(18);

      console.log(`│ ${num} │ ${id} │ ${username} │ ${email} │ ${createdAt} │ ${balance} │ ${level} │ ${casesOpened} │`);
    });

    console.log('└─────────┴────────────────────────────────────────┴──────────────────────────┴─────────────────────────────────────┴────────────────────────┴──────────┴─────────┴────────────────────┘');

    // Статистика
    console.log('\n📊 Статистика:');
    const verifiedCount = users.filter(u => u.is_email_verified).length;
    const totalBalance = users.reduce((sum, u) => sum + (parseFloat(u.balance) || 0), 0);
    const totalCasesOpened = users.reduce((sum, u) => sum + (parseInt(u.total_cases_opened) || 0), 0);

    console.log(`   • Подтвержденных email: ${verifiedCount} из ${users.length}`);
    console.log(`   • Суммарный баланс: ${totalBalance.toFixed(2)} ₽`);
    console.log(`   • Всего открыто кейсов: ${totalCasesOpened}`);
    console.log(`   • Средний баланс на пользователя: ${(totalBalance / users.length).toFixed(2)} ₽`);

    // Разбивка по ролям
    const roleStats = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    console.log('\n👥 По ролям:');
    Object.entries(roleStats).forEach(([role, count]) => {
      console.log(`   • ${role}: ${count}`);
    });

  } catch (error) {
    console.error('❌ Ошибка при получении пользователей:', error);
    throw error;
  } finally {
    // Закрываем соединение с БД
    await db.sequelize.close();
    process.exit(0);
  }
}

// Запуск скрипта
getNewUsers();

