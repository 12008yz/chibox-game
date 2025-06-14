const axios = require('axios');

// Конфигурация для запросов к Steam
const STEAM_CONFIG = {
  baseURL: 'https://steamcommunity.com/market/priceoverview/',
  timeout: 15000,
  retries: 2,
  retryDelay: 5000,
  baseDelay: 2000  // Базовая задержка между запросами
};

// Задержка между запросами для избежания rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Функция для получения данных о предмете с Steam Market
async function getSteamItemData(marketHashName, retryCount = 0) {
  try {
    // Добавляем базовую задержку перед запросом
    if (retryCount === 0) {
      await delay(STEAM_CONFIG.baseDelay);
    }

    console.log(`🔍 Получаем данные Steam для: ${marketHashName}`);

    // Параметры запроса к Steam Market API
    const params = {
      appid: 730, // CS2 app ID
      currency: 1, // USD
      market_hash_name: marketHashName
    };

    // Делаем запрос к Steam Market API
    const response = await axios.get(STEAM_CONFIG.baseURL, {
      params,
      timeout: STEAM_CONFIG.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://steamcommunity.com/'
      }
    });

    // Проверяем успешность запроса
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = response.data;

    // Проверяем, есть ли данные о цене
    if (!data.success) {
      console.warn(`⚠️  Steam API не вернул успешный ответ для: ${marketHashName}`);
      return {
        price_usd: 0.10, // Минимальная цена по умолчанию
        price_text: '$0.10',
        item_info: {
          icon_url: null,
          icon_url_large: null
        },
        error: 'Steam API returned success: false'
      };
    }

    // Парсим цену из строки (например, "$1.23" -> 1.23)
    let priceUsd = 0.10;
    if (data.lowest_price) {
      const priceMatch = data.lowest_price.match(/\$?(\d+\.?\d*)/);
      if (priceMatch) {
        priceUsd = parseFloat(priceMatch[1]);
      }
    } else if (data.median_price) {
      const priceMatch = data.median_price.match(/\$?(\d+\.?\d*)/);
      if (priceMatch) {
        priceUsd = parseFloat(priceMatch[1]);
      }
    }

    // Дополнительно получаем информацию об иконке предмета
    const itemInfo = await getItemIcon(marketHashName);

    console.log(`✅ Получены данные: ${marketHashName} - $${priceUsd}`);

    return {
      price_usd: priceUsd,
      price_text: data.lowest_price || data.median_price || `$${priceUsd}`,
      volume: data.volume || '0',
      item_info: itemInfo,
      error: null
    };

  } catch (error) {
    console.error(`❌ Ошибка получения данных для ${marketHashName}:`, error.message);

    // Специальная обработка для 429 Too Many Requests
    if (error.response && error.response.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.random() * 10000 + 10000;
      console.log(`⚠️ Получен 429 Too Many Requests. Задержка перед повтором: ${delayMs} мс`);

      if (retryCount < STEAM_CONFIG.retries) {
        await delay(delayMs);
        return getSteamItemData(marketHashName, retryCount + 1);
      }
    }

    // Повторяем запрос при других ошибках
    if (retryCount < STEAM_CONFIG.retries && (!error.response || error.response.status !== 429)) {
      console.log(`🔄 Повторяем запрос для ${marketHashName} (попытка ${retryCount + 1}/${STEAM_CONFIG.retries})`);
      await delay(STEAM_CONFIG.retryDelay * (retryCount + 1));
      return getSteamItemData(marketHashName, retryCount + 1);
    }

    // Возвращаем дефолтные данные при критической ошибке
    return {
      price_usd: 0.10,
      price_text: '$0.10',
      volume: '0',
      item_info: {
        icon_url: null,
        icon_url_large: null
      },
      error: error.message
    };
  }
}

// Функция для получения иконки предмета
async function getItemIcon(marketHashName, retryCount = 0) {
  try {
    // Получаем данные о предмете для иконки
    const inspectURL = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;

    const response = await axios.get(inspectURL, {
      timeout: STEAM_CONFIG.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    // Парсим HTML для поиска иконки предмета
    const html = response.data;

    // Ищем URL иконки в HTML
    const iconMatch = html.match(/https:\/\/community\.cloudflare\.steamstatic\.com\/economy\/image\/[^"']+/);
    const iconUrl = iconMatch ? iconMatch[0] : null;

    return {
      icon_url: iconUrl,
      icon_url_large: iconUrl ? iconUrl.replace('/62fx62f', '/256fx256f') : null
    };

  } catch (error) {
    console.warn(`⚠️  Не удалось получить иконку для ${marketHashName}:`, error.message);

    if (retryCount < 1) {
      await delay(1000);
      return getItemIcon(marketHashName, retryCount + 1);
    }

    return {
      icon_url: null,
      icon_url_large: null
    };
  }
}

// Функция для получения данных о нескольких предметах с батчингом
async function getSteamItemsBatch(marketHashNames, batchSize = 5, delayBetweenBatches = 3000) {
  console.log(`🚀 Получаем данные для ${marketHashNames.length} предметов батчами по ${batchSize}`);

  const results = [];

  for (let i = 0; i < marketHashNames.length; i += batchSize) {
    const batch = marketHashNames.slice(i, i + batchSize);
    console.log(`📦 Обрабатываем батч ${Math.floor(i/batchSize) + 1}/${Math.ceil(marketHashNames.length/batchSize)}`);

    const batchPromises = batch.map(async (name, index) => {
      // Добавляем небольшую задержку между запросами в батче
      await delay(index * 500);
      return getSteamItemData(name);
    });

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push({
          marketHashName: batch[index],
          data: result.value
        });
      } else {
        console.error(`❌ Ошибка в батче для ${batch[index]}:`, result.reason);
        results.push({
          marketHashName: batch[index],
          data: {
            price_usd: 0.10,
            error: result.reason.message
          }
        });
      }
    });

    // Задержка между батчами
    if (i + batchSize < marketHashNames.length) {
      console.log(`⏳ Ждем ${delayBetweenBatches/1000} секунд перед следующим батчем...`);
      await delay(delayBetweenBatches);
    }
  }

  return results;
}

// Функция для проверки доступности Steam Market API
async function testSteamAPI() {
  console.log('🧪 Тестируем подключение к Steam Market API...');

  try {
    const testItem = 'AK-47 | Redline (Field-Tested)';
    const result = await getSteamItemData(testItem);

    if (result.error) {
      console.warn(`⚠️  Тест завершен с предупреждением: ${result.error}`);
      return false;
    } else {
      console.log(`✅ Steam API работает! Тестовый предмет: ${testItem} - $${result.price_usd}`);
      return true;
    }
  } catch (error) {
    console.error('❌ Steam API недоступен:', error.message);
    return false;
  }
}

module.exports = {
  getSteamItemData,
  getSteamItemsBatch,
  getItemIcon,
  testSteamAPI
};
