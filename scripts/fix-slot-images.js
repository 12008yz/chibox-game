const db = require('../models');
const { parseImageFromSteamPage, isValidSteamImageUrl } = require('./parse-item-images');

// Функция для проверки, является ли URL ссылкой на страницу Steam Market
function isSteamMarketPageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('steamcommunity.com/market/listings/730/');
}

// Функция для исправления изображений всех предметов
async function fixAllItemImages() {
  console.log('🚀 Начинаем исправление изображений предметов...');

  try {
    // Находим все предметы с некорректными изображениями
    const itemsWithBadImages = await db.Item.findAll({
      where: {
        image_url: {
          [db.Sequelize.Op.like]: '%steamcommunity.com/market/listings/730/%'
        }
      }
    });

    console.log(`🔍 Найдено ${itemsWithBadImages.length} предметов с некорректными изображениями`);

    if (itemsWithBadImages.length === 0) {
      console.log('✅ Все изображения уже исправлены!');
      return;
    }

    let processed = 0;
    let fixed = 0;
    let errors = 0;

    for (const item of itemsWithBadImages) {
      processed++;

      console.log(`\n🔄 [${processed}/${itemsWithBadImages.length}] Обрабатываем: ${item.name}`);

      try {
        // Проверяем, действительно ли это ссылка на страницу
        if (!isSteamMarketPageUrl(item.image_url)) {
          console.log(`⏭️  Пропускаем, не является ссылкой на страницу: ${item.image_url}`);
          continue;
        }

        // Парсим правильное изображение
        console.log(`🖼️  Получаем изображение для: ${item.steam_market_hash_name || item.name}`);
        const correctImageUrl = await parseImageFromSteamPage(item.image_url);

        if (correctImageUrl && isValidSteamImageUrl(correctImageUrl)) {
          // Обновляем запись в БД
          await item.update({ image_url: correctImageUrl });
          console.log(`✅ Исправлено: ${item.name}`);
          console.log(`   Старое: ${item.image_url}`);
          console.log(`   Новое:  ${correctImageUrl}`);
          fixed++;
        } else {
          // Используем дефолтное изображение
          const defaultImage = 'https://community.fastly.steamstatic.com/economy/image/6TMcQ7eX6E0EZl2byXi7vaVtMyCbg7JT9Nj26yLB0uiTHKECVqCQJYPQOiKc1A9hdeGdqRmPbEbD8Q_VfQ/256fx256f';
          await item.update({ image_url: defaultImage });
          console.log(`⚠️  Использовано дефолтное изображение для: ${item.name}`);
          fixed++;
        }

        // Добавляем небольшую задержку чтобы не перегружать Steam
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Ошибка при обработке ${item.name}:`, error.message);
        errors++;

        // В случае ошибки используем дефолтное изображение
        try {
          const defaultImage = 'https://community.fastly.steamstatic.com/economy/image/6TMcQ7eX6E0EZl2byXi7vaVtMyCbg7JT9Nj26yLB0uiTHKECVqCQJYPQOiKc1A9hdeGdqRmPbEbD8Q_VfQ/256fx256f';
          await item.update({ image_url: defaultImage });
          console.log(`🔧 Установлено дефолтное изображение для: ${item.name}`);
        } catch (updateError) {
          console.error(`❌ Критическая ошибка обновления ${item.name}:`, updateError.message);
        }
      }

      // Показываем прогресс каждые 10 предметов
      if (processed % 10 === 0) {
        console.log(`\n📊 Прогресс: ${processed}/${itemsWithBadImages.length} | Исправлено: ${fixed} | Ошибок: ${errors}`);
      }
    }

    console.log(`\n🎉 Исправление завершено!`);
    console.log(`📊 Статистика:`);
    console.log(`   - Обработано: ${processed}`);
    console.log(`   - Исправлено: ${fixed}`);
    console.log(`   - Ошибок: ${errors}`);

  } catch (error) {
    console.error('❌ Критическая ошибка:', error.message);
    throw error;
  }
}

// Функция для исправления конкретного предмета
async function fixSpecificItemImage(itemName) {
  console.log(`🔍 Ищем предмет: ${itemName}`);

  try {
    const item = await db.Item.findOne({
      where: {
        [db.Sequelize.Op.or]: [
          { name: { [db.Sequelize.Op.iLike]: `%${itemName}%` } },
          { steam_market_hash_name: { [db.Sequelize.Op.iLike]: `%${itemName}%` } }
        ]
      }
    });

    if (!item) {
      console.log(`❌ Предмет не найден: ${itemName}`);
      return;
    }

    console.log(`✅ Найден предмет: ${item.name}`);
    console.log(`   Текущее изображение: ${item.image_url}`);

    if (!isSteamMarketPageUrl(item.image_url)) {
      console.log(`ℹ️  Изображение уже корректное или не является ссылкой на Steam Market`);
      return;
    }

    console.log(`🔄 Парсим корректное изображение...`);
    const correctImageUrl = await parseImageFromSteamPage(item.image_url);

    if (correctImageUrl && isValidSteamImageUrl(correctImageUrl)) {
      await item.update({ image_url: correctImageUrl });
      console.log(`✅ Изображение исправлено!`);
      console.log(`   Новое изображение: ${correctImageUrl}`);
    } else {
      const defaultImage = 'https://community.fastly.steamstatic.com/economy/image/6TMcQ7eX6E0EZl2byXi7vaVtMyCbg7JT9Nj26yLB0uiTHKECVqCQJYPQOiKc1A9hdeGdqRmPbEbD8Q_VfQ/256fx256f';
      await item.update({ image_url: defaultImage });
      console.log(`⚠️  Использовано дефолтное изображение`);
    }

  } catch (error) {
    console.error(`❌ Ошибка при исправлении изображения для ${itemName}:`, error.message);
  }
}

// Экспортируем функции
module.exports = {
  fixAllItemImages,
  fixSpecificItemImage
};

// Если скрипт запущен напрямую
if (require.main === module) {
  (async () => {
    try {
      const itemName = process.argv[2];

      if (itemName) {
        // Исправляем конкретный предмет
        await fixSpecificItemImage(itemName);
      } else {
        // Исправляем все предметы
        await fixAllItemImages();
      }
    } catch (error) {
      console.error('❌ Общая ошибка:', error.message);
    } finally {
      process.exit(0);
    }
  })();
}
