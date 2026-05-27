const {
  calculateCorrectWeightByPrice,
  calculateWeightForPaidCase,
  determineCaseType
} = require('./dropWeightCalculator');

/**
 * Вес предмета так же, как при открытии: платные кейсы — ratio от реальной цены кейса.
 */
function resolveItemWeight(price, caseType, casePrice, isPaid) {
  if (isPaid && casePrice > 0) {
    return calculateWeightForPaidCase(price, casePrice);
  }
  return calculateCorrectWeightByPrice(price, caseType);
}

/**
 * Метрики «ощущения» дропа (для калибровки как у витринных кейс-сайтов).
 * @param {Array<{ price: number, weight: number }>} weightedItems
 * @param {number} casePrice
 */
function computeFeelBands(weightedItems, casePrice) {
  const bands = {
    trash: { min: 0, max: 0.2, chance: 0, label: 'Мусор (<20% цены)' },
    catastrophic: { min: 0.2, max: 0.4, chance: 0, label: 'Катастрофа (20–40%)' },
    bigLoss: { min: 0.4, max: 0.7, chance: 0, label: 'Большой проигрыш (40–70%)' },
    nearBreakEven: { min: 0.7, max: 1.05, chance: 0, label: 'Почти окуп (70–105%)' },
    smallWin: { min: 1.05, max: 1.6, chance: 0, label: 'Небольшой плюс (105–160%)' },
    goodWin: { min: 1.6, max: 2.5, chance: 0, label: 'Хороший выигрыш (160–250%)' },
    jackpot: { min: 2.5, max: Infinity, chance: 0, label: 'Джекпот (250%+)' }
  };

  if (!casePrice || casePrice <= 0) {
    return { bands: Object.values(bands), totalWeight: 0 };
  }

  const totalWeight = weightedItems.reduce((s, i) => s + (i.weight || 0), 0);
  if (totalWeight <= 0) {
    return { bands: Object.values(bands), totalWeight: 0 };
  }

  for (const item of weightedItems) {
    const ratio = (parseFloat(item.price) || 0) / casePrice;
    const chance = (item.weight / totalWeight) * 100;
    for (const band of Object.values(bands)) {
      if (ratio >= band.min && ratio < band.max) {
        band.chance += chance;
        break;
      }
    }
  }

  return { bands: Object.values(bands), totalWeight };
}

/**
 * Полный экономический срез кейса по списку предметов.
 */
function analyzeCaseEconomy(caseTemplate, items, options = {}) {
  const isPaid = options.isPaid ?? (parseFloat(caseTemplate?.price) > 0);
  const casePrice = parseFloat(caseTemplate?.price) || 0;
  const caseType = options.caseType ?? determineCaseType(caseTemplate, isPaid);

  const weightedItems = (items || []).map((item) => {
    const price = parseFloat(item.price) || 0;
    const weight = resolveItemWeight(price, caseType, casePrice, isPaid);
    return {
      id: item.id,
      name: item.name,
      price,
      rarity: item.rarity,
      weight,
      ratio: casePrice > 0 ? price / casePrice : 0
    };
  });

  const totalWeight = weightedItems.reduce((s, i) => s + i.weight, 0);

  let avgWin = 0;
  let rtp = 0;
  if (casePrice > 0 && totalWeight > 0) {
    avgWin = weightedItems.reduce((s, i) => s + i.price * (i.weight / totalWeight), 0);
    rtp = (avgWin / casePrice) * 100;
  }

  const withChance = weightedItems.map((i) => ({
    ...i,
    chancePercent: totalWeight > 0 ? (i.weight / totalWeight) * 100 : 0
  }));

  const feel = computeFeelBands(weightedItems, casePrice);

  // Ориентиры для новых кейсов (не жёсткое требование для уже наполненных витрин)
  const designTargets = isPaid
    ? { rtpIdealMin: 68, rtpIdealMax: 74, nearBreakEvenIdeal: 28, catastrophicIdealMax: 18 }
    : { rtpIdealMin: 35, rtpIdealMax: 55, nearBreakEvenIdeal: 15, catastrophicIdealMax: 35 };

  const nearBand = feel.bands.find((b) => b.label.startsWith('Почти окуп'));
  const catBand = feel.bands.find((b) => b.label.startsWith('Катастрофа'));

  const warnings = [];
  if (isPaid && casePrice > 0 && totalWeight > 0) {
    if (rtp > 85) {
      warnings.push(`RTP ${rtp.toFixed(1)}% — высокий риск для маржи (обычно ≤74%)`);
    } else if (rtp < 55) {
      warnings.push(`RTP ${rtp.toFixed(1)}% — слишком жёстко для удержания игроков`);
    } else if (rtp > designTargets.rtpIdealMax) {
      warnings.push(`RTP ${rtp.toFixed(1)}% выше идеала ${designTargets.rtpIdealMax}% (допустимо, если так задумано)`);
    } else if (rtp < designTargets.rtpIdealMin) {
      warnings.push(`RTP ${rtp.toFixed(1)}% ниже идеала ${designTargets.rtpIdealMin}%`);
    }

    if (items.length >= 20 && nearBand && nearBand.chance < 20) {
      warnings.push(`«Почти окуп» ${nearBand.chance.toFixed(1)}% — мало для «классного» дропа (желательно ≥20%)`);
    }
    if (catBand && catBand.chance > 25) {
      warnings.push(`«Катастрофа» ${catBand.chance.toFixed(1)}% — слишком частые тяжёлые проигрыши`);
    }
  }

  if (items.length > 0 && items.length < 8) {
    warnings.push(`Мало предметов в кейсе (${items.length}) — слабая витрина для рулетки`);
  }

  const compositionHints = [];
  if (isPaid && casePrice > 0 && items.length > 0) {
    const hasBand = (minR, maxR) =>
      weightedItems.some((i) => i.ratio >= minR && i.ratio < maxR);
    if (!hasBand(0.7, 1.05)) {
      compositionHints.push('Добавьте 2–4 предмета в зоне 70–105% цены кейса (ощущение «почти окуп»)');
    }
    if (!hasBand(1.2, 2.5)) {
      compositionHints.push('Добавьте 1–3 предмета x1.2–x2.5 для витрины рулетки');
    }
    if (!hasBand(2.5, Infinity)) {
      compositionHints.push('Добавьте 1–2 джекпота x2.5+ с низким весом');
    }
    const cheapWeightShare = weightedItems
      .filter((i) => i.ratio < 0.4)
      .reduce((s, i) => s + i.weight, 0) / totalWeight;
    if (cheapWeightShare > 0.55) {
      compositionHints.push(
        `По весам ${(cheapWeightShare * 100).toFixed(0)}% дропа — дешёвые позиции (<40% цены кейса); RTP и ощущение «почти окуп» просядут`
      );
    }
  }

  return {
    caseTemplateId: caseTemplate?.id,
    caseName: caseTemplate?.name,
    caseType,
    casePrice,
    isPaid,
    itemCount: items.length,
    totalWeight,
    avgWin,
    rtp,
    houseEdgePercent: casePrice > 0 ? 100 - rtp : null,
    feelBands: feel.bands,
    designTargets,
    warnings,
    compositionHints,
    items: withChance.sort((a, b) => b.chancePercent - a.chancePercent)
  };
}

/**
 * Синтетический эталонный пул (равномерно по ratio) — для проверки кривой весов без БД.
 */
function analyzeSyntheticPaidCurve(casePrice = 99) {
  const syntheticItems = [];
  for (let ratio = 0.1; ratio <= 3.0; ratio += 0.05) {
    syntheticItems.push({
      id: `syn-${ratio.toFixed(2)}`,
      name: `Synthetic x${ratio.toFixed(2)}`,
      price: casePrice * ratio
    });
  }
  return analyzeCaseEconomy(
    { id: 'synthetic', name: `Synthetic ${casePrice}`, price: casePrice, type: 'premium' },
    syntheticItems,
    { isPaid: true, caseType: determineCaseType({ id: 'x', name: 'x', price: casePrice, type: 'premium' }, true) }
  );
}

module.exports = {
  computeFeelBands,
  analyzeCaseEconomy,
  analyzeSyntheticPaidCurve
};
