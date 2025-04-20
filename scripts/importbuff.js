const axios = require('axios');
const db = require('../models'); // путь к index.js ваших моделей

const BUFF_MARKET_URL = 'https://buff.163.com/api/market/goods';

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
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Cookie': 'Device-Id=SQniopinEfgAKr91ZwXk; Locale-Supported=ru; NTES_YD_SESS=W8L.q_IToAN5xq.E.1Md_GNEqTCpJzExyUURx6fdV3K5n8oQh01DuZYckxOD9XcvXCxcZBYqWEUZzPAtOIxpIK6I5M4wzLeIfVWK_lSMU4tyWbZxWnFZ2WZCu2PHjKt5Tp2YXGSoF2hkp4xoGiVGX0KA2q_hjE4z4xGmO5YdE.0jnFORUKLR1fmQO5lIqlK2FNF6qvt1OZnbYBeX5dhM35iq0rgOkTI.J.S1nw8ITQzoA; P_INFO=7-9015373927|1745167372|1|netease_buff|00&99|null&null&null#RU&null#10#0|&0|null|7-9015373927; S_INFO=1745167372|0|0&60##|7-9015373927; client_id=XDREWjnqRkbs0VkgDFk9wA; csrf_token=IjFlYjc5MWQ1NDUyOGFlYzgyYWZlNjZmOGE5NDFhMmM2Mjk1M2QwNjAi.aAUkQA.DTFCKB_l9QGPyrGBZzQz1wJIt6A; display_appids_v2="[730, 570]"; game=csgo; remember_me=U1085322525|vReLFKwOx7ra5ktHai2QjrAxrUOfURiG; session=1-42cgtzM82ln8qcOsB_xbTTA3FlZsxG_c0AgSTmF9IOtv2021534277',
        'Host': 'buff.163.com',
        'Referer': 'https://buff.163.com/market/csgo',
        'Sec-Ch-Ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        'X-Kl-Saas-Ajax-Request': 'Ajax_Request',
        'X-Requested-With': 'XMLHttpRequest',
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
  let rawDesc = item.goods_info?.info ?? "";
  let description;
  if (typeof rawDesc === "object") {
    description = JSON.stringify(rawDesc);
  } else if (typeof rawDesc === "string") {
    description = rawDesc;
  } else {
    description = String(rawDesc);
  }

  return {
    name: item.name,
    description,
    image_url: item.goods_info?.icon_url
      ? 'https://image.buff.163.com/' + item.goods_info.icon_url
      : null,
    price: item.sell_min_price || 0,
    rarity: 'common',
    drop_weight: 1,
    weapon_type: item.weapon_type || null,
    skin_name: item.goods_info?.info?.market_hash_name || null,
    category_id: null,
    steam_market_hash_name: item.goods_info?.market_hash_name || null,
    is_available: true,
    min_subscription_tier: 0,
    float_value: null,
    exterior: null,
    stickers: null,
    quality: null,
    buff_id: item.id ? String(item.id) : null,
    origin: item.goods_info?.collection || null,
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
      // Попробуем собрать разные варианты market_hash_name из объекта
      let hashName = buffItem.goods_info?.market_hash_name || 
                     buffItem.goods_info?.info?.market_hash_name || 
                     buffItem.goods_info?.steam_market_hash_name || 
                     buffItem.market_hash_name || 
                     null;
      console.log('hashName:', hashName);

      if (!hashName || seen.has(hashName)) continue;
      seen.add(hashName);

      const prepared = mapBuffItemToDb(buffItem);
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