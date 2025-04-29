const db = require('../../models');
const winston = require('winston');

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

async function getCasesAvailable(req, res) {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);
    return res.json({
      max_daily_cases: user.max_daily_cases,
      cases_opened_today: user.cases_opened_today,
      cases_available: Math.max(0, user.max_daily_cases - user.cases_opened_today),
      last_reset_date: user.last_reset_date,
      next_case_available_time: user.next_case_available_time,
    });
  } catch (error) {
    logger.error('Ошибка получения доступных кейсов:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getCasesAvailable
};
