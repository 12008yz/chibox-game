#!/usr/bin/env node

/**
 * Скрипт для исправления exterior предмета в базе данных
 */

const { Item } = require('../models');

async function fixItemExterior() {
  try {
    console.log('🔧 Исправление exterior предмета MP9 | Slide...');

    // Находим предмет MP9 | Slide (Well-Worn)
    const item = await Item.findOne({
      where: {
        steam_market_hash_name: 'MP9 | Slide (Well-Worn)'
      }
    });

    if (!item) {
      console.log('❌ Предмет MP9 | Slide (Well-Worn) не найден в базе данных');
      return;
    }

    console.log('📦 Найден предмет:');
    console.log(`  - ID: ${item.id}`);
    console.log(`  - Название: ${item.name}`);
    console.log(`  - Market Hash Name: ${item.steam_market_hash_name}`);
    console.log(`  - Exterior: ${item.exterior}`);

    // Обновляем на Field-Tested
    await item.update({
      name: 'MP9 | Slide (Field-Tested)',
      steam_market_hash_name: 'MP9 | Slide (Field-Tested)',
      exterior: 'Field-Tested'
    });

    console.log('✅ Предмет обновлен на:');
    console.log(`  - Название: ${item.name}`);
    console.log(`  - Market Hash Name: ${item.steam_market_hash_name}`);
    console.log(`  - Exterior: ${item.exterior}`);

  } catch (error) {
    console.error('💥 Ошибка:', error);
  }

  process.exit(0);
}

fixItemExterior();
