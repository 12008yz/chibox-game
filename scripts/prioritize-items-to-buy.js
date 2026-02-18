/**
 * Приоритет закупки предметов для инвентаря бота.
 * Показывает в первую очередь предметы, которые реально выводят (от минимальной суммы),
 * затем дешёвые (ниже порога) — их можно не закупать.
 * Запуск: node scripts/prioritize-items-to-buy.js
 */

const { sequelize } = require('../config/database');
const db = require('../models');

// Минимальная сумма вывода в рублях (предметы дешевле этого пользователи не выводят)
const MIN_WITHDRAWAL_RUB = 300;
// Примерный курс USD → RUB для порога (цена в БД в USD)
const USD_TO_RUB = 100;
const MIN_PRICE_USD = MIN_WITHDRAWAL_RUB / USD_TO_RUB;

async function run() {
  try {
    await sequelize.authenticate();

    // Все связи кейс — предмет (только активные кейсы)
    const [caseTemplateItems, activeCaseIds] = await Promise.all([
      db.CaseTemplateItem.findAll({ attributes: ['case_template_id', 'item_id'], raw: true }),
      db.CaseTemplate.findAll({ where: { is_active: true }, attributes: ['id'], raw: true })
    ]);
    const activeSet = new Set(activeCaseIds.map((c) => c.id));

    // Считаем по каждому item_id: в скольких активных кейсах встречается
    const caseCountByItem = new Map();
    for (const row of caseTemplateItems) {
      if (!activeSet.has(row.case_template_id)) continue;
      const id = row.item_id;
      caseCountByItem.set(id, (caseCountByItem.get(id) || 0) + 1);
    }

    const itemIds = [...caseCountByItem.keys()];
    if (itemIds.length === 0) {
      console.log('Нет предметов в активных кейсах.');
      process.exit(0);
    }

    const items = await db.Item.findAll({
      where: { id: itemIds },
      attributes: ['id', 'name', 'price', 'rarity', 'in_stock'],
      raw: true
    });

    const toBuy = items
      .filter((i) => !i.in_stock)
      .map((i) => ({
        id: i.id,
        name: i.name,
        price: parseFloat(i.price) || 0,
        rarity: i.rarity || 'N/A',
        caseCount: caseCountByItem.get(i.id) || 0
      }));

    const sortByPriceThenCases = (a, b) => {
      if (Math.abs(a.price - b.price) < 0.01) return b.caseCount - a.caseCount;
      return a.price - b.price;
    };

    // Разделяем: от порога вывода (~300 руб) — приоритет закупки; дешёвые — выводят редко
    const forWithdrawal = toBuy.filter((r) => r.price >= MIN_PRICE_USD);
    const cheap = toBuy.filter((r) => r.price < MIN_PRICE_USD);
    forWithdrawal.sort(sortByPriceThenCases);
    cheap.sort(sortByPriceThenCases);

    const columns = ['№', 'Название', 'Цена (USD)', '~ RUB', 'Редкость', 'В кейсах'];
    const colWidths = [4, 38, 10, 8, 10, 8];

    console.log('='.repeat(100));
    console.log('ПРИОРИТЕТ ЗАКУПКИ ДЛЯ ИНВЕНТАРЯ БОТА (нет в наличии)');
    console.log('='.repeat(100));
    console.log(`Порог вывода: от ${MIN_WITHDRAWAL_RUB} руб (~ ${MIN_PRICE_USD} USD). Дешёвые предметы пользователи не выводят.`);
    console.log(`Всего в кейсах без наличия: ${toBuy.length}  |  Для вывода (≥ порога): ${forWithdrawal.length}  |  Дешёвые (< порога): ${cheap.length}`);
    console.log('');

    console.log('--- ДЛЯ ВЫВОДА (от ~300 руб) — закупать в первую очередь ---');
    console.log(columns.map((c, i) => c.padEnd(colWidths[i])).join(' | '));
    console.log('-'.repeat(100));

    let totalUsd = 0;
    forWithdrawal.forEach((r, i) => {
      totalUsd += r.price;
      const name = (r.name || '').substring(0, 36);
      const rub = Math.round(r.price * USD_TO_RUB);
      const line = [
        String(i + 1).padStart(3),
        name.padEnd(38),
        r.price.toFixed(2).padStart(8),
        String(rub).padStart(6),
        (r.rarity || 'N/A').padEnd(10),
        String(r.caseCount).padStart(6)
      ].join(' | ');
      console.log(line);
    });

    const totalForWithdrawalUsd = forWithdrawal.reduce((s, r) => s + r.price, 0);
    console.log('');
    console.log('-'.repeat(100));
    console.log(`Сумма за ВСЕ ${forWithdrawal.length} предметов для вывода: ${totalForWithdrawalUsd.toFixed(2)} USD (~ ${Math.round(totalForWithdrawalUsd * USD_TO_RUB)} руб)`);
    console.log('');

    if (cheap.length > 0) {
      console.log('--- Дешёвые (ниже порога вывода) — закупать по желанию ---');
      console.log(`Показаны первые 15 из ${cheap.length}. Сумма всех дешёвых: ${cheap.reduce((s, r) => s + r.price, 0).toFixed(2)} USD`);
      console.log(columns.map((c, i) => c.padEnd(colWidths[i])).join(' | '));
      console.log('-'.repeat(100));
      cheap.slice(0, 15).forEach((r, i) => {
        const name = (r.name || '').substring(0, 36);
        const rub = Math.round(r.price * USD_TO_RUB);
        console.log([
          String(i + 1).padStart(3),
          name.padEnd(38),
          r.price.toFixed(2).padStart(8),
          String(rub).padStart(6),
          (r.rarity || 'N/A').padEnd(10),
          String(r.caseCount).padStart(6)
        ].join(' | '));
      });
      if (cheap.length > 15) console.log(`... и ещё ${cheap.length - 15} предметов`);
      console.log('');
    }

    console.log('Рекомендация: закупать по блоку "ДЛЯ ВЫВОДА" с первого номера (дешёвые из этого блока и часто выпадающие).');
    console.log('='.repeat(100));

    process.exit(0);
  } catch (err) {
    console.error('Ошибка:', err);
    process.exit(1);
  }
}

run();
