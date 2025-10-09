const { getPackagesForCountry, getPackageById } = require('../../config/creditPackages');
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

/**
 * Получить доступные пакеты кредитов для страны пользователя
 */
async function getCreditPackages(req, res) {
  try {
    const { country = 'ru' } = req.query;

    logger.info(`Getting credit packages for country: ${country}`);

    const packages = await getPackagesForCountry(country);

    return res.json({
      success: true,
      data: {
        packages: packages,
        country: country
      }
    });
  } catch (error) {
    logger.error('Error getting credit packages:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка получения пакетов кредитов'
    });
  }
}

/**
 * Получить информацию о конкретном пакете
 */
async function getCreditPackageById(req, res) {
  try {
    const { packageId } = req.params;
    const { country = 'ru' } = req.query;

    logger.info(`Getting credit package: ${packageId} for country: ${country}`);

    const package = await getPackageById(packageId, country);

    if (!package) {
      return res.status(404).json({
        success: false,
        message: 'Пакет не найден'
      });
    }

    return res.json({
      success: true,
      data: package
    });
  } catch (error) {
    logger.error('Error getting credit package:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка получения пакета кредитов'
    });
  }
}

module.exports = {
  getCreditPackages,
  getCreditPackageById
};
