const axios = require('axios');
const db = require('../models'); // путь к index.js ваших моделей
const buffConfig = require('../config/buff_config.json');

const BUFF_MARKET_URL = 'https://buff.163.com/api/market/goods';

// Соответствие rarity из BUFF -> твой ENUM
const rarityMap = {
  common: 'consumer',
  uncommon: 'industrial',
  rare: 'milspec',
  epic: 'restricted',
  mythical: 'exotic',
  ancient_weapon: 'exotic',      // BUFF -> твой ENUM
  legendary: 'covert',
  immortal: 'exotic',
  exotic: 'exotic',
  extraordinary: 'covert',
  default: 'consumer'
};

// (опционально — если ENUM exterior)
const exteriorMap = {
  'Factory New': 'Factory New',
  'Minimal Wear': 'Minimal Wear',
  'Field-Tested': 'Field-Tested',
  'Well-Worn': 'Well-Worn',
  'Battle-Scarred': 'Battle-Scarred',
  wearcategory0: 'Factory New',
  wearcategory1: 'Minimal Wear',
  wearcategory2: 'Field-Tested',
  wearcategory3: 'Well-Worn',
  wearcategory4: 'Battle-Scarred'
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchBuffSkins({ game = 'csgo', page_num = 1, page_size = 80 }, retries = 3) {
  try {
    const response = await axios.get(BUFF_MARKET_URL, {
      params: {
        game,
        page_num,
        page_size,
        sort_by: 'price.asc',
        _: Date.now(),
      },
    headers: {
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'ru,en;q=0.9',
        'connection': 'keep-alive',
        'cookie': buffConfig.cookies,
        'host': 'buff.163.com',
        'referer': 'https://buff.163.com/market/csgo',
        'sec-ch-ua': '"Chromium";v="128", "Not;A=Brand";v="24", "YaBrowser";v="24.10", "Yowser";v="2.5"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 YaBrowser/24.10.0.0 Safari/537.36',
        'x-kl-saas-ajax-request': 'Ajax_Request',
        'x-requested-with': 'XMLHttpRequest',
      }
    });
    if (response.data.code !== 'OK') {
      console.log("Ответ BUFF API:", response.data);
      throw new Error('Ошибка BUFF API!');
    }
    return response.data.data.items;
  } catch (err) {
    if (err.response && err.response.status === 429 && retries > 0) {
      console.log('429 Too Many Requests, делаю паузу 20 секунд и пробую ещё раз...');
      await delay(20000);
      return fetchBuffSkins({ game, page_num, page_size }, retries - 1);
    }
    throw err;
  }
}

function mapBuffItemToDb(item) {
  const info = item.goods_info?.info ?? {};
  const tags = info.tags || {};

  // Получаем имя, тип; отбрасываем стикеры (и др. ненужные типы)
  const name = item.name
    || item.market_hash_name
    || item.goods_info?.market_hash_name
    || info.market_hash_name
    || null;

  const type = (tags.type?.internal_name || '').toLowerCase();

  if (
    !name ||
    name.startsWith('Sticker |') ||
    type.includes('sticker')
    // если нужно — добавь другие фильтры: 'graffiti', 'patch', ...
  ) {
    // Можно логировать все отброшенные предметы для анализа:
    // console.log('[SKIP]', name, type);
    return null;
  }

  const marketHash = item.market_hash_name
    || item.goods_info?.market_hash_name
    || info.market_hash_name
    || null;

  // --- Маппинг по rarity и exterior ---
  const rawRarity = tags.rarity?.internal_name || 'common';
  const rarity = rarityMap[rawRarity] || rarityMap.default;

  const rawExterior = tags.exterior?.internal_name || tags.exterior?.localized_name || null;
  const exterior = exteriorMap[rawExterior] || tags.exterior?.localized_name || null;

  // --- Корректный image_url ---
  let image_url = item.goods_info?.icon_url || '';
  if (image_url && !image_url.startsWith('http')) {
    image_url = 'https://image.buff.163.com/' + image_url;
  }

  return {
    name,
    description: JSON.stringify(info),
    image_url: image_url || null,
    price: parseFloat(item.quick_price) || 0,
    rarity,
    drop_weight: 1,
    weapon_type: tags.weapon?.internal_name || null,
    skin_name: marketHash,
    category_id: null,
    steam_market_hash_name: marketHash,
    is_available: true,
    min_subscription_tier: 0,
    float_value: null,
    exterior,
    stickers: null,
    quality: tags.quality?.internal_name || null,
    buff_id: item.id ? String(item.id) : null,
    origin: tags.category?.localized_name || null,
    // Raw Buff fields for import
    buff_rarity: tags.rarity?.internal_name || null,
    buff_quality: tags.quality?.internal_name || null,
    buff_type: tags.type?.internal_name || null,
    buff_exterior: tags.exterior?.internal_name || tags.exterior?.localized_name || null,
    buff_weapon: tags.weapon?.internal_name || null,
    buff_category: tags.category?.internal_name || null,
    buff_tags: tags || null,
  };
}

async function saveOrUpdateUniqueItem(prepared) {
  if (!prepared.steam_market_hash_name) return; // только уникальные!
  const [item, created] = await db.Item.findOrCreate({
    where: { steam_market_hash_name: prepared.steam_market_hash_name },
    defaults: prepared
  });
  if (!created) {
    await item.update(prepared);
  }
}

async function importUniqueBuffItems() {
  let page = 1;
  let totalImported = 0;
  const pageSize = 80;
  const seen = new Set();

  while (true) {
    console.log(`\n=== Загружаю страницу №${page}... ===`);
    let items = [];
    try {
      items = await fetchBuffSkins({ page_num: page, page_size: pageSize });
    } catch (e) {
      console.error('Ошибка при загрузке страницы', page, e);
      break;
    }
    if (!items.length) {
      console.log('Нет предметов на странице. Импорт завершён.');
      break;
    }

    if (page === 1 && items.length > 0) {
      console.log('Структура первого предмета с BUFF:');
      console.log(JSON.stringify(items[0], null, 2));
    }

    let countOnPage = 0;
    for (const buffItem of items) {
      let hashName = buffItem.goods_info?.market_hash_name 
        || buffItem.goods_info?.info?.market_hash_name 
        || buffItem.goods_info?.steam_market_hash_name 
        || buffItem.market_hash_name 
        || null;
      // дубли не сохраняем
      if (!hashName || seen.has(hashName)) continue;
      seen.add(hashName);

      const prepared = mapBuffItemToDb(buffItem);
      if (!prepared) continue; // пропускаем отфильтрованные (стикеры и т.п.)
      await saveOrUpdateUniqueItem({...prepared, steam_market_hash_name: hashName});
      totalImported++;
      countOnPage++;
    }

    console.log(`Добавлено уникальных предметов на странице: ${countOnPage}, всего: ${totalImported}`);

    if (items.length < pageSize) break; // если страница неполная — конец
    page++;
    await delay(3000);
  }
  console.log('Импортировано уникальных предметов за всё время:', totalImported);
}

importUniqueBuffItems()
  .then(() => console.log('Импорт завершён полностью!'))
  .catch(console.error);
