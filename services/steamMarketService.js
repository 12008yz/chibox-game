const axios = require('axios');
const winston = require('winston');
const cheerio = require('cheerio');

// Логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'steam-market.log' })
  ],
});

class SteamMarketService {
  constructor(steamConfig) {
    this.steamId = steamConfig.steamId;
    this.sessionId = steamConfig.sessionId;
    this.steamLoginSecure = steamConfig.steamLoginSecure;

    this.axiosInstance = axios.create({
      baseURL: 'https://steamcommunity.com',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/javascript, text/html, application/xml, text/xml, */*',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 30000
    });

    this.updateCookies();
  }

  updateCookies() {
    const cookies = [
      `sessionid=${this.sessionId}`,
      `steamLoginSecure=${this.steamLoginSecure}`
    ].join('; ');

    this.axiosInstance.defaults.headers.Cookie = cookies;
  }

  async searchMarketItem(marketHashName) {
    try {
      logger.info(`🔍 Поиск предмета: ${marketHashName}`);

      const response = await this.axiosInstance.get(`/market/listings/730/${encodeURIComponent(marketHashName)}`);

      // Парсим данные о предложениях из HTML
      const $ = cheerio.load(response.data);
      const scriptContent = $('script').text();
      const marketDataMatch = scriptContent.match(/var g_rgListingInfo = ({.*?});/);

      if (!marketDataMatch) {
        return { success: false, message: 'Предложения не найдены' };
      }

      const listingInfo = JSON.parse(marketDataMatch[1]);
      const listings = Object.values(listingInfo);

      if (!listings.length) {
        return { success: false, message: 'Нет доступных предложений' };
      }

      // Сортируем по цене
      listings.sort((a, b) => a.converted_price - b.converted_price);

      return {
        success: true,
        listings: listings.map(listing => ({
          listingId: listing.listingid,
          price: parseFloat(listing.converted_price) / 100,
          fee: parseFloat(listing.converted_fee) / 100
        }))
      };

    } catch (error) {
      logger.error(`Ошибка поиска: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async buyMarketItem(listingId, price, fee) {
    try {
      logger.info(`💰 Покупка предмета, Listing ID: ${listingId}`);

      const totalPrice = price + fee;
      const purchaseData = {
        sessionid: this.sessionId,
        currency: 5, // RUB
        subtotal: Math.round(price * 100),
        fee: Math.round(fee * 100),
        total: Math.round(totalPrice * 100),
        quantity: 1
      };

      const response = await this.axiosInstance.post(
        `/market/buylisting/${listingId}`,
        new URLSearchParams(purchaseData),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          }
        }
      );

      if (response.data && response.data.success) {
        logger.info(`✅ Предмет успешно куплен!`);
        return {
          success: true,
          purchasePrice: totalPrice
        };
      }

      return {
        success: false,
        message: response.data?.message || 'Ошибка покупки'
      };

    } catch (error) {
      logger.error(`Ошибка покупки: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async purchaseItemFromMarket(marketHashName, maxPrice = null) {
    // Поиск предмета
    const searchResult = await this.searchMarketItem(marketHashName);
    if (!searchResult.success) {
      return searchResult;
    }

    // Фильтр по цене
    let listings = searchResult.listings;
    if (maxPrice) {
      listings = listings.filter(l => l.price <= maxPrice);
    }

    if (!listings.length) {
      return { success: false, message: 'Нет подходящих предложений' };
    }

    // Покупка самого дешевого
    const cheapest = listings[0];
    const purchaseResult = await this.buyMarketItem(cheapest.listingId, cheapest.price, cheapest.fee);

    if (purchaseResult.success) {
      return {
        success: true,
        item: {
          marketHashName,
          purchasePrice: purchaseResult.purchasePrice,
          purchaseTime: new Date().toISOString()
        }
      };
    }

    return purchaseResult;
  }

  static loadConfig() {
    try {
      const steamBotConfig = require('../config/steam_bot.js');
      return {
        steamId: steamBotConfig.steamId,
        sessionId: steamBotConfig.sessionId,
        steamLoginSecure: steamBotConfig.steamLoginSecure
      };
    } catch (error) {
      throw new Error('Не удалось загрузить Steam конфигурацию');
    }
  }
}

module.exports = SteamMarketService;
