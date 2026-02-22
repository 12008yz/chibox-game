'use strict';

const fs = require('fs');
const path = require('path');
const { sequelize, Item, CaseTemplate } = require('../models');
const { Op } = require('sequelize');

// Предметы из файла (цены в рублях)
function loadItemsFromFile() {
  const filePath = path.join(__dirname, '../docs/YooMoneyIntegration.md');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').slice(2);

  return lines
    .filter(l => l.trim() && l.includes('|'))
    .map(l => {
      const parts = l.split('|').map(p => p.trim());
      if (parts.length < 5) return null;
      const price = parseFloat(parts[3]) || 0;
      return { id: parts[0], name: parts[1], price, rarity: parts[4] };
    })
    .filter(i => i && i.price > 0);
}

// Конфигурация: какие предметы добавить к каким кейсам
const ADDITIONAL_ITEMS_CONFIG = [
  {
    caseId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', // Морской кейс (Легендарный) - 998₽
    caseName: 'Морской кейс (Легендарный)',
    priceRanges: [
      { min: 400, max: 700, count: 6 }, // Добавляем 6 предметов за 400-700₽
    ],
  },
  {
    caseId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', // Ледяной кейс (Мистический) - 2499₽
    caseName: 'Ледяной кейс (Мистический)',
    priceRanges: [
      { min: 1200, max: 1800, count: 4 }, // Добавляем 4 предмета за 1200-1800₽
      { min: 400, max: 900, count: 3 },   // Добавляем 3 предмета за 400-900₽
    ],
  },
  {
    caseId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', // Бурый кейс (Эпический) - 5000₽
    caseName: 'Бурый кейс (Эпический)',
    priceRanges: [
      { min: 2000, max: 3500, count: 4 }, // Добавляем 4 предмета за 2000-3500₽
      { min: 800, max: 1500, count: 3 },  // Добавляем 3 предмета за 800-1500₽
    ],
  },
  {
    caseId: '10101010-1010-1010-1010-101010101010', // Демонический кейс (Мифический) - 10000₽
    caseName: 'Демонический кейс (Мифический)',
    priceRanges: [
      { min: 5000, max: 8000, count: 4 },  // Добавляем 4 предмета за 5000-8000₽
      { min: 2000, max: 4000, count: 3 }, // Добавляем 3 предмета за 2000-4000₽
    ],
  },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function addCheaperItems() {
  const fileItems = loadItemsFromFile();
  console.log(`📋 Загружено предметов из файла: ${fileItems.length} (цены в рублях)\n`);

  const allIds = fileItems.map(i => i.id);
  const dbItems = await Item.findAll({
    where: { id: { [Op.in]: allIds } },
    attributes: ['id', 'name', 'price', 'rarity'],
  });
  const dbById = new Map(dbItems.map(i => [i.id, i]));

  for (const config of ADDITIONAL_ITEMS_CONFIG) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`📦 ${config.caseName}`);

    const template = await CaseTemplate.findByPk(config.caseId, {
      include: [{ model: Item, as: 'items', through: { attributes: [] } }],
    });

    if (!template) {
      console.log(`   ❌ Кейс не найден в БД.\n`);
      continue;
    }

    const existingItemIds = new Set(template.items.map(i => i.id));
    console.log(`   📋 Текущее количество предметов: ${existingItemIds.size}`);

    const newItemIds = [];

    for (const range of config.priceRanges) {
      // Ищем предметы в диапазоне, которых еще нет в кейсе
      let pool = fileItems.filter(
        (i) => 
          i.price >= range.min && 
          i.price <= range.max && 
          dbById.has(i.id) &&
          !existingItemIds.has(i.id) // Только те, которых еще нет
      );

      if (pool.length === 0) {
        console.log(`   ⚠️  Диапазон ₽${range.min}-${range.max}: нет доступных предметов (все уже в кейсе или нет в БД)`);
        continue;
      }

      const shuffled = shuffle(pool);
      const selected = shuffled.slice(0, range.count);

      for (const s of selected) {
        newItemIds.push(s.id);
        existingItemIds.add(s.id);
      }

      console.log(`   ✅ Диапазон ₽${range.min}-${range.max}: добавлено ${selected.length} из ${range.count} запрошенных`);
      
      if (selected.length > 0) {
        const prices = selected.map(s => s.price);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        console.log(`      Цены: от ${minP.toFixed(0)}₽ до ${maxP.toFixed(0)}₽`);
      }
    }

    if (newItemIds.length === 0) {
      console.log(`   ⚠️  Не удалось добавить новые предметы (все уже есть в кейсе или нет подходящих)\n`);
      continue;
    }

    const newItems = newItemIds.map(id => dbById.get(id)).filter(Boolean);
    await template.addItems(newItems);

    // Перезагружаем для статистики
    await template.reload({
      include: [{ model: Item, as: 'items', through: { attributes: [] } }],
    });

    const finalItems = template.items;
    const prices = finalItems.map(i => parseFloat(i.price) || 0).filter(p => p > 0);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const avgP = prices.reduce((a, b) => a + b, 0) / prices.length;
    const rtp = template.price > 0 ? ((avgP / template.price) * 100).toFixed(1) : '-';

    console.log(`\n   📊 ИТОГОВАЯ СТАТИСТИКА:`);
    console.log(`      Всего предметов: ${finalItems.length} (добавлено: ${newItems.length})`);
    console.log(`      Цены: от ${minP.toFixed(0)}₽ до ${maxP.toFixed(0)}₽`);
    console.log(`      Средняя цена: ${avgP.toFixed(0)}₽`);
    console.log(`      RTP: ${rtp}%\n`);
  }

  console.log('🎉 Добавление предметов завершено!');
}

addCheaperItems()
  .catch((err) => {
    console.error('❌ Ошибка:', err);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(() => sequelize.close());
