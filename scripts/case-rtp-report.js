#!/usr/bin/env node
'use strict';

/**
 * Отчёт RTP и «ощущения» дропа по всем активным кейсам.
 *
 * Использование:
 *   node scripts/case-rtp-report.js
 *   node scripts/case-rtp-report.js --json
 *   node scripts/case-rtp-report.js --synthetic
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { CaseTemplate, Item, CaseTemplateItem } = require('../models');
const { analyzeCaseEconomy, analyzeSyntheticPaidCurve } = require('../utils/caseEconomyAnalyzer');

const args = process.argv.slice(2);
const outputJson = args.includes('--json');
const syntheticOnly = args.includes('--synthetic');

function formatBandLine(band) {
  return `      ${band.label.padEnd(32)} ${band.chance.toFixed(2).padStart(6)}%`;
}

function printReport(report) {
  console.log('─'.repeat(90));
  console.log(`🎁 ${report.caseName}  |  ${report.casePrice} ChiCoins  |  type: ${report.caseType}`);
  console.log(`   Предметов: ${report.itemCount}  |  RTP: ${report.rtp.toFixed(2)}%  |  House edge: ${report.houseEdgePercent?.toFixed(2) ?? '—'}%`);
  console.log('   Ощущение дропа:');
  for (const band of report.feelBands) {
    console.log(formatBandLine(band));
  }
  if (report.warnings.length) {
    console.log('   ⚠️  ' + report.warnings.join('; '));
  } else {
    console.log('   ✅ Цели калибровки в норме');
  }
  if (report.compositionHints?.length) {
    console.log('   💡 Наполнение кейса:');
    for (const hint of report.compositionHints) {
      console.log(`      • ${hint}`);
    }
  }
}

async function loadCaseReports() {
  const templates = await CaseTemplate.findAll({
    where: { is_active: true },
    order: [['price', 'ASC'], ['name', 'ASC']]
  });

  const reports = [];

  for (const template of templates) {
    const links = await CaseTemplateItem.findAll({
      where: { case_template_id: template.id },
      attributes: ['item_id'],
      raw: true
    });

    if (!links.length) {
      reports.push({
        caseTemplateId: template.id,
        caseName: template.name,
        casePrice: parseFloat(template.price) || 0,
        itemCount: 0,
        error: 'Нет предметов',
        warnings: ['Пустой кейс']
      });
      continue;
    }

    const itemIds = links.map((l) => l.item_id);
    const items = await Item.findAll({ where: { id: itemIds } });

    reports.push(analyzeCaseEconomy(template, items));
  }

  return reports;
}

async function main() {
  console.log('='.repeat(90));
  console.log('📊 CHIBOX — ОТЧЁТ RTP И КАЛИБРОВКИ ДРОПА (A)');
  console.log('='.repeat(90));
  console.log('');

  if (syntheticOnly) {
    const prices = [17, 49, 99, 101, 250, 499, 998, 2499];
    const syntheticReports = prices.map((p) => analyzeSyntheticPaidCurve(p));
    for (const r of syntheticReports) printReport(r);
    if (outputJson) {
      const out = path.join(__dirname, '..', 'docs', 'case-rtp-synthetic.json');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(syntheticReports, null, 2));
      console.log(`\nJSON: ${out}`);
    }
    process.exit(0);
  }

  console.log('🔬 Синтетика (равномерный пул ratio 0.1–3.0 — только проверка формы кривой, НЕ RTP витрины):');
  const syn = analyzeSyntheticPaidCurve(99);
  syn.warnings = syn.warnings.filter((w) => !w.includes('идеала'));
  printReport(syn);
  console.log('');

  let reports;
  try {
    await CaseTemplate.sequelize.authenticate();
    reports = await loadCaseReports();
  } catch (err) {
    console.error('⚠️  БД недоступна, только синтетика:', err.message);
    reports = [];
  }

  if (reports.length) {
    console.log('='.repeat(90));
    console.log(`📦 АКТИВНЫЕ КЕЙСЫ В БД (${reports.length})`);
    console.log('='.repeat(90));

    const paid = reports.filter((r) => r.casePrice > 0 && !r.error);
    const summary = {
      count: paid.length,
      avgRtp: paid.length ? paid.reduce((s, r) => s + r.rtp, 0) / paid.length : 0,
      warnings: reports.filter((r) => r.warnings?.length).length
    };

    for (const report of reports) {
      if (report.error) {
        console.log(`─\n⚠️  ${report.caseName}: ${report.error}`);
        continue;
      }
      printReport(report);
    }

    console.log('');
    console.log('='.repeat(90));
    console.log('ИТОГО (платные):');
    console.log(`   Кейсов: ${summary.count}  |  Средний RTP: ${summary.avgRtp.toFixed(2)}%  |  С предупреждениями: ${summary.warnings}`);
    console.log('='.repeat(90));

    if (outputJson) {
      const out = path.join(__dirname, '..', 'docs', 'case-rtp-report.json');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), summary, reports }, null, 2));
      console.log(`\n💾 JSON: ${out}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
