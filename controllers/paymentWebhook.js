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

/**
 * Обработчик ResultURL для Robokassa
 * Этот URL вызывается для уведомления магазина о результате оплаты
 */
async function robokassaResultURL(req, res) {
  try {
    logger.info('=== ROBOKASSA RESULT URL RECEIVED ===');
    logger.info('Query params:', req.query);
    logger.info('Body:', req.body);

    const { verifyResultSignature } = require('../services/robokassaService');

    // Параметры могут приходить как в query, так и в body
    const params = { ...req.query, ...req.body };

    const {
      OutSum,
      InvId,
      SignatureValue,
      shp_userId,
      shp_purpose,
      shp_chicoins
    } = params;

    // Проверка обязательных параметров
    if (!OutSum || !InvId || !SignatureValue) {
      logger.warn('Missing required parameters');
      return res.status(400).send('bad request: missing parameters');
    }

    logger.info(`Processing Robokassa payment: InvId=${InvId}, OutSum=${OutSum}`);

    // Собираем custom параметры для проверки подписи
    const customParams = {};
    Object.keys(params).forEach(key => {
      if (key.startsWith('shp_') || key.startsWith('Shp_')) {
        customParams[key.toLowerCase()] = params[key];
      }
    });

    // Проверяем подпись
    const isValidSignature = verifyResultSignature(
      parseFloat(OutSum),
      parseInt(InvId),
      SignatureValue,
      customParams
    );

    if (!isValidSignature) {
      logger.warn('Invalid signature in Robokassa ResultURL');
      return res.status(400).send('bad sign');
    }

    logger.info('✅ Robokassa signature verification passed');

    // Находим платеж в БД по invoice_number
    const payment = await Payment.findOne({ where: { invoice_number: parseInt(InvId) } });
    if (!payment) {
      logger.warn(`Payment not found: InvId=${InvId}`);
      return res.status(404).send('invoice not found');
    }

    logger.info(`Found payment:`, {
      id: payment.id,
      current_status: payment.status,
      amount: payment.amount,
      user_id: payment.user_id
    });

    // Обновляем статус платежа на completed
    if (payment.status !== 'completed') {
      payment.status = 'completed';
      payment.webhook_received = true;
      payment.payment_id = InvId.toString();
      payment.webhook_data = params;
      payment.completed_at = new Date();
      await payment.save();

      logger.info(`✅ Payment status updated to completed for InvId=${InvId}`);

      // Обрабатываем успешный платеж
      const user = await require('../models').User.findByPk(payment.user_id);
      if (!user) {
        logger.warn(`User not found for payment user_id=${payment.user_id}`);
        return res.status(404).send('user not found');
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
          paid_in_rubles: parseFloat(payment.amount)
        });

        // Добавление опыта за пополнение баланса
        await addExperience(user.id, 40, 'deposit', null, 'Пополнение баланса');
        logger.info(`✅ Experience added for deposit`);
      }
    } else {
      logger.debug('Payment already completed, no action needed');
    }

    logger.info('=== ROBOKASSA RESULT URL PROCESSED SUCCESSFULLY ===');

    // Robokassa требует ответ в формате: OK{InvId}
    return res.send(`OK${InvId}`);
  } catch (error) {
    logger.error('❌ Error processing Robokassa ResultURL:', error);
    logger.error('Error stack:', error.stack);
    return res.status(500).send('error');
  }
}

/**
 * Обработчик SuccessURL для Robokassa
 * Этот  URL для редиректа пользователя после успешной оплаты
 */
async function robokassaSuccessURL(req, res) {
  try {
    logger.info('=== ROBOKASSA SUCCESS URL RECEIVED ===');
    logger.info('Query params:', req.query);

    const { InvId, OutSum } = req.query;

    if (!InvId) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=error`);
    }

    // Можно проверить статус платежа в БД по invoice_number
    const payment = await Payment.findOne({ where: { invoice_number: parseInt(InvId) } });

    if (payment && payment.status === 'completed') {
      logger.info(`Payment ${InvId} completed successfully, redirecting to success page`);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=success&amount=${OutSum}`);
    } else {
      logger.info(`Payment ${InvId} pending or failed, redirecting to pending page`);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=pending`);
    }
  } catch (error) {
    logger.error('Error processing Robokassa SuccessURL:', error);
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}?payment=error`);
  }
}

/**
 * Обработчик FailURL для Robokassa
 * Этот URL для редиректа пользователя после неудачной оплаты
 */
async function robokassaFailURL(req, res) {
  try {
    logger.info('=== ROBOKASSA FAIL URL RECEIVED ===');
    logger.info('Query params:', req.query);

    const { InvId } = req.query;

    if (InvId) {
      const payment = await Payment.findOne({ where: { invoice_number: parseInt(InvId) } });
      if (payment && payment.status !== 'completed') {
        payment.status = 'failed';
        await payment.save();
        logger.info(`Payment ${InvId} marked as failed`);
      }
    }

    return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=failed`);
  } catch (error) {
    logger.error('Error processing Robokassa FailURL:', error);
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}?payment=error`);
  }
}

module.exports = {
  yoomoneyWebhook,
  robokassaResultURL,
  robokassaSuccessURL,
  robokassaFailURL
};
