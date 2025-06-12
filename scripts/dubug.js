#!/usr/bin/env node

/**
 * Скрипт для отладки withdrawal - показывает что именно ищется и что есть в наличии
 */

const { Withdrawal, User, UserInventory, Item } = require('../models');
const SteamBot = require('../services/steamBotService');
const steamBotConfig = require('../config/steam_bot.js');

// Инициализируем Steam бота
const steamBot = new SteamBot(
  steamBotConfig.accountName,
  steamBotConfig.password,
  steamBotConfig.sharedSecret,
  steamBotConfig.identitySecret,
  steamBotConfig.steamApiKey
);

async function debugWithdrawal() {
  try {
    console.log('🔍 Отладка withdrawal...\n');

    // Получаем pending withdrawal
    const withdrawals = await Withdrawal.findAll({
      where: { status: 'pending' },
      attributes: ['id', 'user_id', 'status', 'steam_trade_url', 'tracking_data'],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'steam_trade_url']
        },
        {
          model: UserInventory,
          as: 'items',
          include: [
            {
              model: Item,
              as: 'item',
              attributes: ['id', 'name', 'steam_market_hash_name', 'exterior']
            }
          ]
        }
      ]
    });

    if (withdrawals.length === 0) {
      console.log('❌ Нет pending withdrawal');
      return;
    }

    console.log(`📋 Найдено ${withdrawals.length} pending withdrawal:\n`);

    for (const withdrawal of withdrawals) {
      console.log(`🎯 Withdrawal ID: ${withdrawal.id}`);
      console.log(`👤 Пользователь: ${withdrawal.user.username} (ID: ${withdrawal.user.id})`);
      console.log(`🔗 Trade URL в withdrawal: ${withdrawal.steam_trade_url || 'НЕТ'}`);
      console.log(`🔗 Trade URL в user: ${withdrawal.user.steam_trade_url || 'НЕТ'}`);
      console.log(`📦 Количество предметов в withdrawal: ${withdrawal.items.length}`);

      console.log('\n📦 Предметы в withdrawal:');
      for (const userItem of withdrawal.items) {
        const item = userItem.item;
        console.log(`  - ID: ${item.id}`);
        console.log(`  - Название: ${item.name}`);
        console.log(`  - Market Hash Name: ${item.steam_market_hash_name}`);
        console.log(`  - Exterior: ${item.exterior || 'НЕТ'}`);
        console.log(`  - Полное имя для поиска: ${item.steam_market_hash_name}${item.exterior ? ` (${item.exterior})` : ''}`);
        console.log('');
      }
    }

    // Получаем инвентарь бота
    console.log('🔐 Авторизация Steam бота...');
    await steamBot.login();
    console.log('✅ Steam бот авторизован\n');

    console.log('📦 Загружаем инвентарь Steam бота...');
    const botInventory = await steamBot.getInventory(730, 2, true);
    console.log(`📦 В инвентаре бота ${botInventory.length} предметов:\n`);

    for (const [index, item] of botInventory.entries()) {
      console.log(`${index + 1}. ${item.market_hash_name} (Asset ID: ${item.assetid})`);
    }

    console.log('\n🔍 Проверка совпадений:');
    for (const withdrawal of withdrawals) {
      console.log(`\nWithdrawal #${withdrawal.id}:`);
      for (const userItem of withdrawal.items) {
        const item = userItem.item;
        const searchName = item.steam_market_hash_name;

        const found = botInventory.find(botItem =>
          botItem.market_hash_name === searchName
        );

        if (found) {
          console.log(`  ✅ НАЙДЕН: ${searchName} -> ${found.assetid}`);
        } else {
          console.log(`  ❌ НЕ НАЙДЕН: ${searchName}`);
          console.log(`     Возможные совпадения:`);

          // Ищем похожие названия
          const similar = botInventory.filter(botItem =>
            botItem.market_hash_name.toLowerCase().includes(searchName.toLowerCase().split(' ')[0])
          );

          if (similar.length > 0) {
            similar.forEach(s => console.log(`       - ${s.market_hash_name}`));
          } else {
            console.log(`       Нет похожих предметов`);
          }
        }
      }
    }

  } catch (error) {
    console.error('💥 Ошибка:', error);
  }

  process.exit(0);
}

debugWithdrawal();
