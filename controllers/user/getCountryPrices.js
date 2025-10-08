const db = require('../../models');
const CountryPriceCalculator = require('../../utils/countryPriceCalculator');

const countryPriceCalculator = new CountryPriceCalculator();

/**
 * Получить цены предметов с учетом страны пользователя
 */
async function getCountryPrices(req, res) {
  try {
    const { country = 'ru', item_ids } = req.query;
    const userId = req.user?.id;

    // Проверяем поддержку страны
    const supportedCountries = countryPriceCalculator.getSupportedCountries();
    const userCountry = supportedCountries.includes(country) ? country : 'ru';

    // Получаем название поля цены для страны
    const priceField = countryPriceCalculator.getPriceFieldForCountry(userCountry);
    const currencyInfo = await countryPriceCalculator.getCurrencyInfo(userCountry);

    let whereCondition = {
      is_available: true
    };

    // Если указаны конкретные ID предметов
    if (item_ids) {
      const ids = Array.isArray(item_ids) ? item_ids : item_ids.split(',');
      // Проверяем что все ID являются UUID
      const validIds = ids.filter(id => /^[0-9a-f-]{36}$/i.test(id));
      if (validIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Некорректные ID предметов'
        });
      }
      whereCondition.id = {
        [db.Sequelize.Op.in]: validIds
      };
    }

    // Получаем предметы с ценами
    const items = await db.Item.findAll({
      where: whereCondition,
      attributes: [
        'id',
        'name',
        'steam_market_hash_name',
        'image_url',
        'rarity',
        'weapon_type',
        'price', // Базовая цена
        priceField, // Цена для конкретной страны
        'actual_price_rub',
        'price_last_updated'
      ],
      order: [['name', 'ASC']],
      limit: item_ids ? undefined : 100 // Ограничиваем если не указаны конкретные ID
    });

    // Формируем ответ
    const itemsWithPrices = items.map(item => {
      const itemData = item.toJSON();
      const countryPrice = itemData[priceField] || itemData.actual_price_rub || itemData.price || 0;

      return {
        id: itemData.id,
        name: itemData.name,
        steam_market_hash_name: itemData.steam_market_hash_name,
        image_url: itemData.image_url,
        rarity: itemData.rarity,
        weapon_type: itemData.weapon_type,
        price: countryPrice, // Цена для страны пользователя
        base_price_rub: itemData.actual_price_rub || itemData.price,
        currency: currencyInfo.currency,
        country: userCountry,
        price_last_updated: itemData.price_last_updated
      };
    });

    res.json({
      success: true,
      data: {
        items: itemsWithPrices,
        country: userCountry,
        currency: currencyInfo.currency,
        total_items: itemsWithPrices.length
      }
    });

  } catch (error) {
    console.error('❌ Ошибка получения цен по странам:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения цен по странам'
    });
  }
}

/**
 * Получить информацию о поддерживаемых странах и валютах
 */
async function getSupportedCountries(req, res) {
  try {
    const supportedCountries = countryPriceCalculator.getSupportedCountries();

    const countriesInfo = await Promise.all(supportedCountries.map(async (countryCode) => {
      const currencyInfo = await countryPriceCalculator.getCurrencyInfo(countryCode);
      return {
        country_code: countryCode,
        currency: currencyInfo.currency,
        rate: currencyInfo.rate,
        rate_description: currencyInfo.rateDescription
      };
    }));

    res.json({
      success: true,
      data: {
        countries: countriesInfo,
        default_country: 'ru'
      }
    });

  } catch (error) {
    console.error('❌ Ошибка получения информации о странах:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения информации о странах'
    });
  }
}

/**
 * Получить примеры цен для тестирования
 */
async function getPriceExamples(req, res) {
  try {
    const { base_price = 100 } = req.query;
    const testPrice = parseFloat(base_price);

    if (isNaN(testPrice) || testPrice <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Некорректная базовая цена'
      });
    }

    const countryPrices = await countryPriceCalculator.calculateAllPrices(testPrice);
    const supportedCountries = countryPriceCalculator.getSupportedCountries();

    const examples = await Promise.all(supportedCountries.map(async (countryCode) => {
      const priceField = countryPriceCalculator.getPriceFieldForCountry(countryCode);
      const currencyInfo = await countryPriceCalculator.getCurrencyInfo(countryCode);
      const price = countryPrices[priceField];

      return {
        country_code: countryCode,
        currency: currencyInfo.currency,
        price: price,
        rate: currencyInfo.rate,
        rate_description: currencyInfo.rateDescription
      };
    }));

    res.json({
      success: true,
      data: {
        base_price_rub: testPrice,
        examples: examples
      }
    });

  } catch (error) {
    console.error('❌ Ошибка получения примеров цен:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения примеров цен'
    });
  }
}

module.exports = {
  getCountryPrices,
  getSupportedCountries,
  getPriceExamples
};
