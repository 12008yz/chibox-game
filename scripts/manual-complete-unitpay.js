require('dotenv').config();
const { sequelize } = require('../config/database');
const { Payment, User, Transaction } = require('../models');
const { activateSubscription } = require('../services/subscriptionService');
const { addExperience } = require('../services/xpService');

const invoiceNumber = process.argv[2];
const confirm = process.argv.includes('--confirm');

if (!invoiceNumber) {
  console.log('Использование: node scripts/manual-complete-unitpay.js <invoice_number> [--confirm]');
  console.log('Пример: node scripts/manual-complete-unitpay.js 42 --confirm');
  console.log('\nНужен номер счёта (invoice_number) платежа Unitpay. Его можно посмотреть в БД в таблице payments.');
  process.exit(1);
}

async function manualCompletePayment() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к БД установлено\n');

    const payment = await Payment.findOne({
      where: {
        invoice_number: parseInt(invoiceNumber, 10),
        payment_system: 'unitpay'
      },
      include: [{ model: User, as: 'user' }]
    });

    if (!payment) {
      console.log(`❌ Платеж Unitpay с номером счёта ${invoiceNumber} не найден`);
      process.exit(1);
    }

    console.log('📋 ПЛАТЕЖ UNITPAY:');
    console.log(`   Номер счёта: ${payment.invoice_number}`);
    console.log(`   Сумма: ${payment.amount} RUB`);
    console.log(`   Статус: ${payment.status}`);
    console.log(`   Назначение: ${payment.purpose}`);
    if (payment.user) {
      console.log(`   Пользователь: ${payment.user.username} (id: ${payment.user.id}), баланс: ${payment.user.balance}`);
    }

    if (payment.status === 'completed') {
      console.log('\n⚠️  Платеж уже завершён, ничего не делаем.');
      await sequelize.close();
      process.exit(0);
    }

    if (!confirm) {
      console.log('\n   Для зачисления баланса запустите с флагом --confirm:');
      console.log(`   node scripts/manual-complete-unitpay.js ${invoiceNumber} --confirm\n`);
      await sequelize.close();
      process.exit(0);
    }

    const user = await User.findByPk(payment.user_id);
    if (!user) {
      console.log('❌ Пользователь не найден');
      await sequelize.close();
      process.exit(1);
    }

    let transactionAmount = parseFloat(payment.amount);
    if (payment.purpose === 'deposit' && payment.metadata && payment.metadata.chicoins) {
      transactionAmount = parseFloat(payment.metadata.chicoins);
    }

    if (payment.purpose === 'subscription') {
      const tierId = (payment.metadata && payment.metadata.tierId) ? payment.metadata.tierId : 1;
      await activateSubscription(user.id, tierId);
      console.log('✅ Подписка активирована');
    } else if (payment.purpose === 'deposit') {
      const oldBalance = parseFloat(user.balance || 0);
      const chicoinsToAdd = transactionAmount;
      user.balance = oldBalance + chicoinsToAdd;
      await user.save();
      console.log(`✅ Баланс: ${oldBalance} → ${user.balance} (+${chicoinsToAdd})`);
      try {
        await addExperience(user.id, chicoinsToAdd, 'deposit');
      } catch (e) {
        console.log('⚠️ Опыт не начислен:', e.message);
      }
    }

    const balanceBefore = payment.purpose === 'subscription' ? user.balance : (user.balance - transactionAmount);
    await Transaction.create({
      user_id: user.id,
      type: payment.purpose === 'subscription' ? 'subscription_purchase' : 'balance_add',
      amount: transactionAmount,
      description: payment.description,
      status: 'completed',
      related_entity_id: payment.id,
      related_entity_type: 'Payment',
      balance_before: balanceBefore,
      balance_after: user.balance,
      is_system: false,
      payment_id: payment.id
    });

    payment.status = 'completed';
    payment.webhook_received = true;
    payment.completed_at = new Date();
    payment.webhook_data = { ...(payment.webhook_data || {}), manual_completion: true };
    await payment.save();

    console.log('✅ Платеж Unitpay помечен завершённым, баланс обновлён.');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await sequelize.close();
    process.exit(1);
  }
}

manualCompletePayment();
