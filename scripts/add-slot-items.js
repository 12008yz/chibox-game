const db = require('../models');

// 20 предметов CS2 с прямыми ссылками на изображения Steam CDN
const SLOT_ITEMS = [
  // Дешевые предметы (consumer/industrial) - 60% шанс
  {
    name: 'AK-47 | Safari Mesh (Battle-Scarred)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot7HxfDhjxszJemkV09-5lpKKqPrxN7LEmyUItgOxm7-TptStj1Hj-ENrNTrxLIOdcgQ3M1yE_gTvx-jvh5K1vcrMn3Jn6HEj4SrD30vgn1gSOaWC0wbV',
    price: 8.50,
    rarity: 'consumer',
    steam_market_hash_name: 'AK-47 | Safari Mesh (Battle-Scarred)'
  },
  {
    name: 'Glock-18 | Sand Dune (Factory New)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposbaqKAxf0Ob3djFN79eJmIWPkuXLNqjCmyUI6sI_3e2V8Nn0jFe18kNvYWygctfEcFRsZ1qCrFPrlOzuhZHuvsjOzydj6HUl4HjZlBzvhk8dOOhukfmACQLJFSNHY7U',
    price: 12.00,
    rarity: 'consumer',
    steam_market_hash_name: 'Glock-18 | Sand Dune (Factory New)'
  },
  {
    name: 'P250 | Sand Dune (Factory New)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpopujwezhh0szYI2gS09OOgImMn-O6YbuGkDwFsZx1i7mT8Y-giVe28kNqN2-hLdDBJFU6YgqCqQPrxOnrjZa07pXOyiRjvSIg4S7Ym0PjhRkMOONukfmACQLJUkWKPes',
    price: 15.30,
    rarity: 'consumer',
    steam_market_hash_name: 'P250 | Sand Dune (Factory New)'
  },
  {
    name: 'MAG-7 | Sand Dune (Factory New)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou6ryFAZu7P3JZzxN5cOyga-FlaKlY-6Hxz0AsZ0ljL2Qo42miQzi-ERpMj-hJ9SSJw9tYFCB-lC7wOjt08O_tc7AyHU36id17HvbzBPj0x5SLrs4/360fx360f',
    price: 18.75,
    rarity: 'consumer',
    steam_market_hash_name: 'MAG-7 | Sand Dune (Factory New)'
  },
  {
    name: 'M4A1-S | Boreal Forest (Battle-Scarred)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhjxszYfi5H5di5mIWKkuXLNqjcgjMJvZd1iOyTpImsjgLs8hBtZ2HycYOTdFBvYA3S-lHqye7ohpO-7p_ByXNjviAitX7VmRXihU1EPONr1uuaHhyLUEsetvfWbcU',
    price: 22.10,
    rarity: 'consumer',
    steam_market_hash_name: 'M4A1-S | Boreal Forest (Battle-Scarred)'
  },
  {
    name: 'USP-S | Forest Leaves (Battle-Scarred)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpoo6m1FBRp3_bGcjhQ09ulq4yCkP_gfe_VlWgHsJR33uyUpYqk2QCy8UJlZjjzdYSUdQU9MlGG_AS7x7_uhp-57ZXIziFmuykl5S7YmRe01koeauJ-gKCaHhyLUEsevYHSHKI',
    price: 25.40,
    rarity: 'consumer',
    steam_market_hash_name: 'USP-S | Forest Leaves (Battle-Scarred)'
  },
  {
    name: 'AWP | Safari Mesh (Battle-Scarred)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17PLfYQJD_9W7m5a0mvLwOq7c2DxS652wne-Sp4j3jgLhqUJrN2z6LdCXdFQ_aVrQ-wO-xL3ohJ_puc_Kyno17CMn4GGdwUIjb_GJaw',
    price: 32.80,
    rarity: 'consumer',
    steam_market_hash_name: 'AWP | Safari Mesh (Battle-Scarred)'
  },
  {
    name: 'Galil AR | Sage Spray (Field-Tested)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposbupIgthwczbYQJF7c6yh4-FmOTxDL_SkG0D7ZEl3-qU8Nmh2VHn80VlNWD1dtDBJAQ7ZlrYrATqyLi-0Z696piam3ZnsiZw4izUlR3kh0tLPbFph_-ACQLJGOgwLzE',
    price: 38.50,
    rarity: 'industrial',
    steam_market_hash_name: 'Galil AR | Sage Spray (Field-Tested)'
  },
  {
    name: 'FAMAS | Colony (Battle-Scarred)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposLuoKhRf0Ob3YjoXucmJmOTLP7LWnn9u5cRTjNak8Yyn3g7sr0M5MW7xcYDEcgE9Zw6G_1K7_wK8yb-615676pnIm3JjvyJws3uJmB60iBoePrdpiqubH5aOOEAk5fdTHDsF',
    price: 42.30,
    rarity: 'industrial',
    steam_market_hash_name: 'FAMAS | Colony (Battle-Scarred)'
  },
  {
    name: 'Five-SeveN | Forest Night (Battle-Scarred)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposem2LFZfwOP3YTxK6eOgk5O0hPbkDrjQhGpC7cR9g-7--YXygED68kBlazymJIKWIwA9aVCGrlG_k7vt1p6-vZqbyHZrviNz7SnD30vgFrwhzSo',
    price: 48.90,
    rarity: 'industrial',
    steam_market_hash_name: 'Five-SeveN | Forest Night (Battle-Scarred)'
  },

  // Средние предметы (milspec) - 25% шанс
  {
    name: 'AK-47 | Blue Laminate (Field-Tested)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot7HxfDhjxszJemkV09OFkoyKkfL1I6vdk1Rd4cJ5nqeQrYqs3QWy8kVqYzuiJNfDegU7N17T8wO6kuzqhZC5ucmfzHBguHMj7ivezhXm1EtIarJpgqOeH5aOOUgggVqHNjIJ',
    price: 85.70,
    rarity: 'milspec',
    steam_market_hash_name: 'AK-47 | Blue Laminate (Field-Tested)'
  },
  {
    name: 'M4A1-S | Dark Water (Field-Tested)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhjxszFJTwT09OJnLq0k_PgZbfUhWNI7o4l2rCXpd6m3lLtrhBrZ2qgddCQelRrZw7QrlK9w-e7g8Tuot2Xno0GqeS_',
    price: 120.50,
    rarity: 'milspec',
    steam_market_hash_name: 'M4A1-S | Dark Water (Field-Tested)'
  },
  {
    name: 'AWP | Worm God (Factory New)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17P7NDhRF7di2kL-HluL1IazunWxC6JFi3ejFpYuhiQPirhA6YWr3LNKcJlU8YQrRrFK9x7q605-_vpqYynZmu3AngX-PmRa-0h8YOOdugLWSUAOPRVpWQKCPZw',
    price: 180.25,
    rarity: 'milspec',
    steam_market_hash_name: 'AWP | Worm God (Factory New)'
  },
  {
    name: 'P250 | Hive (Factory New)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpopujwezhh0szYfi5H6dOJmIGfqOP1PrLQmlJf_dNOhuDG_Zi7iQXgr0JqMWHxLNXGclU4Yw3W_Fi7lOzrg8Tr6cqdzyY17SE8pSGK6t3Kg6',
    price: 215.80,
    rarity: 'milspec',
    steam_market_hash_name: 'P250 | Hive (Factory New)'
  },
  {
    name: 'Galil AR | Eco (Factory New)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposbupIgthwczJfAFN6de4kIXZlefxP6_Igm9U65F1i7uQo96g0FHj-kptMW-hdoKcIVU6YA7VqVfoxOnnhJLvtMycn3Jl6SEj5H6Pn0e21BJKOuM4g_eACQLJt0z2zUY',
    price: 280.40,
    rarity: 'milspec',
    steam_market_hash_name: 'Galil AR | Eco (Factory New)'
  },

  // Дорогие предметы (restricted/classified) - 12% шанс
  {
    name: 'AK-47 | Redline (Field-Tested)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot7HxfDhjxszJemkV09-5lpKKqPrxN7LEmyUJ6cYo2e2Yp4msiVXs80c-amH6I4OSdVdqY1CH_gC6x-i8g8S-tZuamHRgvnUn5irZmUHhgE8Ya7M7hqSbUxzJUlNMQrfEaQqzJQ',
    price: 950.75,
    rarity: 'restricted',
    steam_market_hash_name: 'AK-47 | Redline (Field-Tested)'
  },
  {
    name: 'M4A4 | Asiimov (Field-Tested)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhjxszFJTwT09S5k4m0lvLwOq7c2DsHs50p3r6Zp9yg0AHsrUpoMjqnJNOWegJvZl3T-lG-lrq7h8e5vpXKnXplsyIn4GGdwUKxGnj0',
    price: 1250.90,
    rarity: 'restricted',
    steam_market_hash_name: 'M4A4 | Asiimov (Field-Tested)'
  },
  {
    name: 'AWP | Asiimov (Field-Tested)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17PLfYQJO_9W5nZSOz7HKYOiAwWgJtZN3jOyZrYiqjlHgrkZsZzymINPBcgE2aVrU_lS3xubug8e-vZybynJrs3QqsizUzkSziQYMMLLlXj6IeA',
    price: 1850.35,
    rarity: 'restricted',
    steam_market_hash_name: 'AWP | Asiimov (Field-Tested)'
  },

  // Очень дорогие предметы (covert) - 3% шанс
  {
    name: 'AK-47 | Fire Serpent (Field-Tested)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot7HxfDhjxszJemkV08-5mL-HluL1IazllWgE651zj7mZ9I6ljALsrRE9Nj-lLYWRIwZsZFqC_QC_kO6-hJPqus6YyXNmuiI8pSGKM6x7SoE',
    price: 12500.00,
    rarity: 'covert',
    steam_market_hash_name: 'AK-47 | Fire Serpent (Field-Tested)'
  },
  {
    name: 'AWP | Dragon Lore (Field-Tested)',
    image_url: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17PLfYQJD_9W5nZSOz7XVZuvTwjgEsJBwjujE896l3lay_kVqZjz6cNWVdARvZluE8gOggbC4h8C8vpubmHM2s3F3sSvZn0GynB8YOOHy_eqCAQLJgmOA5yo',
    price: 35000.00,
    rarity: 'covert',
    steam_market_hash_name: 'AWP | Dragon Lore (Field-Tested)'
  }
];

async function addSlotItems() {
  try {
    console.log('🎰 Добавляем предметы для слот-машины...\n');

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    // Обрабатываем каждый предмет индивидуально
    for (const itemData of SLOT_ITEMS) {
      try {
        console.log(`🔄 Обрабатываем: ${itemData.name}`);

        // Проверяем, существует ли предмет
        const existingItem = await db.Item.findOne({
          where: {
            steam_market_hash_name: itemData.steam_market_hash_name
          }
        });

        if (existingItem) {
          // Обновляем существующий предмет
          await existingItem.update({
            name: itemData.name,
            image_url: itemData.image_url,
            price: itemData.price,
            rarity: itemData.rarity,
            steam_market_url: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(itemData.steam_market_hash_name)}`,
            is_available: true,
            in_stock: true,
            origin: 'slot_machine', // специальная метка для предметов слота
            weapon_type: itemData.name.includes('AK-47') ? 'Rifle' :
                        itemData.name.includes('AWP') ? 'Sniper Rifle' :
                        itemData.name.includes('M4A') ? 'Rifle' :
                        itemData.name.includes('Glock') || itemData.name.includes('P250') || itemData.name.includes('USP') || itemData.name.includes('Five-SeveN') ? 'Pistol' :
                        itemData.name.includes('Galil') || itemData.name.includes('FAMAS') ? 'Rifle' :
                        itemData.name.includes('MAG-7') ? 'Shotgun' : 'Other'
          });

          console.log(`✅ Обновлен: ${existingItem.name} (${existingItem.rarity}) - ${existingItem.price}₽`);
          updatedCount++;
        } else {
          // Создаем новый предмет
          const newItem = await db.Item.create({
            name: itemData.name,
            image_url: itemData.image_url,
            price: itemData.price,
            rarity: itemData.rarity,
            steam_market_hash_name: itemData.steam_market_hash_name,
            steam_market_url: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(itemData.steam_market_hash_name)}`,
            is_available: true,
            in_stock: true,
            origin: 'slot_machine', // специальная метка для предметов слота
            weapon_type: itemData.name.includes('AK-47') ? 'Rifle' :
                        itemData.name.includes('AWP') ? 'Sniper Rifle' :
                        itemData.name.includes('M4A') ? 'Rifle' :
                        itemData.name.includes('Glock') || itemData.name.includes('P250') || itemData.name.includes('USP') || itemData.name.includes('Five-SeveN') ? 'Pistol' :
                        itemData.name.includes('Galil') || itemData.name.includes('FAMAS') ? 'Rifle' :
                        itemData.name.includes('MAG-7') ? 'Shotgun' : 'Other'
          });

          console.log(`✅ Создан: ${newItem.name} (${newItem.rarity}) - ${newItem.price}₽`);
          createdCount++;
        }

      } catch (error) {
        console.error(`❌ Ошибка при обработке ${itemData.name}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n🎉 Обработка завершена:`);
    console.log(`  ✅ Создано новых: ${createdCount}`);
    console.log(`  🔄 Обновлено: ${updatedCount}`);
    console.log(`  ❌ Ошибок: ${errorCount}`);
    console.log(`  📊 Всего предметов: ${createdCount + updatedCount}`);

    // Проверяем что все изображения доступны
    console.log('\n🔍 Проверяем готовые предметы слота...');
    const slotItems = await db.Item.findAll({
      where: { origin: 'slot_machine' },
      attributes: ['name', 'image_url', 'rarity', 'price'],
      order: [['rarity', 'ASC'], ['price', 'ASC']]
    });

    console.log(`📊 Найдено ${slotItems.length} предметов слота с изображениями`);

    // Группируем по редкости
    const rarityStats = {};
    slotItems.forEach(item => {
      if (!rarityStats[item.rarity]) {
        rarityStats[item.rarity] = { count: 0, minPrice: Infinity, maxPrice: 0 };
      }
      rarityStats[item.rarity].count++;
      rarityStats[item.rarity].minPrice = Math.min(rarityStats[item.rarity].minPrice, parseFloat(item.price));
      rarityStats[item.rarity].maxPrice = Math.max(rarityStats[item.rarity].maxPrice, parseFloat(item.price));
    });

    console.log('\n📋 Распределение по редкости:');
    Object.entries(rarityStats).forEach(([rarity, stats]) => {
      console.log(`  ${rarity}: ${stats.count} предметов (${stats.minPrice}₽ - ${stats.maxPrice}₽)`);
    });

    console.log('\n✅ Предметы для слота готовы к использованию!');
    console.log('🎮 Теперь можно запускать слот-машину');

  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
  } finally {
    await db.sequelize.close();
  }
}

// Запуск если файл выполняется напрямую
if (require.main === module) {
  addSlotItems();
}

module.exports = { addSlotItems, SLOT_ITEMS };
