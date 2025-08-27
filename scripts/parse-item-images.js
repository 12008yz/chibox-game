const axios = require('axios');
const cheerio = require('cheerio');

// Функция для получения изображения через Steam Web API (более надёжный способ)
async function getSteamItemImageFromAPI(marketHashName) {
  try {
    console.log(`🔍 Получаем изображение через Steam API для: ${marketHashName}`);

    // Используем Steam Community Web API для получения информации о предмете
    const encodedName = encodeURIComponent(marketHashName);

    // Попытка 1: Получить через прямой API Steam
    const apiUrl = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${encodedName}`;

    const response = await axios.get(apiUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://steamcommunity.com/',
        'Origin': 'https://steamcommunity.com'
      }
    });

    if (response.data && response.data.success) {
      // Попытка 2: Получить изображение через inventory API
      const inventoryApiUrl = `https://steamcommunity.com/market/search/render/?appid=730&search_descriptions=0&sort_column=popular&sort_dir=desc&count=1&query=${encodedName}`;

      const inventoryResponse = await axios.get(inventoryApiUrl, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      if (inventoryResponse.data && inventoryResponse.data.results_html) {
        const $ = cheerio.load(inventoryResponse.data.results_html);
        const imageUrl = $('img').first().attr('src');

        if (imageUrl && isValidSteamImageUrl(imageUrl)) {
          console.log(`✅ Получено изображение через API: ${imageUrl}`);
          return normalizeImageUrl(imageUrl);
        }
      }
    }

    // Попытка 3: Поиск в базе известных изображений
    const generatedImageUrl = generateSteamImageUrl(marketHashName);
    if (generatedImageUrl) {
      console.log(`✅ Найдено изображение в базе: ${generatedImageUrl}`);
      return generatedImageUrl;
    }

    return null;
  } catch (error) {
    console.error(`❌ Ошибка получения изображения через API для ${marketHashName}:`, error.message);

    // Fallback на поиск в базе известных изображений
    const generatedImageUrl = generateSteamImageUrl(marketHashName);
    if (generatedImageUrl) {
      console.log(`✅ Fallback: найдено изображение в базе: ${generatedImageUrl}`);
      return generatedImageUrl;
    }

    return null;
  }
}

// Функция для генерации URL изображения на основе известных паттернов Steam
function generateSteamImageUrl(marketHashName) {
  try {
    // Для CS2 предметов Steam использует предсказуемые URL
    // Базовый URL для изображений предметов CS2
    const baseImageUrl = 'https://steamcommunity-a.akamaihd.net/economy/image/';

    // Расширенная база известных изображений CS2 предметов
    const knownImages = {
      'AK-47 | Safari Mesh (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot7HxfDhjxszJemkV09-5lpKKqPrxN7LEmyUJvpUj2r6VoNSh3AK3qkI6ZGzwI9WWJAA7NQuD-QDslObqh8TpvcnMwSFl6yN04HrfmQv330_QvKLUEA',
      'AK-47 | Safari Mesh (Well-Worn)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot7HxfDhjxszJemkV09-5lpKKqPrxN7LEmyUJvpUj2r6VoNSh3AK3qkI6ZGzwI9WWJAA7NQuD-QDslObqh8TpvcnMwSFl6yN04HrfmQv330_QvKLUEA',
      'AWP | Safari Mesh (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17PLfYQJD_9W7m5a0mvLwOq7c2D8C7sNz0r6SoYmg2ALh-UVpam77JYeRcQJoZA3Z_FDrw-fqhMS8vcvKwSY37yIl4CnZzxC20RpEcKUx0mJ6AcXw',
      'AWP | Capillary (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17PLfYQJU_c6JgYKBkrnyNoKfk29Y5ZUlte3E7M2h2QSy-hE6YW2gcYHAdVc6NV3X-VC8xOfu0J7p6szXiSw0Ib4YL7aJ',
      'M4A1-S | Boreal Forest (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhz2v_Nfz5H_uO1gb-Gw_alDL_Uj25u5Mx2gv2Pot2tiwHt-kJoY2qlLIeQdAA8YgzR-gPql7q7hcK8tZ7PyiZhsiMj-z-DyKQq-Kog',
      'M4A1-S | VariCamo (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhz2v_Nfz5H_uO1gb-Gw_alIL7VkBNY_8F4hOzA45W02lXn-kVkYmGndY-WcVc2YFnX_Fi_xOa6hcK-v8nXiSw0l08KJD0',
      'M4A1-S | Mud-Spec (Field-Tested)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhz2v_Nfz5H_uO1gb-Gw_alDLDVhGRd4ctOhuDG_ZjKhFWxuxY4NjqiJIDAclJqZgzU-AO2x-_ng5e16p2dnXs37yFw7mGdwUKdYr7O7Q',
      'M4A4 | Mainframe (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhz2v_Nfz5H_uO3mb-DkvL5ML7Wlm5u5Mx2gv2PoY_z2A2xrkA_YD2lLI6QclU7ZVqE81nukO-608W7ot2XngvfOIAJ',
      'P250 | Sand Dune (Factory New)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpopre7_A15JLDNB7LOyzU9v5LLzvH7Db70yhNS7pEqiL7H94ih2AO3rkQ9N26mJ4fAdlU5NQvS-Vm-yOa8jJC0uJ_IzCMwvXMk4X3UnQv330_-9eQKdg',
      'USP-S | Forest Leaves (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpoo6m1FBRp3_bGcjhQ09-jq5WYh8j6OrzZglRd4cJ5nqeSpd-t3gW1_EQ5Zj-mcoORIwM6ZQnT_FK3xOi8gJ7vot2XnjIh',
      'Five-SeveN | Forest Night (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposem2LFZfwOP3dm5R642JkIeOhMj_PrTHjmJF_8J0g-zAyoKsiQTk_xdvZm7ycY6VJwA7NQ7W_Vm5lermjJbvot2XnuMCzm7o',
      'Five-SeveN | Orange Peel (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposem2LFZfwOP3dm5R642JkIaOqOL1Ia_UhWNU6dNoxOvCo9yi0VXg_RE-Zm2lcNOSJwVrYA3U_QO4wbru18O0tM7XiSw0WsArNfUt',
      'Tec-9 | Groundwater (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpoor-mcjhjxszcdD4b086jkIeOhMjwOq3TkWNFppEuibmWo96tjVXl_0FkN2GhdoWWdAA7Y1vX_VLtybrpgJS-78vOySZh6D5iuygzpWAhvA',
      'Tec-9 | Army Mesh (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpoor-mcjhjxszcdD4b086jkImOlPL2IK_ummJW4NFOhujT8om7jVC9vh5rZGChJ9OTIwFsZVvS-APol-ztgZC-u8vAmXsxuXMg-z-DyLQRrQyP',
      'Desert Eagle | Mudder (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposr-kLAtl7PTfYQJK4t2imdXSkubsJfTTxmVR7p0tjL_BoYqmjgTkqhZuZzzzJ4HAdg87aQvV-lDqlb29gJG0ot2XnjzZLlGM',
      'Dual Berettas | Colony (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpos7asPwJf0Ob3dDFL69mJmImMn-P1IK7TkG1E7Zx1g-i24YmsigXg_kptYWHwcNLEIwc_N1rT8wO4wOm6hcS975_Pzng37ydz7SjemAv330-f_EvWKw',
      'R8 Revolver | Bone Mask (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpopL-zJAt21uH3Yi19_92zkYy0m_7zO6-fkjgBupZzj-qQo9j0jFa3_xVpNjr7LdCWcVU6aQqG-Vm9k7rugsLu7p-bm3Bgvikg7C3enhPinhh0aOFzguveFwtksNVvLQ',
      'MP9 | Storm (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou6r8FAZt7P7YKAJK5duJhoGOg8j_MLfVqGNU6dNoxbGYrNvwiQW1_kE5ajqlddPHJlQ3YArT_APqyer5gsW-vsnAzSE3uXIr5mGdwUIaBmF-',
      'P90 | Sand Spray (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpopuP1FAR17P7YKAJF_9W7m5a0mvLwOq7cqWdY781lteXA54vwxgfj-UVvNmv1LdOScFdqN1nV-AC-l-_uhJG9u8yYnCY37yYk4X7UyBa-n1gSOcsRiJNy',
      'XM1014 | Canvas Cloud (Factory New)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgporrf0e1Y07PDdTjlH7du4kb-GkuTLP7LWnn8fuJQk3OjEoNyk2Qzj80E-azjwJoeVJwBvMl3W_we8xubujJXquJucnycyuXF25nvUgVXp1gP_KwYM',
      'XM1014 | Blue Steel (Factory New)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgporrf0e1Y07PLfYQJP9c6zkIeOqOL1Ia_UhWNU6dNoxLrAo9ymi1bn8kQ-MWCndI6WewU6YVzY_Vi8krvu1p68v53LiSw0xJ8VlQYr',
      'Sawed-Off | Forest DDPAT (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpopbuyLgNv1fX3eSR9-t2lk4XFz_73MrfukmpD78A_j-qUo4qs2w3i-0RsZm3wIYPAcANrZAvW_gPvkOzqgsXp7pSdynU1vnYrsH7VnAv330-0iO2kfA',
      'FAMAS | Colony (Battle-Scarred)': 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposLuoKhRfwOP3dzxP7c-JmImMn-O6YL2IxW8A6pQg2-3E9N6m3Qe2rkc6ZmChI9fAdw5qNV6Cq1i5yLvsh5Tpu5zJnCA3viUq4C7azwv3308fBOxdnw'
    };

    // Проверяем, есть ли известное изображение для этого предмета
    if (knownImages[marketHashName]) {
      return knownImages[marketHashName];
    }

    // Если предмет не найден в базе известных изображений, возвращаем null
    // ТОЛЬКО оригинальные изображения, никаких placeholder или generic
    console.log(`⚠️  Изображение не найдено в базе для: ${marketHashName}`);
    return null;

  } catch (error) {
    console.error('❌ Ошибка генерации URL изображения:', error.message);
    return null;
  }
}

// Вспомогательная функция для извлечения типа оружия
function extractWeaponTypeFromName(marketHashName) {
  const weaponMatch = marketHashName.match(/^([^|]+)/);
  return weaponMatch ? weaponMatch[1].trim() : null;
}

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

    // Ищем ТОЛЬКО оригинальное изображение предмета в блоке market_listing_largeimage
    let imageUrl = null;

    // Основной поиск: блок с большим изображением предмета
    const largeImageDiv = $('.market_listing_largeimage img');
    if (largeImageDiv.length > 0) {
      const imageSrc = largeImageDiv.attr('src');
      if (imageSrc && isValidSteamImageUrl(imageSrc)) {
        imageUrl = imageSrc;
        console.log(`✅ Найдено оригинальное изображение в market_listing_largeimage: ${imageSrc}`);
      }
    }

    // Если не найдено в основном блоке, пробуем альтернативные селекторы
    if (!imageUrl) {
      const alternativeSelectors = [
        'div.market_listing_largeimage img',
        '.market_listing_largeimage > img',
        '#largeiteminfo_item_icon',
        '.market_listing_nav_container img[src*="community.akamai.steamstatic.com"]',
        '.market_listing_nav_container img[src*="steamcommunity-a.akamaihd.net"]'
      ];

      for (const selector of alternativeSelectors) {
        const img = $(selector).attr('src');
        if (img && isValidSteamImageUrl(img)) {
          imageUrl = img;
          console.log(`✅ Найдено оригинальное изображение через селектор ${selector}: ${img}`);
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
  const steamImageRegex = /^https?:\/\/(steamcommunity-a\.akamaihd\.net|steamcdn-a\.akamaihd\.net|steamuserimages-a\.akamaihd\.net|community\.akamai\.steamstatic\.com)/;

  // Проверяем расширение файла
  const validExtensions = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

  return steamImageRegex.test(url) && validExtensions.test(url);
}

// Функция для получения прямой ссылки на изображение из Steam API (заглушка, оставлена для обратной совместимости)
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
  getSteamItemImageFromAPI,
  generateSteamImageUrl,
  normalizeImageUrl
};
