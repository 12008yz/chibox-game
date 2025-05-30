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

    const rawBody = JSON.stringify(req.body);
    // Убираем логирование чувствительных данных
    // logger.debug(`Raw body for signature verification: ${rawBody}`);
    // logger.debug(`Received signature: ${signature}`);

    if (!verifySignature(rawBody, signature, secret)) {
      logger.warn('Invalid signature in webhook request');
      return res.status(400).send('Invalid signature');
    }

    const event = req.body.event;
    const paymentData = req.body.object;

    logger.info(`Webhook received: event=${event}, paymentId=${paymentData.id}, status=${paymentData.status}`);

    // Найти платеж в базе
    const payment = await Payment.findOne({ where: { payment_id: paymentData.id } });
    if (!payment) {
      logger.warn(`Payment not found: ${paymentData.id}`);
      return res.status(404).send('Payment not found');
    }

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

      logger.info(`Payment status updated to ${newStatus} for paymentId=${paymentData.id}`);

      // Если платеж завершен успешно, активируем подписку или пополняем баланс
      if (newStatus === 'completed') {
        const user = await User.findByPk(payment.user_id);
        if (!user) {
          logger.warn(`User not found for payment user_id=${payment.user_id}`);
          return res.status(404).send('User not found');
        }

        // Создаем запись транзакции
        await require('../models').Transaction.create({
          user_id: user.id,
          type: payment.purpose === 'subscription' ? 'subscription_purchase' : 'balance_add',
          amount: parseFloat(payment.amount),
          description: payment.description,
          status: 'completed',
          related_entity_id: payment.id,
          related_entity_type: 'Payment',
          balance_before: user.balance,
          balance_after: payment.purpose === 'subscription' ? user.balance : (user.balance + parseFloat(payment.amount)),
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          is_system: false,
          payment_id: payment.id
        });

    if (payment.purpose === 'subscription') {
      logger.info(`Activating subscription for user ${user.id} from payment ${payment.id}`);
      const tierId = payment.metadata && payment.metadata.tierId ? payment.metadata.tierId : 1;
      await activateSubscription(user.id, tierId);
    } else if (payment.purpose === 'deposit') {
      user.balance = (user.balance || 0) + parseFloat(payment.amount);
      await user.save();
      logger.info(`User ${user.id} balance updated by deposit payment ${payment.id}`);

      // Добавление опыта за пополнение баланса
      await addExperience(user.id, 40, 'deposit', null, 'Пополнение баланса');
    }
      }
    } else {
      logger.debug('Payment status unchanged');
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error processing YooMoney webhook:', error);
    res.status(500).send('Internal Server Error');
  }
}

module.exports = {
  yoomoneyWebhook
};
