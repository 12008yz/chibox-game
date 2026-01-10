require('dotenv').config();
const { sequelize } = require('../config/database');
const { Payment, User } = require('../models');

async function checkAlfabankPayments() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к БД установлено\n');

    // Находим последние 10 платежей Альфа-Банка
    const payments = await Payment.findAll({
      where: {
        payment_system: 'alfabank'
      },
      include: [{ model: User, as: 'user' }],
      order: [['created_at', 'DESC']],
      limit: 10
    });

    if (payments.length === 0) {
      console.log('❌ Платежи Альфа-Банка не найдены');
      await sequelize.close();
      process.exit(0);
    }

    console.log(`📋 НАЙДЕНО ${payments.length} ПЛАТЕЖЕЙ АЛЬФА-БАНКА:\n`);

    for (const payment of payments) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`ID: ${payment.id}`);
      console.log(`Номер счета: ${payment.invoice_number}`);
      console.log(`Сумма: ${payment.amount} RUB`);
      console.log(`Статус: ${payment.status}`);
      console.log(`Назначение: ${payment.purpose}`);
      console.log(`Webhook получен: ${payment.webhook_received ? '✅ Да' : '❌ Нет'}`);
      console.log(`Дата создания: ${payment.created_at}`);
      console.log(`Дата завершения: ${payment.completed_at || 'Не завершен'}`);
      
      if (payment.user) {
        console.log(`Пользователь: ${payment.user.username} (ID: ${payment.user.id})`);
        console.log(`Баланс пользователя: ${payment.user.balance} ChiCoins`);
      }
      
      if (payment.metadata) {
        console.log(`Метаданные: ${JSON.stringify(payment.metadata)}`);
      }
      
      if (payment.webhook_data) {
        console.log(`Webhook данные: ${JSON.stringify(payment.webhook_data)}`);
      }
      
      if (payment.status === 'pending') {
        console.log(`⚠️  ПЛАТЕЖ В ОЖИДАНИИ - возможно callback не пришел!`);
      }
      
      console.log('');
    }

    // Показываем статистику
    const pendingCount = payments.filter(p => p.status === 'pending').length;
    const completedCount = payments.filter(p => p.status === 'completed').length;
    const failedCount = payments.filter(p => p.status === 'failed' || p.status === 'cancelled').length;

    console.log(`\n📊 СТАТИСТИКА:`);
    console.log(`   Ожидают обработки: ${pendingCount}`);
    console.log(`   Завершены: ${completedCount}`);
    console.log(`   Отменены/Ошибки: ${failedCount}`);

    if (pendingCount > 0) {
      console.log(`\n💡 Для ручного завершения платежа используйте:`);
      console.log(`   node scripts/manual-complete-alfabank.js <invoice_number> --confirm`);
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await sequelize.close();
    process.exit(1);
  }
}

checkAlfabankPayments();
