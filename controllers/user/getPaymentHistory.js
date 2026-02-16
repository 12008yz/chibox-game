const db = require('../../models');
const winston = require('winston');
const { subscriptionTiers } = require('./getSubscriptionTiers');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

/**
 * История пополнений баланса и покупок статусов (только успешно завершённые платежи).
 * GET /balance/payment-history?limit=20
 */
async function getPaymentHistory(req, res) {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    const payments = await db.Payment.findAll({
      where: {
        user_id: userId,
        status: 'completed',
        purpose: ['deposit', 'subscription']
      },
      order: [['completed_at', 'DESC']],
      limit,
      attributes: ['id', 'purpose', 'amount', 'description', 'completed_at', 'metadata', 'currency']
    });

    const items = payments.map((p) => {
      const completedAt = p.completed_at || p.created_at;
      let label = p.description || '';
      if (p.purpose === 'subscription' && p.metadata && p.metadata.tierId) {
        const tier = subscriptionTiers[p.metadata.tierId];
        if (tier) label = tier.name;
      }
      if (p.purpose === 'deposit') {
        const chicoins = p.metadata && p.metadata.chicoins != null ? p.metadata.chicoins : p.amount;
        label = `+${Number(chicoins)} ChiCoins`;
      }
      return {
        id: p.id,
        purpose: p.purpose,
        amount: parseFloat(p.amount),
        description: label,
        completed_at: completedAt ? completedAt.toISOString() : null
      };
    });

    return res.json({
      success: true,
      data: { items }
    });
  } catch (error) {
    logger.error('Ошибка получения истории платежей:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

module.exports = {
  getPaymentHistory
};
