const axios = require('axios');
const cheerio = require('cheerio');

// Функция для парсинга изображения со страницы Steam Market
async function parseImageFromSteamPage(url) {
  try {
    console.log(`🔍 Парсим изображение со страницы: ${url}`);

    // Настройки для axios
    const config = {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    };

    // Получаем HTML страницы
    const response = await axios.get(url, config);

    if (response.status !== 200) {
      throw new Error(`HTTP статус ${response.status}`);
    }

    // Парсим HTML с помощью cheerio
    const $ = cheerio.load(response.data);

    // Ищем изображение предмета в различных местах
    let imageUrl = null;

    // Вариант 1: Основное изображение предмета
    const mainImage = $('.market_listing_largeimage img').attr('src');
    if (mainImage && isValidSteamImageUrl(mainImage)) {
      imageUrl = mainImage;
    }

    // Вариант 2: Изображение в meta-тегах
    if (!imageUrl) {
      const metaImage = $('meta[property="og:image"]').attr('content');
      if (metaImage && isValidSteamImageUrl(metaImage)) {
        imageUrl = metaImage;
      }
    }

    // Вариант 3: Изображение в JSON данных страницы
    if (!imageUrl) {
      const scripts = $('script').toArray();
      for (const script of scripts) {
        const scriptContent = $(script).html();
        if (scriptContent && scriptContent.includes('large_image_url')) {
          const match = scriptContent.match(/"large_image_url":"([^"]+)"/);
          if (match && match[1]) {
            imageUrl = match[1].replace(/\\\//g, '/');
            if (isValidSteamImageUrl(imageUrl)) {
              break;
            }
          }
        }
      }
    }

    // Вариант 4: Поиск по селекторам изображений
    if (!imageUrl) {
      const selectors = [
        '.market_listing_largeimage img',
        '.market_listing_item_img img',
        '.market_listing_nav_container img',
        '.market_commodity_orders_table img',
        'img[src*="steamcommunity-a.akamaihd.net"]'
      ];

      for (const selector of selectors) {
        const img = $(selector).attr('src');
        if (img && isValidSteamImageUrl(img)) {
          imageUrl = img;
          break;
        }
      }
    }

    if (imageUrl) {
      console.log(`✅ Найдено изображение: ${imageUrl}`);
      return imageUrl;
    } else {
      console.log(`⚠️  Изображение не найдено на странице: ${url}`);
      return null;
    }

  } catch (error) {
    console.error(`❌ Ошибка парсинга изображения с ${url}:`, error.message);
    return null;
  }
}

// Функция для проверки валидности URL изображения Steam
function isValidSteamImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Проверяем, что это действительно изображение из Steam CDN
  const steamImageRegex = /^https?:\/\/(steamcommunity-a\.akamaihd\.net|steamcdn-a\.akamaihd\.net|steamuserimages-a\.akamaihd\.net)/;

  // Проверяем расширение файла
  const validExtensions = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

  return steamImageRegex.test(url) && validExtensions.test(url);
}

// Функция для получения прямой ссылки на изображение из Steam API
async function getSteamImageFromAPI(marketHashName) {
  try {
    // Попытка получить изображение через Steam Web API (если доступен)
    const encodedName = encodeURIComponent(marketHashName);
    const apiUrl = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${encodedName}`;

    const response = await axios.get(apiUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.data && response.data.success) {
      // Steam API не возвращает прямые ссылки на изображения в priceoverview
      // Это заглушка для будущего расширения функционала
      console.log('📊 Получены данные из Steam API, но изображение нужно парсить отдельно');
    }

    return null;
  } catch (error) {
    console.error('❌ Ошибка получения данных из Steam API:', error.message);
    return null;
  }
}

// Функция для нормализации URL изображения
function normalizeImageUrl(url) {
  if (!url) return null;

  try {
    // Убираем параметры запроса, которые могут мешать
    const cleanUrl = url.split('?')[0];

    // Заменяем HTTP на HTTPS для безопасности
    const httpsUrl = cleanUrl.replace(/^http:/, 'https:');

    return httpsUrl;
  } catch (error) {
    console.error('❌ Ошибка нормализации URL:', error.message);
    return url;
  }
}

// Экспорт функций
module.exports = {
  parseImageFromSteamPage,
  isValidSteamImageUrl,
  getSteamImageFromAPI,
  normalizeImageUrl
};
