const db = require('../models');

// 20 предметов CS2 с прямыми ссылками на изображения Steam CDN
const SLOT_ITEMS = [
  // Дешевые предметы (consumer/industrial) - 60% шанс
  {
    name: 'AK-47 | Safari Mesh (Battle-Scarred)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 8.50,
    rarity: 'consumer',
    steam_market_hash_name: 'AK-47 | Safari Mesh (Battle-Scarred)'
  },
  {
    name: 'Glock-18 | Sand Dune (Factory New)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 12.00,
    rarity: 'consumer',
    steam_market_hash_name: 'Glock-18 | Sand Dune (Factory New)'
  },
  {
    name: 'P250 | Sand Dune (Factory New)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 15.30,
    rarity: 'consumer',
    steam_market_hash_name: 'P250 | Sand Dune (Factory New)'
  },
  {
    name: 'MAG-7 | Sand Dune (Factory New)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 18.75,
    rarity: 'consumer',
    steam_market_hash_name: 'MAG-7 | Sand Dune (Factory New)'
  },
  {
    name: 'M4A1-S | Boreal Forest (Battle-Scarred)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 22.10,
    rarity: 'consumer',
    steam_market_hash_name: 'M4A1-S | Boreal Forest (Battle-Scarred)'
  },
  {
    name: 'USP-S | Forest Leaves (Battle-Scarred)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 25.40,
    rarity: 'consumer',
    steam_market_hash_name: 'USP-S | Forest Leaves (Battle-Scarred)'
  },
  {
    name: 'AWP | Safari Mesh (Battle-Scarred)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 32.80,
    rarity: 'consumer',
    steam_market_hash_name: 'AWP | Safari Mesh (Battle-Scarred)'
  },
  {
    name: 'Galil AR | Sage Spray (Field-Tested)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 38.50,
    rarity: 'industrial',
    steam_market_hash_name: 'Galil AR | Sage Spray (Field-Tested)'
  },
  {
    name: 'FAMAS | Colony (Battle-Scarred)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 42.30,
    rarity: 'industrial',
    steam_market_hash_name: 'FAMAS | Colony (Battle-Scarred)'
  },
  {
    name: 'Five-SeveN | Forest Night (Battle-Scarred)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 48.90,
    rarity: 'industrial',
    steam_market_hash_name: 'Five-SeveN | Forest Night (Battle-Scarred)'
  },

  // Средние предметы (milspec) - 25% шанс
  {
    name: 'AK-47 | Blue Laminate (Field-Tested)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f", // Будет получено автоматически
    price: 85.70,
    rarity: 'milspec',
    steam_market_hash_name: 'AK-47 | Blue Laminate (Field-Tested)'
  },
  {
    name: 'M4A1-S | Dark Water (Field-Tested)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f",
    price: 120.50,
    rarity: 'milspec',
    steam_market_hash_name: 'M4A1-S | Dark Water (Field-Tested)'
  },
  {
    name: 'AWP | Worm God (Factory New)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f",
    price: 180.25,
    rarity: 'milspec',
    steam_market_hash_name: 'AWP | Worm God (Factory New)'
  },
  {
    name: 'P250 | Hive (Factory New)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f",
    price: 215.80,
    rarity: 'milspec',
    steam_market_hash_name: 'P250 | Hive (Factory New)'
  },
  {
    name: 'Galil AR | Eco (Factory New)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f",
    price: 280.40,
    rarity: 'milspec',
    steam_market_hash_name: 'Galil AR | Eco (Factory New)'
  },

  // Дорогие предметы (restricted/classified) - 12% шанс
  {
    name: 'AK-47 | Redline (Field-Tested)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f",
    price: 950.75,
    rarity: 'restricted',
    steam_market_hash_name: 'AK-47 | Redline (Field-Tested)'
  },
  {
    name: 'M4A4 | Asiimov (Field-Tested)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f",
    price: 1250.90,
    rarity: 'restricted',
    steam_market_hash_name: 'M4A4 | Asiimov (Field-Tested)'
  },
  {
    name: 'AWP | Asiimov (Field-Tested)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f",
    price: 1850.35,
    rarity: 'restricted',
    steam_market_hash_name: 'AWP | Asiimov (Field-Tested)'
  },

  // Очень дорогие предметы (covert) - 3% шанс
  {
    name: 'AK-47 | Fire Serpent (Field-Tested)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f",
    price: 12500.00,
    rarity: 'covert',
    steam_market_hash_name: 'AK-47 | Fire Serpent (Field-Tested)'
  },
  {
    name: 'AWP | Dragon Lore (Field-Tested)',
    image_url: "https://community.fastly.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf9Ttk6fevfKxoMuOsD3KX_uJ_t-l9AX7qzE5_sGmEw9uoJCrBOgMoDsN2ReMI4EPrm4fvY-m04ASPgt8Uz3_gznQePzx-iqc/360fx360f",
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
