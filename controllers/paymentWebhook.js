const crypto = require('crypto');
const { Payment, User } = require('../models');
const winston = require('winston');
const { activateSubscription } = require('../services/subscriptionService');
const { addExperience } = require('../services/xpService');

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

function verifySignature(body, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(body).digest('base64');
  return digest === signature;
}

async function yoomoneyWebhook(req, res) {
  try {
    // Детальное логирование входящего запроса
    logger.info('=== WEBHOOK RECEIVED ===');
    logger.info('Headers:', JSON.stringify(req.headers, null, 2));
    logger.info('Body:', JSON.stringify(req.body, null, 2));

    const secret = process.env.YOOKASSA_CLIENT_SECRET;
    if (!secret) {
      logger.error('YOOKASSA_CLIENT_SECRET is not set in environment variables');
      return res.status(500).send('Server configuration error');
    }

    const signature = req.headers['x-yookassa-signature'];
    if (!signature) {
      logger.warn('Signature missing in webhook request');
      return res.status(400).send('Signature missing');
    }

    // Исправляем получение raw body для проверки подписи
    let rawBody;
    if (req.rawBody) {
      rawBody = req.rawBody;
    } else {
      rawBody = JSON.stringify(req.body);
    }

    logger.debug(`Using raw body for signature verification: ${rawBody.substring(0, 200)}...`);
    logger.debug(`Received signature: ${signature}`);
    logger.debug(`Using secret: ${secret.substring(0, 10)}...`);

    if (!verifySignature(rawBody, signature, secret)) {
      logger.warn('Invalid signature in webhook request');
      // В режиме разработки можем пропустить проверку подписи для отладки
      if (process.env.NODE_ENV === 'development') {
        logger.warn('DEVELOPMENT MODE: Skipping signature verification');
      } else {
        return res.status(400).send('Invalid signature');
      }
    } else {
      logger.info('✅ Signature verification passed');
    }

    const event = req.body.event;
    const paymentData = req.body.object;

    logger.info(`Webhook received: event=${event}, paymentId=${paymentData.id}, status=${paymentData.status}`);

    // Найти платеж в базе
    const payment = await Payment.findOne({ where: { payment_id: paymentData.id } });
    if (!payment) {
      logger.warn(`Payment not found in database: ${paymentData.id}`);

      // Попробуем найти все платежи для отладки
      const allPayments = await Payment.findAll({
        limit: 5,
        order: [['created_at', 'DESC']],
        attributes: ['id', 'payment_id', 'status', 'amount', 'user_id']
      });
      logger.info('Recent payments in database:', allPayments.map(p => ({
        payment_id: p.payment_id,
        status: p.status,
        amount: p.amount
      })));

      return res.status(404).send('Payment not found');
    }

    logger.info(`Found payment in database:`, {
      id: payment.id,
      payment_id: payment.payment_id,
      current_status: payment.status,
      amount: payment.amount,
      user_id: payment.user_id,
      purpose: payment.purpose
    });

    // Обновить статус платежа
    let newStatus = paymentData.status;
    if (newStatus === 'succeeded') {
      newStatus = 'completed';
    }

    logger.debug(`Current payment status: ${payment.status}, new status: ${newStatus}`);

    if (payment.status !== newStatus) {
      payment.status = newStatus;
      payment.webhook_received = true;
      payment.webhook_data = paymentData;
      payment.completed_at = newStatus === 'completed' ? new Date() : null;
      await payment.save();

      logger.info(`✅ Payment status updated to ${newStatus} for paymentId=${paymentData.id}`);

      // Если платеж завершен успешно, активируем подписку или пополняем баланс
      if (newStatus === 'completed') {
        const user = await User.findByPk(payment.user_id);
        if (!user) {
          logger.warn(`User not found for payment user_id=${payment.user_id}`);
          return res.status(404).send('User not found');
        }

        logger.info(`Processing completed payment for user:`, {
          user_id: user.id,
          username: user.username,
          current_balance: user.balance,
          payment_purpose: payment.purpose,
          payment_amount: payment.amount
        });

        // Определяем сумму для транзакции
        let transactionAmount = parseFloat(payment.amount);
        if (payment.purpose === 'deposit' && payment.metadata && payment.metadata.chicoins) {
          transactionAmount = parseFloat(payment.metadata.chicoins);
        }

        // Создаем запись транзакции
        const transaction = await require('../models').Transaction.create({
          user_id: user.id,
          type: payment.purpose === 'subscription' ? 'subscription_purchase' : 'balance_add',
          amount: transactionAmount,
          description: payment.description,
          status: 'completed',
          related_entity_id: payment.id,
          related_entity_type: 'Payment',
          balance_before: user.balance,
          balance_after: payment.purpose === 'subscription' ? user.balance : (user.balance + transactionAmount),
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          is_system: false,
          payment_id: payment.id
        });

        logger.info(`✅ Transaction created:`, {
          transaction_id: transaction.id,
          type: transaction.type,
          amount: transaction.amount
        });

        if (payment.purpose === 'subscription') {
          logger.info(`Activating subscription for user ${user.id} from payment ${payment.id}`);
          const tierId = payment.metadata && payment.metadata.tierId ? payment.metadata.tierId : 1;
          await activateSubscription(user.id, tierId);
          logger.info(`✅ Subscription activated for user ${user.id}`);
        } else if (payment.purpose === 'deposit') {
          const oldBalance = user.balance;

          // Получаем количество ChiCoins из metadata
          let chicoinsToAdd = parseFloat(payment.amount); // По умолчанию = рубли

          if (payment.metadata && payment.metadata.chicoins) {
            chicoinsToAdd = parseFloat(payment.metadata.chicoins);
            logger.info(`Using ChiCoins from metadata: ${chicoinsToAdd}`);
          }

          user.balance = (user.balance || 0) + chicoinsToAdd;
          await user.save();

          logger.info(`✅ User balance updated:`, {
            user_id: user.id,
            old_balance: oldBalance,
            new_balance: user.balance,
            added_chicoins: chicoinsToAdd,
            paid_in_rubles: parseFloat(payment.amount),
            display_currency: payment.metadata?.display_currency || 'RUB'
          });

          // Добавление опыта за пополнение баланса
          await addExperience(user.id, 40, 'deposit', null, 'Пополнение баланса');
          logger.info(`✅ Experience added for deposit`);
        }
      }
    } else {
      logger.debug('Payment status unchanged, no action needed');
    }

    logger.info('=== WEBHOOK PROCESSED SUCCESSFULLY ===');
    res.status(200).send('OK');
  } catch (error) {
    logger.error('❌ Error processing YooMoney webhook:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).send('Internal Server Error');
  }
}

module.exports = {
  yoomoneyWebhook
};
