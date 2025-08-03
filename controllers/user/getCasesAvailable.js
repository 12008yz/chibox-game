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
    // Получаем активные шаблоны кейсов
    const cases = await db.CaseTemplate.findAll({
      where: { is_active: true }
    });

    const response = {
      success: true,
      data: cases
    };

    // Если пользователь аутентифицирован, добавляем информацию о пользователе
    if (req.user && req.user.id) {
      try {
        const user = await db.User.findByPk(req.user.id);
        if (user) {
          response.user_info = {
            max_daily_cases: user.max_daily_cases,
            cases_opened_today: user.cases_opened_today,
            cases_available: Math.max(0, user.max_daily_cases - user.cases_opened_today),
            last_reset_date: user.last_reset_date,
            next_case_available_time: user.next_case_available_time,
          };
        }
      } catch (userError) {
        logger.warn('Ошибка получения информации о пользователе:', userError);
        // Продолжаем без информации о пользователе
      }
    }

    return res.json(response);
  } catch (error) {
    logger.error('Ошибка получения доступных кейсов:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

// Оборачиваем getCasesAvailable в middleware кэширования
const cache = require('../../middleware/cache');
const cachedGetCasesAvailable = [cache(300), getCasesAvailable];

module.exports = {
  getCasesAvailable: cachedGetCasesAvailable
};
