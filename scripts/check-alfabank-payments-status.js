require('dotenv').config();
const { sequelize } = require('../config/database');
const { Payment, User } = require('../models');

async function checkAlfabankPayments() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Получаем последние 10 платежей Альфа-Банка
    const payments = await Payment.findAll({
      where: {
        payment_system: 'alfabank'
      },
      order: [['created_at', 'DESC']],
      limit: 10,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'balance']
      }]
    });

    console.log('\n📊 Последние платежи Альфа-Банка:\n');
    
    for (const payment of payments) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`ID платежа: ${payment.id}`);
      console.log(`Invoice Number: ${payment.invoice_number}`);
      console.log(`Payment ID: ${payment.payment_id}`);
      console.log(`Статус: ${payment.status}`);
      console.log(`Сумма: ${payment.amount} руб.`);
      console.log(`Пользователь: ${payment.user?.username || 'N/A'} (ID: ${payment.user_id})`);
      console.log(`Баланс пользователя: ${payment.user?.balance || 'N/A'}`);
      console.log(`Webhook получен: ${payment.webhook_received ? '✅' : '❌'}`);
      console.log(`Создан: ${payment.created_at}`);
      console.log(`Завершен: ${payment.completed_at || 'Нет'}`);
      
      if (payment.payment_details) {
        console.log(`Payment Details:`, JSON.stringify(payment.payment_details, null, 2));
      }
      
      if (payment.webhook_data) {
        const webhookStatus = payment.webhook_data.status;
        console.log(`Webhook Status: ${webhookStatus || 'N/A'}`);
        console.log(`Webhook OrderNumber: ${payment.webhook_data.orderNumber || 'N/A'}`);
        console.log(`Webhook mdOrder: ${payment.webhook_data.mdOrder || 'N/A'}`);
      }
      
      console.log('');
    }

    // Проверяем pending платежи
    const pendingPayments = payments.filter(p => p.status === 'pending');
    if (pendingPayments.length > 0) {
      console.log(`\n⚠️ Найдено ${pendingPayments.length} pending платежей:`);
      for (const payment of pendingPayments) {
        console.log(`  - Invoice #${payment.invoice_number}, создан ${payment.created_at}`);
      }
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

checkAlfabankPayments();
