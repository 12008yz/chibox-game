const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../models');
const COMPLETE_ITEMS_URLS = require('../utils/linkItems-complete');

// Функция для извлечения market_hash_name из URL
function extractMarketHashNameFromUrl(url) {
  try {
    const match = url.match(/\/market\/listings\/730\/(.+)$/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return null;
  } catch (error) {
    console.error('Ошибка извлечения имени из URL:', url, error.message);
    return null;
  }
}

// Альтернативная функция для получения изображения через Steam API
async function getImageFromSteamAPI(marketHashName) {
  try {
    console.log(`🔄 Попытка получить изображение через Steam API для: ${marketHashName}`);

    // Используем Steam API для получения информации о предмете
    const apiUrl = `https://steamcommunity.com/market/priceoverview/?currency=1&appid=730&market_hash_name=${encodeURIComponent(marketHashName)}`;

    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 5000
    });

    if (response.data && response.data.success) {
      // API не возвращает изображение напрямую, но мы можем построить URL
      // Основываясь на стандартной структуре Steam
      const baseImageUrl = 'https://community.fastly.steamstatic.com/economy/image/';

      // Пытаемся найти изображение через другой API endpoint
      const inventoryApiUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}/render/?query=&start=0&count=1&currency=1&format=json`;

      const inventoryResponse = await axios.get(inventoryApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 5000
      });

      if (inventoryResponse.data && inventoryResponse.data.results_html) {
        const $ = cheerio.load(inventoryResponse.data.results_html);
        const img = $('img').first();
        if (img.length > 0) {
          let imageUrl = img.attr('src');
          if (imageUrl) {
            imageUrl = imageUrl.replace('community.akamai.steamstatic.com', 'community.fastly.steamstatic.com');
            console.log(`✅ Найдено изображение через API: ${imageUrl}`);
            return imageUrl;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`❌ Ошибка Steam API для ${marketHashName}:`, error.message);
    return null;
  }
}

// Функция для парсинга изображения с страницы Steam Market
async function parseImageFromSteamPage(url) {
  try {
    console.log(`🔄 Парсим изображение с: ${url}`);

    // Добавляем задержку чтобы не перегружать Steam
    await new Promise(resolve => setTimeout(resolve, 1000));

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    // Пробуем несколько селекторов для поиска изображения
    let imageUrl = null;

    // 1. Пробуем основной селектор
    const largeImage = $('.market_listing_largeimage img');
    if (largeImage.length > 0) {
      imageUrl = largeImage.attr('src');
      console.log(`🎯 Найдено в .market_listing_largeimage: ${imageUrl}`);
    }

    // 2. Если не найдено, ищем в других местах
    if (!imageUrl) {
      const marketHeaderImage = $('.market_listing_item_img img');
      if (marketHeaderImage.length > 0) {
        imageUrl = marketHeaderImage.attr('src');
        console.log(`🎯 Найдено в .market_listing_item_img: ${imageUrl}`);
      }
    }

    // 3. Ищем в скриптах или data-атрибутах
    if (!imageUrl) {
      const scriptContent = $('script').text();
      const imageMatch = scriptContent.match(/https:\/\/community\.[^"']*steamstatic\.com\/economy\/image\/[^"'\s]+/);
      if (imageMatch) {
        imageUrl = imageMatch[0];
        console.log(`🎯 Найдено в скриптах: ${imageUrl}`);
      }
    }

    // 4. Пробуем найти любое изображение предмета
    if (!imageUrl) {
      $('img').each((i, element) => {
        const src = $(element).attr('src');
        if (src && src.includes('steamstatic.com/economy/image/')) {
          imageUrl = src;
          console.log(`🎯 Найдено в img: ${imageUrl}`);
          return false; // break из each
        }
      });
    }

    if (imageUrl) {
      // Заменяем akamai на fastly для корректной работы изображений
      imageUrl = imageUrl.replace('community.akamai.steamstatic.com', 'community.fastly.steamstatic.com');
      console.log(`✅ HTML парсинг успешен: ${imageUrl}`);
      return imageUrl;
    }

    // Если HTML парсинг не дал результата, пробуем API
    console.log(`🔄 HTML парсинг неудачен, пробуем Steam API...`);
    const marketHashName = extractMarketHashNameFromUrl(url);
    if (marketHashName) {
      const apiImageUrl = await getImageFromSteamAPI(marketHashName);
      if (apiImageUrl) {
        return apiImageUrl;
      }
    }

    console.log(`❌ Все методы не сработали для: ${url}`);
    return null;

  } catch (error) {
    console.error(`❌ Ошибка при парсинге ${url}:`, error.message);
    return null;
  }
}

// Функция для обновления изображения предмета в БД
async function updateItemImage(marketHashName, imageUrl) {
  try {
    const item = await db.Item.findOne({
      where: { steam_market_hash_name: marketHashName }
    });

    if (!item) {
      console.log(`⚠️  Предмет не найден в БД: ${marketHashName}`);
      return false;
    }

    await item.update({ image_url: imageUrl });
    console.log(`✅ Обновлено изображение для: ${marketHashName}`);
    return true;

  } catch (error) {
    console.error(`❌ Ошибка обновления БД для ${marketHashName}:`, error.message);
    return false;
  }
}

// Главная функция для парсинга всех изображений
async function parseAllItemImages() {
  console.log('🚀 Начинаем парсинг изображений предметов...');

  let totalProcessed = 0;
  let totalUpdated = 0;

  // Проходим по всем категориям
  for (const [category, items] of Object.entries(COMPLETE_ITEMS_URLS.subscription)) {
    console.log(`\n📂 Обрабатываем категорию: ${category}`);

    for (const url of items) {
      totalProcessed++;

      const marketHashName = extractMarketHashNameFromUrl(url);
      if (!marketHashName) {
        console.log(`❌ Не удалось извлечь имя из URL: ${url}`);
        continue;
      }

      // Проверяем, есть ли уже изображение в БД
      const existingItem = await db.Item.findOne({
        where: { steam_market_hash_name: marketHashName }
      });

      if (!existingItem) {
        console.log(`⏭️  Предмет не найден в БД: ${marketHashName}`);
        continue;
      }

      if (existingItem.image_url && existingItem.image_url.includes('steamstatic.com')) {
        console.log(`⏭️  Изображение уже есть для: ${marketHashName}`);
        continue;
      }

      // Парсим изображение
      const imageUrl = await parseImageFromSteamPage(url);

      if (imageUrl) {
        const updated = await updateItemImage(marketHashName, imageUrl);
        if (updated) {
          totalUpdated++;
        }
      }

      // Добавляем прогресс
      if (totalProcessed % 10 === 0) {
        console.log(`\n📊 Прогресс: обработано ${totalProcessed}, обновлено ${totalUpdated}`);
      }
    }
  }

  console.log(`\n🎉 Парсинг завершен!`);
  console.log(`📊 Всего обработано: ${totalProcessed}`);
  console.log(`✅ Обновлено изображений: ${totalUpdated}`);
}

// Функция для парсинга конкретного предмета (для тестирования)
async function parseSpecificItem(itemName) {
  console.log(`🔍 Ищем предмет: ${itemName}`);

  // Ищем URL в linkItems-complete.js
  let foundUrl = null;
  for (const [category, items] of Object.entries(COMPLETE_ITEMS_URLS.subscription)) {
    for (const url of items) {
      const marketHashName = extractMarketHashNameFromUrl(url);
      if (marketHashName && marketHashName.toLowerCase().includes(itemName.toLowerCase())) {
        foundUrl = url;
        console.log(`✅ Найден URL: ${url}`);
        break;
      }
    }
    if (foundUrl) break;
  }

  if (!foundUrl) {
    console.log(`❌ URL не найден для предмета: ${itemName}`);
    return;
  }

  const marketHashName = extractMarketHashNameFromUrl(foundUrl);
  const imageUrl = await parseImageFromSteamPage(foundUrl);

  if (imageUrl) {
    await updateItemImage(marketHashName, imageUrl);
  }
}

// Экспортируем функции
module.exports = {
  parseAllItemImages,
  parseSpecificItem,
  parseImageFromSteamPage,
  updateItemImage
};

// Если скрипт запущен напрямую
if (require.main === module) {
  (async () => {
    try {
      // Если передан аргумент - парсим конкретный предмет
      const itemName = process.argv[2];
      if (itemName) {
        await parseSpecificItem(itemName);
      } else {
        // Иначе парсим все предметы
        await parseAllItemImages();
      }
    } catch (error) {
      console.error('❌ Общая ошибка:', error.message);
    } finally {
      process.exit(0);
    }
  })();
}
