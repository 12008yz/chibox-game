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

// Платные кейсы: id, название, цена, диапазоны цен (руб) и количество предметов
const CASE_CONFIGS = [
  {
    id: '88888888-8888-8888-8888-888888888888',
    name: 'Бронзовый кейс',
    price: 17,
    priceRanges: [
      { min: 1, max: 25, count: 8 },
      { min: 25, max: 60, count: 6 },
      { min: 60, max: 150, count: 4 },
      { min: 150, max: 500, count: 2 },
    ],
  },
  {
    id: '99999999-9999-9999-9999-999999999999',
    name: 'Пушистый кейс',
    price: 49,
    priceRanges: [
      { min: 10, max: 50, count: 8 },
      { min: 50, max: 150, count: 8 },
      { min: 150, max: 400, count: 6 },
      { min: 400, max: 1200, count: 3 },
    ],
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    name: 'Стандартный кейс',
    price: 99,
    priceRanges: [
      { min: 20, max: 100, count: 8 },
      { min: 100, max: 300, count: 10 },
      { min: 300, max: 800, count: 8 },
      { min: 800, max: 2500, count: 4 },
    ],
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Золотой кейс',
    price: 101,
    priceRanges: [
      { min: 20, max: 100, count: 6 },
      { min: 100, max: 300, count: 8 },
      { min: 300, max: 800, count: 6 },
      { min: 800, max: 2500, count: 5 },
    ],
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Платиновый кейс',
    price: 250,
    priceRanges: [
      { min: 50, max: 250, count: 6 },
      { min: 250, max: 600, count: 8 },
      { min: 600, max: 1500, count: 8 },
      { min: 1500, max: 6000, count: 8 },
    ],
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    name: 'Алмазный кейс',
    price: 601,
    priceRanges: [
      { min: 100, max: 600, count: 4 },
      { min: 600, max: 1500, count: 6 },
      { min: 1500, max: 5000, count: 8 },
      { min: 5000, max: 15000, count: 7 },
    ],
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    name: 'Легендарный кейс',
    price: 998,
    priceRanges: [
      { min: 200, max: 1000, count: 5 },
      { min: 1000, max: 3000, count: 8 },
      { min: 3000, max: 10000, count: 10 },
      { min: 10000, max: 30000, count: 7 },
    ],
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    name: 'Мистический кейс',
    price: 2499,
    priceRanges: [
      { min: 500, max: 2500, count: 3 },
      { min: 2500, max: 7000, count: 6 },
      { min: 7000, max: 20000, count: 6 },
      { min: 20000, max: 100000, count: 5 },
    ],
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    name: 'Эпический кейс',
    price: 5000,
    priceRanges: [
      { min: 1000, max: 5000, count: 4 },
      { min: 5000, max: 15000, count: 6 },
      { min: 15000, max: 40000, count: 8 },
      { min: 40000, max: 100000, count: 7 },
    ],
  },
  {
    id: '10101010-1010-1010-1010-101010101010',
    name: 'Мифический кейс',
    price: 10000,
    priceRanges: [
      { min: 2000, max: 10000, count: 4 },
      { min: 10000, max: 25000, count: 8 },
      { min: 25000, max: 60000, count: 10 },
      { min: 60000, max: 100000, count: 8 },
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

async function fillCases() {
  const fileItems = loadItemsFromFile();
  console.log(`📋 Загружено предметов из файла: ${fileItems.length} (цены в рублях)\n`);

  const allIds = fileItems.map(i => i.id);
  const dbItems = await Item.findAll({
    where: { id: { [Op.in]: allIds } },
    attributes: ['id', 'name', 'price', 'rarity'],
  });
  const dbById = new Map(dbItems.map(i => [i.id, i]));

  const usedIds = new Set();

  for (const config of CASE_CONFIGS) {
    console.log(`${'─'.repeat(60)}`);
    console.log(`📦 ${config.name} (${config.price}₽)`);

    const caseItemIds = [];

    for (const range of config.priceRanges) {
      let pool = fileItems.filter(
        (i) => i.price >= range.min && i.price <= range.max && dbById.has(i.id)
      );
      const preferUnused = pool.filter((i) => !usedIds.has(i.id));
      const pickFrom = preferUnused.length >= range.count ? preferUnused : pool;
      const shuffled = shuffle(pickFrom);
      const selected = shuffled.slice(0, range.count);

      for (const s of selected) {
        caseItemIds.push(s.id);
        usedIds.add(s.id);
      }

      if (selected.length < range.count) {
        console.log(`   ⚠️  Диапазон ₽${range.min}-${range.max}: нужно ${range.count}, выбрано ${selected.length}`);
      }
    }

    const caseItems = caseItemIds.map((id) => dbById.get(id)).filter(Boolean);
    if (caseItems.length === 0) {
      console.log(`   ❌ Нет предметов для кейса, пропуск.\n`);
      continue;
    }

    const template = await CaseTemplate.findByPk(config.id);
    if (!template) {
      console.log(`   ❌ Кейс не найден в БД.\n`);
      continue;
    }

    await template.setItems(caseItems);

    const prices = caseItems.map((i) => parseFloat(i.price) || 0).filter((p) => p > 0);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const avgP = prices.reduce((a, b) => a + b, 0) / prices.length;
    const rtp = config.price > 0 ? ((avgP / config.price) * 100).toFixed(1) : '-';

    console.log(`   ✅ Предметов: ${caseItems.length} | мин: ${minP.toFixed(0)}₽ | макс: ${maxP.toFixed(0)}₽ | RTP: ${rtp}%\n`);
  }

  console.log('🎉 Наполнение платных кейсов завершено.');
}

fillCases()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => sequelize.close());
