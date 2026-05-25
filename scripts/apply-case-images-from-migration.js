#!/usr/bin/env node
/**
 * Повторно применяет данные из migrations/20251129111917-update-case-images.js
 * (миграция уже up — Sequelize не запустит её снова).
 *
 * Запуск на проде:
 *   cd /var/www/chibox/backend && node scripts/apply-case-images-from-migration.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Должен совпадать с migrations/20251129111917-update-case-images.js */
const UPDATES = [
  { id: '88888888-8888-8888-8888-888888888888', name: 'Ночной дозор', image_url: '/images/cases/dozor.png' },
  { id: '99999999-9999-9999-9999-999999999999', name: 'Пушистый кейс', image_url: '/images/cases/dog.png' },
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Санитарный набор', image_url: '/images/cases/sanitar.png' },
  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Платиновый кейс', image_url: '/images/cases/pantera.png' },
  { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', name: 'Космический кейс', image_url: '/images/cases/space.png' },
  { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', name: 'Морской кейс', image_url: '/images/cases/morskoy.png' },
  { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', name: 'Ледяной кейс', image_url: '/images/cases/led.png' },
  { id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', name: 'Бурый кейс', image_url: '/images/cases/bear_chibox-game.ru.png' },
  { id: '10101010-1010-1010-1010-101010101010', name: 'Демонический кейс', image_url: '/images/cases/demon.png' },
];

const CASES_DIR = path.join(__dirname, '../public/images/cases');

function getUpdateRowCount(meta) {
  if (meta == null) return 0;
  if (typeof meta === 'number') return meta;
  return meta.rowCount ?? 0;
}

async function main() {
  await sequelize.authenticate();
  console.log('Обновление case_templates (20251129111917)...\n');

  let missingFiles = 0;
  for (const { image_url } of UPDATES) {
    const file = path.join(CASES_DIR, path.basename(image_url));
    if (!fs.existsSync(file)) {
      console.warn(`⚠️  Нет файла на диске: ${file}`);
      missingFiles += 1;
    }
  }
  if (missingFiles > 0) {
    console.warn(`\n⚠️  ${missingFiles} файл(ов) не найдено в ${CASES_DIR}\n`);
  }

  let updated = 0;
  let notFound = 0;

  for (const { id, name, image_url } of UPDATES) {
    const [, meta] = await sequelize.query(
      `UPDATE case_templates
       SET name = :name, image_url = :image_url, updated_at = NOW()
       WHERE id = :id`,
      { replacements: { id, name, image_url } }
    );
    const rowCount = getUpdateRowCount(meta);
    if (rowCount > 0) {
      updated += 1;
      console.log(`OK       ${image_url}  →  ${name}`);
    } else {
      notFound += 1;
      console.log(`НЕ НАЙДЕН  ${id}  (${name})`);
    }
  }

  console.log(`\nОбновлено строк: ${updated}/${UPDATES.length}`);
  if (notFound > 0) {
    console.warn(`⚠️  Не найдено в БД: ${notFound} (проверь UUID в case_templates)`);
  }

  const rows = [];
  for (const { id } of UPDATES) {
    const found = await sequelize.query(
      `SELECT id, name, price, image_url FROM case_templates WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (found[0]) rows.push(found[0]);
  }
  rows.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));

  console.log('\nПроверка после обновления:');
  console.table(rows);

  const mismatches = rows.filter((row) => {
    const expected = UPDATES.find((u) => u.id === row.id);
    return !expected || expected.name !== row.name || expected.image_url !== row.image_url;
  });
  if (mismatches.length > 0) {
    console.error('\n❌ Несовпадение с ожидаемыми значениями:', mismatches.length);
    process.exit(1);
  }

  await sequelize.close();
  console.log('\n✅ Готово — все записи совпадают с миграцией.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
