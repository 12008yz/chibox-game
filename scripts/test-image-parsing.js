// Простой тестовый скрипт для проверки парсинга изображений без DB зависимостей
const axios = require('axios');
const cheerio = require('cheerio');

// Функция для очистки URL изображения от лишних символов
function cleanImageUrl(url) {
  if (!url) return null;

  // Удаляем все пробелы, переносы строк и другие whitespace символы
  let cleanedUrl = url.replace(/\s+/g, '').trim();

  // Заменяем akamai на fastly для корректной работы
  cleanedUrl = cleanedUrl.replace('community.akamai.steamstatic.com', 'community.fastly.steamstatic.com');

  // Проверяем что URL корректный
  try {
    new URL(cleanedUrl);
    return cleanedUrl;
  } catch (error) {
    console.error(`❌ Некорректный URL после очистки: ${cleanedUrl}`);
    return null;
  }
}

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
          // Удаляем все лишние пробелы, переносы строк и другие невидимые символы
          imageUrl = imageUrl.replace(/\s+/g, '').trim();
          console.log(`✅ Найдено изображение через API: ${imageUrl}`);
          return imageUrl;
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

    const marketHashName = extractMarketHashNameFromUrl(url);
    if (!marketHashName) {
      console.error(`❌ Не удалось извлечь имя предмета из URL: ${url}`);
      return null;
    }

    // Добавляем задержку чтобы не перегружать Steam
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Метод 1: Парсинг HTML страницы
    try {
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
        // Удаляем все лишние пробелы, переносы строк и другие невидимые символы
        imageUrl = imageUrl.replace(/\s+/g, '').trim();
        console.log(`✅ HTML парсинг успешен: ${imageUrl}`);
        return imageUrl;
      }
    } catch (htmlError) {
      console.log(`⚠️  HTML парсинг не удался: ${htmlError.message}`);
    }

    // Метод 2: Попробуем Steam API как fallback
    console.log(`🔄 HTML парсинг неудачен, пробуем Steam API...`);
    const apiImageUrl = await getImageFromSteamAPI(marketHashName);
    if (apiImageUrl) {
      return apiImageUrl;
    }

    console.log(`❌ Все методы не сработали для: ${url}`);
    return null;

  } catch (error) {
    console.error(`❌ Общая ошибка при парсинге ${url}:`, error.message);
    return null;
  }
}

async function testImageParsing() {
  console.log('🧪 Тестируем улучшенный парсинг изображений...');

  // Тестируем на примере AK-47 Safari Mesh
  const testUrl = 'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29';

  console.log(`🔗 Тестовый URL: ${testUrl}`);

  try {
    const imageUrl = await parseImageFromSteamPage(testUrl);

    if (imageUrl) {
      console.log('✅ Успешно извлечено изображение:');
      console.log(`🖼️  ${imageUrl}`);

      // Проверяем доступность изображения
      console.log('\n🔍 Проверяем доступность изображения...');
      try {
        const response = await axios.head(imageUrl, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        if (response.status === 200) {
          console.log('✅ Изображение доступно!');
          console.log(`📏 Content-Length: ${response.headers['content-length']} bytes`);
          console.log(`🎨 Content-Type: ${response.headers['content-type']}`);
        } else {
          console.log(`⚠️  Статус изображения: ${response.status}`);
        }
      } catch (imgError) {
        console.log(`❌ Изображение недоступно: ${imgError.message}`);

        // Если изображение недоступно, попробуем несколько вариантов URL
        console.log('\n🔧 Пробуем альтернативные варианты URL...');

        const alternatives = [
          imageUrl.replace('community.fastly.steamstatic.com', 'community.akamai.steamstatic.com'),
          imageUrl.replace('community.fastly.steamstatic.com', 'steamcdn-a.akamaihd.net'),
          imageUrl.replace('/360fx360f', '/512fx512f'),
          imageUrl.replace('/360fx360f', '/256fx256f')
        ];

        for (const altUrl of alternatives) {
          try {
            const altResponse = await axios.head(altUrl, { timeout: 5000 });
            if (altResponse.status === 200) {
              console.log(`✅ Альтернативный URL работает: ${altUrl}`);
              break;
            }
          } catch (altError) {
            console.log(`❌ Альтернатива не работает: ${altUrl}`);
          }
        }
      }
    } else {
      console.log('❌ Не удалось извлечь изображение');
    }
  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
  }
}

// Запускаем тест
testImageParsing().then(() => {
  console.log('\n🏁 Тестирование завершено');
  process.exit(0);
}).catch(error => {
  console.error('💥 Критическая ошибка:', error.message);
  process.exit(1);
});
