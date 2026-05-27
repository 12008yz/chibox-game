#!/usr/bin/env node
'use strict';

/**
 * Отчёт RTP по публичному API (например chibox-game.ru).
 * Использование: node scripts/case-rtp-report-prod.js [baseUrl]
 */

require('dotenv').config();

const https = require('https');
const http = require('http');
const { analyzeCaseEconomy } = require('../utils/caseEconomyAnalyzer');

const baseUrl = (process.argv[2] || process.env.PROD_API_BASE || 'https://chibox-game.ru/api').replace(/\/$/, '');

function fetchJson(path) {
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    lib.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function printLine(report) {
  const near = report.feelBands?.find((b) => b.label.startsWith('Почти'));
  const cat = report.feelBands?.find((b) => b.label.startsWith('Катастрофа'));
  const status = report.warnings?.length ? `⚠️  ${report.warnings.join(' | ')}` : '✅';
  console.log(
    `${(report.caseName || '').padEnd(22)} items ${String(report.itemCount).padStart(3)}  ` +
    `RTP ${(report.rtp || 0).toFixed(1).padStart(5)}%  ` +
    `near ${(near?.chance || 0).toFixed(1).padStart(5)}%  ` +
    `cat ${(cat?.chance || 0).toFixed(1).padStart(5)}%  ${status}`
  );
  if (report.compositionHints?.length) {
    for (const h of report.compositionHints) console.log(`      💡 ${h}`);
  }
}

async function main() {
  console.log('='.repeat(90));
  console.log(`📊 RTP ОТЧЁТ ПРОДА: ${baseUrl}`);
  console.log('='.repeat(90));

  const casesPayload = await fetchJson('/v1/cases');
  const paid = casesPayload.data?.paid_cases || casesPayload.paid_cases || [];

  if (!paid.length) {
    console.error('Платные кейсы не найдены в ответе /v1/cases');
    process.exit(1);
  }

  for (const c of paid) {
    const itemsPayload = await fetchJson(`/v1/case-templates/${c.id}/items`);
    const items = itemsPayload.data?.items || [];
    const template = itemsPayload.data?.caseTemplate || {
      id: c.id,
      name: c.name,
      price: parseFloat(c.price),
      type: c.type
    };
    if (!template.price) template.price = parseFloat(c.price);

    const report = analyzeCaseEconomy(
      template,
      items.map((i) => ({
        id: i.id,
        name: i.name,
        price: parseFloat(i.price),
        rarity: i.rarity
      }))
    );
    printLine(report);
  }

  console.log('='.repeat(90));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
