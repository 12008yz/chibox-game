const db = require('../models');
const { getSteamItemData } = require('./steam-item-fetcher');

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

// Функция для создания предмета из Steam URL
async function createItemFromSteamUrl(steamUrl) {
  try {
    const marketHashName = extractMarketHashNameFromUrl(steamUrl);
    if (!marketHashName) {
      throw new Error('Не удалось извлечь имя предмета из URL');
    }

    // Проверяем, существует ли уже такой предмет
    let item = await db.Item.findOne({
      where: { steam_market_hash_name: marketHashName }
    });

    if (item) {
      console.log(`✅ Предмет уже существует: ${marketHashName}`);
      return item;
    }

    console.log(`🔄 Получаем данные предмета: ${marketHashName}`);

    // Получаем данные с Steam
    const steamData = await getSteamItemData(marketHashName);

    if (steamData.error) {
      throw new Error(`Ошибка получения данных Steam: ${steamData.error}`);
    }

    // Конвертируем цену в рубли
    const priceUsd = steamData.price_usd || 0.10;
    const exchangeRate = 95;
    const priceRub = Math.round(priceUsd * exchangeRate * 100) / 100;

    // Извлекаем детали предмета
    const weaponType = marketHashName.split(' | ')[0] || 'Unknown';
    const skinPart = marketHashName.split(' | ')[1];
    const skinName = skinPart ? skinPart.replace(/\s*\([^)]*\)\s*$/, '').trim() : null;
    const exteriorMatch = marketHashName.match(/\(([^)]+)\)$/);
    const exterior = exteriorMatch ? exteriorMatch[1] : null;

    // Определяем редкость по цене
    let rarity = 'consumer';
    if (priceUsd >= 5) rarity = 'exotic';
    else if (priceUsd >= 1) rarity = 'covert';
    else if (priceUsd >= 0.5) rarity = 'classified';
    else if (priceUsd >= 0.2) rarity = 'restricted';
    else if (priceUsd >= 0.05) rarity = 'milspec';
    else if (priceUsd >= 0.01) rarity = 'industrial';

    // Создаем предмет
    item = await db.Item.create({
      name: marketHashName,
      description: `CS2 ${rarity} skin: ${marketHashName}`,
      image_url: steamData.item_info?.icon_url_large || steamData.item_info?.icon_url || null,
      price: priceRub,
      rarity: rarity,
      drop_weight: 1,
      min_subscription_tier: 0,
      weapon_type: weaponType,
      skin_name: skinName,
      steam_market_hash_name: marketHashName,
      is_available: true,
      exterior: exterior,
      quality: marketHashName.includes('StatTrak™') ? 'StatTrak' : null,
      in_stock: true,
      is_tradable: true,
      origin: 'manual_add'
    });

    console.log(`✅ Предмет создан: ${marketHashName} - ₽${priceRub}`);
    return item;

  } catch (error) {
    console.error(`❌ Ошибка создания предмета:`, error.message);
    throw error;
  }
}

async function addItemToUserInventory(userId, itemIdentifier) {
  try {
    let item;

    // Проверяем, что передано - URL или ID
    if (typeof itemIdentifier === 'string' && itemIdentifier.includes('steamcommunity.com')) {
      // Если передан Steam URL, создаем предмет
      item = await createItemFromSteamUrl(itemIdentifier);
    } else {
      // Если передан ID, ищем существующий предмет
      item = await db.Item.findOne({ where: { csmoney_id: itemIdentifier } });
      if (!item) {
        console.error(`Item with csmoney_id ${itemIdentifier} not found`);
        return;
      }
    }

    // Check if user already has this item in inventory with status 'inventory'
    const existingInventory = await db.UserInventory.findOne({
      where: {
        user_id: userId,
        item_id: item.id,
        status: 'inventory'
      }
    });

    if (existingInventory) {
      console.log(`User already has item ${item.name} in inventory`);
      return;
    }

    // Add item to user's inventory
    await db.UserInventory.create({
      user_id: userId,
      item_id: item.id,
      acquisition_date: new Date(),
      source: 'system',
      status: 'inventory'
    });

    console.log(`Item ${item.name} added to user ${userId} inventory successfully`);
  } catch (error) {
    console.error('Error adding item to user inventory:', error);
  }
}

// If run as script
if (require.main === module) {
  const userId = '4e7c4a6b-ed5e-4517-976d-66b663271437';
  const steamUrl = 'https://steamcommunity.com/market/listings/730/MP9%20%7C%20Slide%20%28Well-Worn%29';

  console.log('🚀 Добавляем предмет в инвентарь пользователя...');
  console.log(`👤 User ID: ${userId}`);
  console.log(`🔗 Steam URL: ${steamUrl}`);

  addItemToUserInventory(userId, steamUrl)
    .then(() => {
      console.log('✅ Операция завершена!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Ошибка:', error.message);
      process.exit(1);
    });
}

module.exports = {
  addItemToUserInventory,
  createItemFromSteamUrl,
  extractMarketHashNameFromUrl
};
