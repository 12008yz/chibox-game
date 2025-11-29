const { logger } = require('./logger');

/**
 * Фильтрует исключенные предметы для пользователей Статус++
 * @param {Array} items - массив предметов
 * @param {number} userSubscriptionTier - уровень подписки пользователя
 * @returns {Array} отфильтрованный массив предметов
 */
function filterExcludedItems(items, userSubscriptionTier = 0) {
  if (!items || items.length === 0) {
    return items;
  }

  // Для пользователей Статус++ (tier >= 3) исключаем предметы с is_excluded = true
  if (userSubscriptionTier >= 3) {
    const filteredItems = items.filter(item => !item.is_excluded && !item.isExcluded);
    console.log(`[filterExcludedItems] Отфильтровано для Статус++: ${items.length} -> ${filteredItems.length} предметов`);
    return filteredItems;
  }

  return items;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * НОВАЯ СБАЛАНСИРОВАННАЯ СИСТЕМА ВЕСОВ ДЛЯ ВСЕХ ТИПОВ КЕЙСОВ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ЦЕЛИ:
 * 1. Казино прибыльно при любом объеме открытий
 * 2. Игрокам интересно играть (есть шанс выиграть)
 * 3. Подписчики получают преимущество
 *
 * RTP (Return to Player) - процент возврата игроку ДО продажи предметов
 * После продажи за 65%: реальный возврат = RTP * 0.65
 *
 * ЭКОНОМИКА:
 * - Кейс 499₽: RTP 50% → после продажи 32.5% (казино получает ~67.5% прибыли)
 * - Кейс 99₽: RTP 55% → после продажи 35.75% (казино получает ~64% прибыли)
 * - Подписки: выгодны при открытии 1 кейса/день (RTP 60-70%)
 * - Бесплатный: RTP 45% (мотивация купить подписку)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * КЕЙС ЗА 499₽ - Премиум кейс (главный источник дохода)
 * Целевой RTP: 50% (средний выигрыш ~250₽)
 * После продажи: игрок получит ~162₽ (32.5%)
 */
function calculateWeightForPremium499(price) {
  price = parseFloat(price) || 0;

  // СУПЕР ДЖЕКПОТЫ - БОЛЕЕ ЩЕДРЫЕ веса для дорогих предметов (>499₽)
  if (price >= 50000) return 0.012;     // УВЕЛИЧЕНО x2.4 - ультра мега джекпот (x100)
  if (price >= 30000) return 0.025;     // УВЕЛИЧЕНО x2.5 - супер мега джекпот (x60)
  if (price >= 20000) return 0.05;      // УВЕЛИЧЕНО x2.5 - мега джекпот++ (x40)
  if (price >= 15000) return 0.12;      // УВЕЛИЧЕНО x2.4 - мега джекпот+ (x30)
  if (price >= 10000) return 0.25;      // УВЕЛИЧЕНО x2.5 - мега джекпот (x20)
  if (price >= 8000) return 0.5;        // УВЕЛИЧЕНО x2.5 - огромный джекпот (x16)
  if (price >= 6000) return 0.75;       // УВЕЛИЧЕНО x2.5 - очень большой джекпот (x12)
  if (price >= 5000) return 1.2;        // УВЕЛИЧЕНО x2.4 - большой джекпот (x10)
  if (price >= 4000) return 2;          // УВЕЛИЧЕНО x2.5 - крупный джекпот (x8)
  if (price >= 3000) return 3;          // УВЕЛИЧЕНО x2.5 - джекпот (x6)
  if (price >= 2500) return 5;          // УВЕЛИЧЕНО x2.5 - мини джекпот+ (x5)
  if (price >= 2000) return 7;          // УВЕЛИЧЕНО x2.3 - мини джекпот (x4)
  if (price >= 1500) return 12;         // УВЕЛИЧЕНО x2.4 - отличный выигрыш (x3)

  // ХОРОШИЕ ВЫИГРЫШИ - БОЛЕЕ ЩЕДРЫЕ - удвоение и больше
  if (price >= 1200) return 18;         // УВЕЛИЧЕНО x2.25 - x2.4 выигрыш
  if (price >= 1000) return 28;         // УВЕЛИЧЕНО x2.3 - x2 выигрыш

  // СРЕДНИЕ ВЫИГРЫШИ - БОЛЕЕ ЩЕДРЫЕ - выше стоимости кейса
  if (price >= 800) return 35;          // УВЕЛИЧЕНО x2.3 - x1.6 выигрыш
  if (price >= 600) return 45;          // УВЕЛИЧЕНО x2.25 - x1.2 выигрыш
  if (price >= 500) return 55;          // УВЕЛИЧЕНО x2.2 - окуп+ (x1)

  // ОКУП (8% общий) - возврат 80-100% стоимости кейса
  if (price >= 450) return 40;          // 4% - почти окуп
  if (price >= 400) return 50;          // 5% - близко к окупу

  // СРЕДНИЙ УБЫТОК (30% общий) - возврат 50-80%
  if (price >= 350) return 80;          // 8% - небольшой убыток
  if (price >= 300) return 100;         // 10% - средний убыток
  if (price >= 250) return 120;         // 12% - заметный убыток
  if (price >= 200) return 100;         // 10% - большой убыток

  // БОЛЬШОЙ УБЫТОК (57% общий) - возврат 20-50%
  if (price >= 150) return 180;         // 18% - очень большой убыток
  if (price >= 120) return 200;         // 20% - огромный убыток
  if (price >= 100) return 190;         // 19% - сильный убыток

  // МУСОР (очень дешевые предметы)
  if (price >= 50) return 150;          // 15% - дешевка
  return 100;                           // 10% - базовый мусор
}

/**
 * КЕЙС ЗА 99₽ - Стандартный кейс
 * Целевой RTP: 55% (средний выигрыш ~54₽)
 * После продажи: игрок получит ~35₽ (35.4%)
 */
function calculateWeightForStandard99(price) {
  price = parseFloat(price) || 0;

  // СУПЕР ДЖЕКПОТЫ - БОЛЕЕ ЩЕДРЫЕ веса для дорогих предметов (>499₽)
  if (price >= 10000) return 0.025;     // УВЕЛИЧЕНО x2.5 - ультра джекпот (x100)
  if (price >= 8000) return 0.05;       // УВЕЛИЧЕНО x2.5 - мега джекпот++ (x80)
  if (price >= 6000) return 0.12;       // УВЕЛИЧЕНО x2.4 - мега джекпот+ (x60)
  if (price >= 5000) return 0.2;        // УВЕЛИЧЕНО x2.5 - мега джекпот (x50)
  if (price >= 4000) return 0.35;       // УВЕЛИЧЕНО x2.3 - огромный джекпот (x40)
  if (price >= 3000) return 0.7;        // УВЕЛИЧЕНО x2.3 - большой джекпот (x30)
  if (price >= 2000) return 1.4;        // УВЕЛИЧЕНО x2.3 - крупный джекпот (x20)
  if (price >= 1500) return 2.4;        // УВЕЛИЧЕНО x2.4 - джекпот (x15)
  if (price >= 1000) return 4.5;        // УВЕЛИЧЕНО x2.25 - мини джекпот (x10)
  if (price >= 800) return 7;           // УВЕЛИЧЕНО x2.3 - отличный выигрыш (x8)
  if (price >= 500) return 11;          // УВЕЛИЧЕНО x2.2 - хороший выигрыш (x5)
  if (price >= 300) return 8;           // 0.8% - неплохой выигрыш (x3)

  // ХОРОШИЕ ВЫИГРЫШИ (4% общий) - удвоение и больше
  if (price >= 200) return 15;          // 1.5% - x2 выигрыш
  if (price >= 150) return 20;          // 2% - x1.5 выигрыш
  if (price >= 120) return 25;          // 2.5% - хороший выигрыш

  // ОКУП (10% общий) - возврат 80-120%
  if (price >= 100) return 40;          // 4% - полный окуп
  if (price >= 80) return 50;           // 5% - почти окуп
  if (price >= 70) return 40;           // 4% - близко к окупу

  // СРЕДНИЙ УБЫТОК (30% общий) - возврат 40-70%
  if (price >= 60) return 100;          // 10% - небольшой убыток
  if (price >= 50) return 120;          // 12% - средний убыток
  if (price >= 40) return 100;          // 10% - заметный убыток

  // БОЛЬШОЙ УБЫТОК (55.7% общий) - возврат 10-40%
  if (price >= 35) return 180;          // 18% - большой убыток
  if (price >= 30) return 200;          // 20% - очень большой убыток
  if (price >= 25) return 177;          // 17.7% - огромный убыток

  // МУСОР (очень дешевые)
  return 100;                           // 10% - базовый мусор
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - БЕСПЛАТНЫЙ (без подписки)
 * Целевой RTP: 45% (мотивация купить подписку)
 * Средний выигрыш ~22₽ (предметы до 50₽)
 */
function calculateWeightForFreeDaily(price) {
  price = parseFloat(price) || 0;

  // Редкие выигрыши (3% общий)
  if (price >= 50) return 5;            // 0.5% - максимум для бесплатного
  if (price >= 40) return 10;           // 1% - отличный выигрыш
  if (price >= 30) return 15;           // 1.5% - хороший выигрыш

  // Средние выигрыши (25% общий)
  if (price >= 25) return 80;           // 8% - нормальный выигрыш
  if (price >= 20) return 100;          // 10% - средний выигрыш
  if (price >= 15) return 70;           // 7% - небольшой выигрыш

  // Частые (72% общий) - основная масса
  if (price >= 10) return 250;          // 25% - дешевые предметы
  if (price >= 8) return 270;           // 27% - очень дешевые
  if (price >= 5) return 200;           // 20% - мусор
  return 150;                           // 15% - базовый мусор
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - СТАТУС (1800₽/30 дней = 60₽/день)
 * Целевой RTP: 60% (средний выигрыш ~36₽)
 * Окупаемость подписки при открытии 1 кейса/день
 */
function calculateWeightForStatusTier1(price) {
  price = parseFloat(price) || 0;

  // СУПЕР РЕДКИЕ ДЖЕКПОТЫ (0.2% общий) - приятный сюрприз для подписчиков
  if (price >= 10000) return 0.01;      // 0.001% - ультра джекпот (x166)
  if (price >= 8000) return 0.02;       // 0.002% - мега джекпот++ (x133)
  if (price >= 6000) return 0.03;       // 0.003% - мега джекпот+ (x100)
  if (price >= 5000) return 0.05;       // 0.005% - мега джекпот (x83)
  if (price >= 4000) return 0.1;        // 0.01% - огромный джекпот (x66)
  if (price >= 3000) return 0.2;        // 0.02% - большой джекпот (x50)
  if (price >= 2000) return 0.4;        // 0.04% - крупный джекпот (x33)
  if (price >= 1000) return 1;          // 0.1% - джекпот (x16)
  if (price >= 500) return 2;           // 0.2% - мини джекпот (x8)
  if (price >= 300) return 4;           // 0.4% - отличный выигрыш (x5)

  // ХОРОШИЕ ВЫИГРЫШИ (5% общий)
  if (price >= 200) return 12;          // 1.2% - x3+ выигрыш
  if (price >= 150) return 15;          // 1.5% - x2.5 выигрыш
  if (price >= 100) return 18;          // 1.8% - x1.5-2 выигрыш
  if (price >= 80) return 15;           // 1.5% - хороший выигрыш

  // СРЕДНИЕ ВЫИГРЫШИ (20% общий)
  if (price >= 60) return 50;           // 5% - окуп дня
  if (price >= 50) return 50;           // 5% - близко к окупу
  if (price >= 40) return 60;           // 6% - неплохо
  if (price >= 30) return 40;           // 4% - средний выигрыш

  // ЧАСТЫЕ ДРОПЫ (74.8% общий)
  if (price >= 25) return 120;          // 12% - небольшой убыток
  if (price >= 20) return 150;          // 15% - средний убыток
  if (price >= 15) return 180;          // 18% - заметный убыток
  if (price >= 10) return 200;          // 20% - большой убыток
  if (price >= 8) return 98;            // 9.8% - очень дешевые
  return 80;                            // 8% - мусор
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - СТАТУС+ (3600₽/30 дней = 120₽/день)
 * Целевой RTP: 65% (средний выигрыш ~78₽)
 */
function calculateWeightForStatusTier2(price) {
  price = parseFloat(price) || 0;

  // СУПЕР ДЖЕКПОТЫ (0.5% общий) - больше шансов на дорогие предметы
  if (price >= 20000) return 0.01;      // 0.001% - ультра мега джекпот (x166)
  if (price >= 15000) return 0.02;      // 0.002% - супер мега джекпот (x125)
  if (price >= 10000) return 0.05;      // 0.005% - мега джекпот++ (x83)
  if (price >= 8000) return 0.08;       // 0.008% - мега джекпот+ (x66)
  if (price >= 5000) return 0.15;       // 0.015% - мега джекпот (x41)
  if (price >= 3000) return 0.4;        // 0.04% - большой джекпот (x25)
  if (price >= 2000) return 0.8;        // 0.08% - крупный джекпот (x16)
  if (price >= 1000) return 2;          // 0.2% - джекпот (x8)
  if (price >= 800) return 3.5;         // 0.35% - мини джекпот (x6)
  if (price >= 500) return 6;           // 0.6% - отличный выигрыш (x4)

  // ХОРОШИЕ ВЫИГРЫШИ (8% общий)
  if (price >= 300) return 18;          // 1.8% - x2.5 выигрыш
  if (price >= 200) return 22;          // 2.2% - x1.6-2 выигрыш
  if (price >= 150) return 26;          // 2.6% - хороший выигрыш
  if (price >= 120) return 22;          // 2.2% - неплохой выигрыш

  // СРЕДНИЕ ВЫИГРЫШИ (25% общий)
  if (price >= 100) return 60;          // 6% - близко к окупу
  if (price >= 80) return 70;           // 7% - средний выигрыш
  if (price >= 60) return 80;           // 8% - небольшой убыток
  if (price >= 50) return 40;           // 4% - убыток

  // ЧАСТЫЕ ДРОПЫ (66.5% общий)
  if (price >= 40) return 140;          // 14% - средний убыток
  if (price >= 30) return 160;          // 16% - заметный убыток
  if (price >= 25) return 150;          // 15% - большой убыток
  if (price >= 20) return 130;          // 13% - очень дешевые
  if (price >= 15) return 85;           // 8.5% - мусор
  return 60;                            // 6% - базовый мусор
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - СТАТУС++ (7500₽/30 дней = 250₽/день)
 * Целевой RTP: 70% (средний выигрыш ~175₽) + защита от дубликатов
 */
function calculateWeightForStatusTier3(price) {
  price = parseFloat(price) || 0;

  // СУПЕР ДЖЕКПОТЫ (1% общий) - самый высокий шанс на дорогие предметы
  if (price >= 50000) return 0.01;      // 0.001% - ультра мега джекпот (x200)
  if (price >= 30000) return 0.02;      // 0.002% - супер мега джекпот (x120)
  if (price >= 20000) return 0.05;      // 0.005% - мега джекпот++ (x80)
  if (price >= 15000) return 0.1;       // 0.01% - мега джекпот+ (x60)
  if (price >= 10000) return 0.2;       // 0.02% - мега джекпот (x40)
  if (price >= 5000) return 0.8;        // 0.08% - большой джекпот (x20)
  if (price >= 3000) return 1.5;        // 0.15% - крупный джекпот (x12)
  if (price >= 2000) return 3;          // 0.3% - джекпот (x8)
  if (price >= 1000) return 6;          // 0.6% - мини джекпот (x4)
  if (price >= 800) return 8;           // 0.8% - отличный выигрыш (x3.2)
  if (price >= 500) return 10;          // 1% - хороший выигрыш (x2)

  // ХОРОШИЕ ВЫИГРЫШИ (12% общий)
  if (price >= 400) return 22;          // 2.2% - x1.6 выигрыш
  if (price >= 300) return 32;          // 3.2% - хороший выигрыш
  if (price >= 250) return 36;          // 3.6% - окуп дня
  if (price >= 200) return 36;          // 3.6% - близко к окупу

  // СРЕДНИЕ ВЫИГРЫШИ (30% общий)
  if (price >= 150) return 80;          // 8% - небольшой убыток
  if (price >= 120) return 90;          // 9% - средний выигрыш
  if (price >= 100) return 70;          // 7% - неплохо
  if (price >= 80) return 60;           // 6% - убыток

  // ЧАСТЫЕ ДРОПЫ (57% общий)
  if (price >= 60) return 120;          // 12% - средний убыток
  if (price >= 50) return 130;          // 13% - заметный убыток
  if (price >= 40) return 110;          // 11% - большой убыток
  if (price >= 30) return 100;          // 10% - очень дешевые
  if (price >= 20) return 110;          // 11% - мусор
  return 80;                            // 8% - базовый мусор
}

/**
 * БОНУСНЫЙ КЕЙС (из мини-игры Safe Cracker)
 * Целевой RTP: 55% (предметы 30-1000₽, средний ~165₽)
 */
function calculateWeightForBonus(price) {
  price = parseFloat(price) || 0;

  // ДЖЕКПОТЫ (2% общий)
  if (price >= 1000) return 5;          // 0.5% - джекпот
  if (price >= 800) return 8;           // 0.8% - мини джекпот
  if (price >= 600) return 7;           // 0.7% - отличный выигрыш

  // ХОРОШИЕ ВЫИГРЫШИ (15% общий)
  if (price >= 500) return 20;          // 2% - очень хороший выигрыш
  if (price >= 400) return 30;          // 3% - хороший выигрыш
  if (price >= 300) return 50;          // 5% - хороший выигрыш
  if (price >= 200) return 50;          // 5% - неплохой выигрыш

  // СРЕДНИЕ ВЫИГРЫШИ (35% общий)
  if (price >= 150) return 100;         // 10% - средний выигрыш
  if (price >= 100) return 120;         // 12% - небольшой выигрыш
  if (price >= 80) return 80;           // 8% - низкий выигрыш
  if (price >= 60) return 50;           // 5% - очень низкий

  // НИЗКИЕ ВЫИГРЫШИ (48% общий)
  if (price >= 50) return 120;          // 12% - дешевые
  if (price >= 40) return 140;          // 14% - очень дешевые
  if (price >= 30) return 220;          // 22% - базовые предметы

  // Предметы дешевле 30₽ не должны попадать в бонусный кейс
  return 0;
}

/**
 * ПЛАТИНОВЫЙ КЕЙС - 250₽
 * Целевой RTP: 70% (средний выигрыш ~175₽)
 * Окуп примерно раз в 2-3 кейса
 */
function calculateWeightForPlatinum250(price) {
  price = parseFloat(price) || 0;

  // СУПЕР ДЖЕКПОТЫ - ЩЕДРЫЕ веса для дорогих предметов (>499₽)
  if (price >= 50000) return 0.025;     // УВЕЛИЧЕНО x2.5 - ультра мега джекпот (x200)
  if (price >= 30000) return 0.05;      // УВЕЛИЧЕНО x2.5 - супер мега джекпот (x120)
  if (price >= 20000) return 0.12;      // УВЕЛИЧЕНО x2.4 - мега джекпот++ (x80)
  if (price >= 15000) return 0.24;      // УВЕЛИЧЕНО x2.4 - мега джекпот+ (x60)
  if (price >= 10000) return 0.36;      // УВЕЛИЧЕНО x2.4 - мега джекпот (x40)
  if (price >= 8000) return 0.7;        // УВЕЛИЧЕНО x2.3 - большой джекпот (x32)
  if (price >= 6000) return 1.2;        // УВЕЛИЧЕНО x2.4 - крупный джекпот (x24)
  if (price >= 5000) return 1.9;        // УВЕЛИЧЕНО x2.4 - джекпот (x20)
  if (price >= 4000) return 2.8;        // УВЕЛИЧЕНО x2.3 - мини джекпот++ (x16)
  if (price >= 3000) return 4.6;        // УВЕЛИЧЕНО x2.3 - мини джекпот+ (x12)
  if (price >= 2500) return 7;          // УВЕЛИЧЕНО x2.3 - мини джекпот (x10)
  if (price >= 2000) return 11;         // УВЕЛИЧЕНО x2.2 - отличный выигрыш (x8)
  if (price >= 1500) return 18;         // УВЕЛИЧЕНО x2.25 - очень хороший выигрыш (x6)
  if (price >= 1000) return 27;         // УВЕЛИЧЕНО x2.25 - хороший выигрыш (x4)

  // ХОРОШИЕ ВЫИГРЫШИ (8% общий) - выше стоимости кейса
  if (price >= 800) return 45;          // УВЕЛИЧЕНО x2.25 - x3.2 выигрыш
  if (price >= 600) return 56;          // УВЕЛИЧЕНО x2.24 - x2.4 выигрыш
  if (price >= 500) return 44;          // УВЕЛИЧЕНО x2.2 - x2 выигрыш
  if (price >= 400) return 15;          // 1.5% - x1.6 выигрыш

  // ОКУП (35% общий) - возврат 80-100% стоимости кейса (раз в 2-3 кейса!)
  if (price >= 250) return 100;         // 10% - полный окуп (x1)
  if (price >= 220) return 90;          // 9% - почти окуп (0.88x)
  if (price >= 200) return 80;          // 8% - близко к окупу (0.8x)
  if (price >= 180) return 80;          // 8% - хороший возврат (0.72x)

  // СРЕДНИЙ УБЫТОК (30% общий) - возврат 40-80%
  if (price >= 150) return 80;          // 8% - средний возврат (0.6x)
  if (price >= 120) return 70;          // 7% - небольшой убыток (0.48x)
  if (price >= 100) return 60;          // 6% - заметный убыток (0.4x)
  if (price >= 80) return 50;           // 5% - большой убыток (0.32x)
  if (price >= 60) return 40;           // 4% - очень большой убыток (0.24x)

  // БОЛЬШОЙ УБЫТОК (26.7% общий) - дешевые предметы
  if (price >= 50) return 80;           // 8% - дешевка (0.2x)
  if (price >= 40) return 70;           // 7% - очень дешево (0.16x)
  if (price >= 30) return 60;           // 6% - мусор (0.12x)
  if (price >= 20) return 57;           // 5.7% - базовый мусор
  return 50;                            // 5% - минимум
}

/**
 * АЛМАЗНЫЙ КЕЙС - 500₽
 * Целевой RTP: 72% (средний выигрыш ~360₽)
 * Окуп примерно раз в 2-3 кейса
 */
function calculateWeightForDiamond500(price) {
  price = parseFloat(price) || 0;

  // СУПЕР ДЖЕКПОТЫ - ЩЕДРЫЕ веса для дорогих предметов (>499₽)
  if (price >= 50000) return 0.036;     // УВЕЛИЧЕНО x2.4 - ультра мега джекпот (x100)
  if (price >= 30000) return 0.07;      // УВЕЛИЧЕНО x2.3 - супер мега джекпот (x60)
  if (price >= 20000) return 0.16;      // УВЕЛИЧЕНО x2.3 - мега джекпот++ (x40)
  if (price >= 15000) return 0.35;      // УВЕЛИЧЕНО x2.3 - мега джекпот+ (x30)
  if (price >= 10000) return 0.58;      // УВЕЛИЧЕНО x2.3 - мега джекпот (x20)
  if (price >= 8000) return 1.15;       // УВЕЛИЧЕНО x2.3 - большой джекпот (x16)
  if (price >= 6000) return 1.85;       // УВЕЛИЧЕНО x2.3 - крупный джекпот (x12)
  if (price >= 5000) return 2.8;        // УВЕЛИЧЕНО x2.3 - джекпот (x10)
  if (price >= 4000) return 4.6;        // УВЕЛИЧЕНО x2.3 - мини джекпот++ (x8)
  if (price >= 3000) return 8;          // УВЕЛИЧЕНО x2.3 - мини джекпот+ (x6)
  if (price >= 2500) return 11.5;       // УВЕЛИЧЕНО x2.3 - мини джекпот (x5)
  if (price >= 2000) return 18;         // УВЕЛИЧЕНО x2.25 - отличный выигрыш (x4)
  if (price >= 1500) return 27;         // УВЕЛИЧЕНО x2.25 - очень хороший выигрыш (x3)
  if (price >= 1000) return 41;         // УВЕЛИЧЕНО x2.3 - хороший выигрыш (x2)

  // ХОРОШИЕ ВЫИГРЫШИ (10% общий) - выше стоимости кейса
  if (price >= 800) return 56;          // УВЕЛИЧЕНО x2.24 - x1.6 выигрыш
  if (price >= 600) return 67;          // УВЕЛИЧЕНО x2.23 - x1.2 выигрыш
  if (price >= 500) return 56;          // УВЕЛИЧЕНО x2.24 - окуп+ (x1)
  if (price >= 450) return 20;          // 2% - почти окуп

  // ОКУП (33% общий) - возврат 80-100% стоимости кейса
  if (price >= 400) return 100;         // 10% - хороший возврат (0.8x)
  if (price >= 350) return 90;          // 9% - средний возврат (0.7x)
  if (price >= 300) return 70;          // 7% - небольшой убыток (0.6x)
  if (price >= 250) return 70;          // 7% - заметный убыток (0.5x)

  // СРЕДНИЙ УБЫТОК (30% общий)
  if (price >= 200) return 80;          // 8% - большой убыток (0.4x)
  if (price >= 150) return 70;          // 7% - очень большой убыток (0.3x)
  if (price >= 120) return 60;          // 6% - дешевка (0.24x)
  if (price >= 100) return 50;          // 5% - очень дешево (0.2x)
  if (price >= 80) return 40;           // 4% - мусор (0.16x)

  // БОЛЬШОЙ УБЫТОК (26.6% общий)
  if (price >= 60) return 80;           // 8% - дешевые предметы
  if (price >= 50) return 70;           // 7% - очень дешевые
  if (price >= 40) return 60;           // 6% - базовый мусор
  if (price >= 30) return 56;           // 5.6% - минимум
  return 50;                            // 5% - дно
}

/**
 * ЛЕГЕНДАРНЫЙ КЕЙС - 1000₽
 * Целевой RTP: 75% (средний выигрыш ~750₽)
 * Щедрый кейс с частыми окупами
 */
function calculateWeightForLegendary1000(price) {
  price = parseFloat(price) || 0;

  // СУПЕР ДЖЕКПОТЫ - ОЧЕНЬ ЩЕДРЫЕ веса для дорогих предметов
  if (price >= 50000) return 0.5;       // КАРДИНАЛЬНО УВЕЛИЧЕНО - ультра мега джекпот (x50)
  if (price >= 30000) return 1;         // КАРДИНАЛЬНО УВЕЛИЧЕНО - супер мега джекпот (x30)
  if (price >= 20000) return 2;         // КАРДИНАЛЬНО УВЕЛИЧЕНО - мега джекпот++ (x20)
  if (price >= 15000) return 4;         // КАРДИНАЛЬНО УВЕЛИЧЕНО - мега джекпот+ (x15)
  if (price >= 10000) return 8;         // КАРДИНАЛЬНО УВЕЛИЧЕНО - мега джекпот (x10)
  if (price >= 8000) return 15;         // КАРДИНАЛЬНО УВЕЛИЧЕНО - большой джекпот (x8)
  if (price >= 6000) return 25;         // КАРДИНАЛЬНО УВЕЛИЧЕНО - крупный джекпот (x6)
  if (price >= 5000) return 40;         // КАРДИНАЛЬНО УВЕЛИЧЕНО - джекпот (x5)
  if (price >= 4000) return 60;         // КАРДИНАЛЬНО УВЕЛИЧЕНО - мини джекпот++ (x4)
  if (price >= 3000) return 80;         // КАРДИНАЛЬНО УВЕЛИЧЕНО - мини джекпот+ (x3)
  if (price >= 2500) return 100;        // КАРДИНАЛЬНО УВЕЛИЧЕНО - мини джекпот (x2.5)
  if (price >= 2000) return 130;        // КАРДИНАЛЬНО УВЕЛИЧЕНО - отличный выигрыш (x2)
  if (price >= 1500) return 160;        // КАРДИНАЛЬНО УВЕЛИЧЕНО - очень хороший выигрыш (x1.5)
  if (price >= 1200) return 180;        // КАРДИНАЛЬНО УВЕЛИЧЕНО - хороший выигрыш (x1.2)

  // ХОРОШИЕ ВЫИГРЫШИ - окуп и выше
  if (price >= 1000) return 200;        // УВЕЛИЧЕНО - окуп+ (x1)

  // ОКУП - частый окуп!
  if (price >= 900) return 150;         // почти окуп (0.9x)
  if (price >= 800) return 130;         // хороший возврат (0.8x)
  if (price >= 700) return 110;         // средний возврат (0.7x)
  if (price >= 600) return 90;          // небольшой убыток (0.6x)
  if (price >= 500) return 70;          // заметный убыток (0.5x)

  // СРЕДНИЙ УБЫТОК
  if (price >= 400) return 60;          // большой убыток (0.4x)
  if (price >= 300) return 50;          // очень большой убыток (0.3x)
  if (price >= 250) return 40;          // дешевка (0.25x)
  if (price >= 200) return 30;          // очень дешево (0.2x)
  if (price >= 150) return 20;          // мусор (0.15x)

  // БОЛЬШОЙ УБЫТОК
  if (price >= 120) return 40;          // дешевые предметы
  if (price >= 100) return 35;          // очень дешевые
  if (price >= 80) return 30;           // базовый мусор
  if (price >= 60) return 25;           // минимум
  return 20;                            // дно
}

/**
 * МИФИЧЕСКИЙ КЕЙС - 10000₽
 * Целевой RTP: 85% (средний выигрыш ~8500₽)
 * ОЧЕНЬ щедрый кейс - часто выпадают предметы за 13k, 17k, 25k
 */
function calculateWeightForMythic10000(price) {
  price = parseFloat(price) || 0;

  // СУПЕР ДЖЕКПОТЫ - МЕГА ЩЕДРЫЕ (предметы дороже кейса)
  if (price >= 50000) return 5;         // МЕГА УВЕЛИЧЕНО ~0.5% - ультра джекпот (x5)
  if (price >= 40000) return 8;         // МЕГА УВЕЛИЧЕНО ~0.7% - супер джекпот (x4)
  if (price >= 30000) return 12;        // МЕГА УВЕЛИЧЕНО ~1% - мега джекпот (x3)
  if (price >= 25000) return 20;        // МЕГА УВЕЛИЧЕНО ~1.5% - большой джекпот (x2.5)
  if (price >= 20000) return 30;        // МЕГА УВЕЛИЧЕНО ~2% - крупный джекпот (x2)
  if (price >= 17000) return 45;        // МЕГА УВЕЛИЧЕНО ~3% - джекпот++ (x1.7)
  if (price >= 15000) return 60;        // МЕГА УВЕЛИЧЕНО ~4% - джекпот+ (x1.5)
  if (price >= 13000) return 80;        // МЕГА УВЕЛИЧЕНО ~5% - джекпот (x1.3)

  // ХОРОШИЕ ВЫИГРЫШИ - выше стоимости кейса (итого ~17%)
  if (price >= 12000) return 100;       // ~6% - отличный выигрыш (x1.2)
  if (price >= 11000) return 120;       // ~7% - очень хороший выигрыш (x1.1)
  if (price >= 10000) return 70;        // ~4% - окуп (x1)

  // СРЕДНИЕ ВЫИГРЫШИ - возврат 50-100% (итого ~35%)
  if (price >= 9000) return 140;        // ~8% - почти окуп (0.9x)
  if (price >= 8000) return 160;        // ~10% - хороший возврат (0.8x)
  if (price >= 7000) return 140;        // ~8% - средний возврат (0.7x)
  if (price >= 6000) return 120;        // ~7% - неплохой возврат (0.6x)
  if (price >= 5000) return 40;         // ~2% - средний убыток (0.5x)

  // НЕБОЛЬШОЙ УБЫТОК - возврат 30-50% (итого ~25%)
  if (price >= 4000) return 100;        // ~6% - заметный убыток (0.4x)
  if (price >= 3500) return 120;        // ~7% - большой убыток (0.35x)
  if (price >= 3000) return 140;        // ~8% - очень большой убыток (0.3x)
  if (price >= 2500) return 80;         // ~4% - дешевка (0.25x)

  // БОЛЬШОЙ УБЫТОК - возврат <30% (итого ~23%)
  if (price >= 2000) return 100;        // ~6% - очень дешевые (0.2x)
  if (price >= 1500) return 110;        // ~6% - мусор (0.15x)
  if (price >= 1000) return 90;         // ~5% - очень дешево
  if (price >= 800) return 60;          // ~3% - базовый мусор
  if (price >= 600) return 50;          // ~3% - минимум
  return 30;                            // дно
}

/**
 * Универсальная функция расчета веса с учетом типа кейса
 * @param {number} price - цена предмета
 * @param {string} caseType - тип кейса
 * @returns {number} правильный вес предмета
 */
function calculateCorrectWeightByPrice(price, caseType = 'premium') {
  price = parseFloat(price) || 0;

  switch(caseType) {
    case 'premium_499':
    case 'premium':
      return calculateWeightForPremium499(price);

    case 'standard_99':
    case 'purchase':
      return calculateWeightForStandard99(price);

    case 'free_daily':
    case 'daily_free':
      return calculateWeightForFreeDaily(price);

    case 'daily_tier1':
    case 'subscription_tier1':
      return calculateWeightForStatusTier1(price);

    case 'daily_tier2':
    case 'subscription_tier2':
      return calculateWeightForStatusTier2(price);

    case 'daily_tier3':
    case 'subscription_tier3':
      return calculateWeightForStatusTier3(price);

    case 'bonus':
    case 'special':
      return calculateWeightForBonus(price);

    case 'platinum_250':
      return calculateWeightForPlatinum250(price);

    case 'diamond_500':
      return calculateWeightForDiamond500(price);

    case 'legendary_1000':
    case 'legendary':
      return calculateWeightForLegendary1000(price);

    case 'mythic_10000':
      return calculateWeightForMythic10000(price);

    default:
      // Fallback на премиум кейс
      console.warn(`Неизвестный тип кейса: ${caseType}, используем премиум веса`);
      return calculateWeightForPremium499(price);
  }
}

/**
 * Выбрать предмет с правильными весами на основе цены (игнорирует drop_weight из БД)
 * @param {Array} items - массив предметов
 * @param {number} userSubscriptionTier - уровень подписки пользователя
 * @param {Array} excludedItemIds - ID исключенных предметов (для Статус++)
 * @param {string} caseType - тип кейса для расчета весов
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithCorrectWeights(items, userSubscriptionTier = 0, excludedItemIds = [], caseType = 'premium') {
  console.log(`[selectItemWithCorrectWeights] Получено предметов: ${items ? items.length : 'null/undefined'}`);
  console.log(`[selectItemWithCorrectWeights] Исключенных предметов: ${excludedItemIds.length}`);
  console.log(`[selectItemWithCorrectWeights] Уровень подписки: ${userSubscriptionTier}`);
  console.log(`[selectItemWithCorrectWeights] Тип кейса: ${caseType}`);

  if (!items || items.length === 0) {
    console.log(`[selectItemWithCorrectWeights] Массив предметов пуст или не существует`);
    return null;
  }

  // Для пользователей Статус++ исключаем уже выпавшие предметы
  let availableItems = items;
  if (userSubscriptionTier >= 3 && excludedItemIds.length > 0) {
    availableItems = items.filter(item => !excludedItemIds.includes(item.id));
    console.log(`[selectItemWithCorrectWeights] Статус++: после исключения осталось ${availableItems.length} предметов`);
  }

  if (availableItems.length === 0) {
    console.log(`[selectItemWithCorrectWeights] Все предметы исключены для пользователя с подпиской ${userSubscriptionTier}`);
    return null;
  }

  // Рассчитываем правильные веса на основе цен с учетом типа кейса
  const itemsWithCorrectWeights = availableItems.map(item => {
    const price = parseFloat(item.price) || 0;
    const correctWeight = calculateCorrectWeightByPrice(price, caseType);

    return {
      ...item,
      correctWeight: correctWeight,
      price: price
    };
  });

  // Рассчитываем общий вес
  const totalWeight = itemsWithCorrectWeights.reduce((sum, item) => {
    return sum + item.correctWeight;
  }, 0);

  console.log(`[selectItemWithCorrectWeights] Общий вес: ${totalWeight}`);
  console.log(`[selectItemWithCorrectWeights] Первые 5 предметов с весами:`,
    itemsWithCorrectWeights.slice(0, 5).map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      correctWeight: item.correctWeight,
      chance: ((item.correctWeight / totalWeight) * 100).toFixed(4) + '%'
    }))
  );

  if (totalWeight <= 0) {
    // Если общий вес 0, выбираем случайный предмет из доступных
    console.log(`[selectItemWithCorrectWeights] Общий вес 0, выбираем случайный предмет из доступных`);
    const randomItem = itemsWithCorrectWeights[Math.floor(Math.random() * itemsWithCorrectWeights.length)];
    console.log(`[selectItemWithCorrectWeights] Выбран случайный предмет: ${randomItem ? randomItem.id : 'undefined'}`);
    return randomItem;
  }

  // Генерируем случайное число
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  console.log(`[selectItemWithCorrectWeights] Случайное число: ${random}`);

  // Находим предмет, соответствующий случайному числу
  for (const item of itemsWithCorrectWeights) {
    currentWeight += item.correctWeight;
    console.log(`[selectItemWithCorrectWeights] Предмет ${item.id} (${item.price}₽), вес: ${item.correctWeight}, текущий вес: ${currentWeight}`);

    if (random <= currentWeight) {
      console.log(`[selectItemWithCorrectWeights] Выбран предмет: ${item.id} с ценой ${item.price}₽`);
      return item;
    }
  }

  // Fallback - возвращаем последний предмет из доступных
  const fallbackItem = itemsWithCorrectWeights[itemsWithCorrectWeights.length - 1];
  console.log(`[selectItemWithCorrectWeights] Fallback - выбран последний предмет: ${fallbackItem ? fallbackItem.id : 'undefined'}`);
  return fallbackItem;
}

/**
 * Рассчитать модифицированные веса выпадения с учетом бонусов пользователя
 * @param {Array} items - массив предметов с их базовыми весами
 * @param {Object|number} userBonuses - бонусы пользователя (объект или общий процент)
 * @param {string} caseType - тип кейса для расчета весов
 * @returns {Array} массив предметов с модифицированными весами
 */
function calculateModifiedDropWeights(items, userBonuses = {}, caseType = 'premium') {
  console.log(`[calculateModifiedDropWeights] Получено ${items ? items.length : 'null/undefined'} предметов`);
  console.log(`[calculateModifiedDropWeights] Бонусы пользователя:`, userBonuses);
  console.log(`[calculateModifiedDropWeights] Тип кейса: ${caseType}`);

  if (!items || items.length === 0) {
    return [];
  }

  console.log(`[calculateModifiedDropWeights] Первые 3 предмета до обработки:`, items.slice(0, 3).map(item => ({
    id: item.id,
    name: item.name,
    drop_weight: item.drop_weight,
    price: item.price
  })));

  // Поддерживаем как объект, так и число
  let totalBonus = 0;
  if (typeof userBonuses === 'number') {
    // Если передан процент как число, преобразуем его в долю (например, 15% -> 0.15)
    totalBonus = Math.min(userBonuses / 100, 0.25); // Максимум 25%
    console.log(`[calculateModifiedDropWeights] Получен числовой бонус: ${userBonuses}% -> ${totalBonus}`);
  } else {
    // Если передан объект с отдельными бонусами
    const {
      subscriptionBonus = 0,    // бонус от подписки (до 5%)
      achievementBonus = 0,     // бонус от достижений (до 17%)
      levelBonus = 0           // бонус от уровня (до 2%)
    } = userBonuses;
    totalBonus = Math.min((subscriptionBonus + achievementBonus + levelBonus) / 100, 0.25); // Максимум 25%
    console.log(`[calculateModifiedDropWeights] Объект бонусов: подписка=${subscriptionBonus}%, достижения=${achievementBonus}%, уровень=${levelBonus}%, итого=${totalBonus}`);
  }

  const result = items.map(item => {
    const itemPrice = parseFloat(item.price) || 0;
    // Используем правильный вес на основе цены и типа кейса вместо drop_weight из БД
    const baseWeight = calculateCorrectWeightByPrice(itemPrice, caseType);

    // Бонус применяется больше к дорогим предметам
    let weightMultiplier = 1;
    if (totalBonus > 0) {
      // Для дорогих предметов (≥100₽) бонус работает сильнее
      // Предметы от 100₽ до 10000₽ получают масштабируемый бонус
      const priceCategory = Math.min(Math.max(itemPrice - 100, 0) / 100, 50); // категория от 0 до 50
      const bonusEffect = 1 + (totalBonus * (1 + priceCategory / 50));
      weightMultiplier = bonusEffect;

      console.log(`[calculateModifiedDropWeights] Предмет ${item.id} (${itemPrice}₽): категория=${priceCategory.toFixed(2)}, множитель=${weightMultiplier.toFixed(3)}`);
    }

    const modifiedWeight = baseWeight * weightMultiplier;

    const resultItem = {
      // Явно копируем все основные поля
      id: item.id,
      name: item.name,
      description: item.description,
      image_url: item.image_url,
      price: item.price,
      rarity: item.rarity,
      drop_weight: baseWeight, // Используем правильный базовый вес
      min_subscription_tier: item.min_subscription_tier,
      weapon_type: item.weapon_type,
      skin_name: item.skin_name,
      steam_market_hash_name: item.steam_market_hash_name,
      steam_market_url: item.steam_market_url,
      is_available: item.is_available,
      float_value: item.float_value,
      exterior: item.exterior,
      quality: item.quality,
      stickers: item.stickers,
      origin: item.origin,
      in_stock: item.in_stock,
      is_tradable: item.is_tradable,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      category_id: item.category_id,
      // Добавляем расчетные поля
      originalWeight: baseWeight,
      modifiedWeight: modifiedWeight,
      bonusApplied: totalBonus,
      weightMultiplier: weightMultiplier
    };

    return resultItem;
  });

  console.log(`[calculateModifiedDropWeights] Первые 3 предмета после обработки:`, result.slice(0, 3).map(item => ({
    id: item.id,
    name: item.name,
    originalWeight: item.originalWeight,
    modifiedWeight: item.modifiedWeight
  })));

  return result;
}

/**
 * Выбрать предмет на основе модифицированных весов
 * @param {Array} itemsWithWeights - предметы с модифицированными весами
 * @param {number} userSubscriptionTier - уровень подписки пользователя
 * @param {Array} excludedItemIds - ID исключенных предметов (для Статус++)
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithModifiedWeights(itemsWithWeights, userSubscriptionTier = 0, excludedItemIds = []) {
  console.log(`[selectItemWithModifiedWeights] Получено предметов: ${itemsWithWeights ? itemsWithWeights.length : 'null/undefined'}`);

  if (!itemsWithWeights || itemsWithWeights.length === 0) {
    console.log(`[selectItemWithModifiedWeights] Массив предметов пуст или не существует`);
    return null;
  }

  // Фильтруем исключенные предметы для пользователей Статус++
  let availableItems = itemsWithWeights;

  if (userSubscriptionTier >= 3 && excludedItemIds.length > 0) {
    availableItems = itemsWithWeights.filter(item => !excludedItemIds.includes(item.id));
    console.log(`[selectItemWithModifiedWeights] Статус++: отфильтровано ${itemsWithWeights.length} -> ${availableItems.length} предметов (исключено ${excludedItemIds.length})`);
  } else {
    // Для обычных пользователей используем старую логику с полями is_excluded/isExcluded
    availableItems = filterExcludedItems(itemsWithWeights, userSubscriptionTier);
  }

  if (availableItems.length === 0) {
    console.log(`[selectItemWithModifiedWeights] Все предметы исключены для пользователя с подпиской ${userSubscriptionTier}`);
    return null;
  }

  // Рассчитываем общий вес
  const totalWeight = availableItems.reduce((sum, item) => {
    const weight = item.modifiedWeight || calculateCorrectWeightByPrice(parseFloat(item.price) || 0);
    return sum + weight;
  }, 0);

  console.log(`[selectItemWithModifiedWeights] Общий вес: ${totalWeight}`);

  if (totalWeight <= 0) {
    // Если общий вес 0, выбираем случайный предмет из доступных
    console.log(`[selectItemWithModifiedWeights] Общий вес 0, выбираем случайный предмет из доступных`);
    const randomItem = availableItems[Math.floor(Math.random() * availableItems.length)];
    console.log(`[selectItemWithModifiedWeights] Выбран случайный предмет: ${randomItem ? randomItem.id : 'undefined'}`);
    return randomItem;
  }

  // Генерируем случайное число
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  console.log(`[selectItemWithModifiedWeights] Случайное число: ${random}`);

  // Находим предмет, соответствующий случайному числу
  for (const item of availableItems) {
    const itemWeight = item.modifiedWeight || calculateCorrectWeightByPrice(parseFloat(item.price) || 0);
    currentWeight += itemWeight;
    console.log(`[selectItemWithModifiedWeights] Предмет ${item.id}, вес: ${itemWeight}, текущий вес: ${currentWeight}`);

    if (random <= currentWeight) {
      console.log(`[selectItemWithModifiedWeights] Выбран предмет: ${item.id}`);
      return item;
    }
  }

  // Fallback - возвращаем последний предмет из доступных
  const fallbackItem = availableItems[availableItems.length - 1];
  console.log(`[selectItemWithModifiedWeights] Fallback - выбран последний предмет: ${fallbackItem ? fallbackItem.id : 'undefined'}`);
  return fallbackItem;
}

/**
 * Выбрать предмет с защитой от дубликатов (для премиум подписки)
 * @param {Array} itemsWithWeights - предметы с модифицированными весами
 * @param {Array} recentItems - недавно выпавшие предметы (ID)
 * @param {number} duplicateProtectionCount - количество последних предметов для проверки
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithModifiedWeightsAndDuplicateProtection(
  itemsWithWeights,
  recentItems = [],
  duplicateProtectionCount = 5,
  userSubscriptionTier = 0
) {
  if (!itemsWithWeights || itemsWithWeights.length === 0) {
    return null;
  }

  // Фильтруем предметы, исключая недавно выпавшие
  const recentItemIds = recentItems.slice(-duplicateProtectionCount);
  const availableItems = itemsWithWeights.filter(item => {
    return !recentItemIds.includes(item.id);
  });

  // Если все предметы в списке недавних, используем все
  const itemsToSelect = availableItems.length > 0 ? availableItems : itemsWithWeights;

  return selectItemWithModifiedWeights(itemsToSelect, userSubscriptionTier, []);
}

/**
 * Выбрать предмет с полным исключением уже выпавших предметов для пользователей Статус++
 * @param {Array} itemsWithWeights - предметы с модифицированными весами
 * @param {Array} excludedItems - все уже выпавшие предметы (ID)
 * @param {number} userSubscriptionTier - уровень подписки пользователя
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithFullDuplicateProtection(
  itemsWithWeights,
  excludedItems = [],
  userSubscriptionTier = 0
) {
  console.log(`[selectItemWithFullDuplicateProtection] Получено предметов: ${itemsWithWeights ? itemsWithWeights.length : 'null'}`);
  console.log(`[selectItemWithFullDuplicateProtection] Исключено предметов: ${excludedItems.length}`);
  console.log(`[selectItemWithFullDuplicateProtection] Уровень подписки: ${userSubscriptionTier}`);

  if (!itemsWithWeights || itemsWithWeights.length === 0) {
    return null;
  }

  // Для пользователей Статус++ (tier >= 3) полностью исключаем уже выпавшие предметы
  if (userSubscriptionTier >= 3 && excludedItems.length > 0) {
    const availableItems = itemsWithWeights.filter(item => {
      const isExcluded = excludedItems.includes(item.id);
      if (isExcluded) {
        console.log(`[selectItemWithFullDuplicateProtection] Исключаем предмет: ${item.id} (${item.name})`);
      }
      return !isExcluded;
    });

    console.log(`[selectItemWithFullDuplicateProtection] Статус++: после исключения осталось ${availableItems.length} предметов`);

    // Логируем первые несколько доступных предметов
    if (availableItems.length > 0) {
      console.log(`[selectItemWithFullDuplicateProtection] Первые 3 доступных предмета:`,
        availableItems.slice(0, 3).map(item => ({ id: item.id, name: item.name, price: item.price })));
    }

    if (availableItems.length === 0) {
      console.log(`[selectItemWithFullDuplicateProtection] ВНИМАНИЕ: Все предметы исключены для пользователя Статус++!`);
      console.log(`[selectItemWithFullDuplicateProtection] Исходно было предметов: ${itemsWithWeights.length}`);
      console.log(`[selectItemWithFullDuplicateProtection] Исключенных ID: ${excludedItems}`);
      // В этом случае пользователь получил все возможные предметы из кейса
      return null;
    }

    return selectItemWithModifiedWeights(availableItems, userSubscriptionTier, []);
  }

  // Для обычных пользователей используем стандартную логику (без исключений)
  return selectItemWithModifiedWeights(itemsWithWeights, userSubscriptionTier, []);
}

/**
 * Получить статистику распределения весов
 * @param {Array} items - предметы с весами
 * @returns {Object} статистика
 */
function getWeightDistributionStats(items) {
  if (!items || items.length === 0) {
    return {
      totalItems: 0,
      totalWeight: 0,
      averageWeight: 0,
      priceCategories: {}
    };
  }

  const totalWeight = items.reduce((sum, item) => {
    return sum + (item.modifiedWeight || calculateCorrectWeightByPrice(parseFloat(item.price) || 0));
  }, 0);

  const averageWeight = totalWeight / items.length;

  // Группировка по ценовым категориям (дорогие предметы начинаются от 100₽)
  const priceCategories = {
    'legendary': { items: [], totalWeight: 0, minPrice: 50000 },
    'mythic': { items: [], totalWeight: 0, minPrice: 30000 },
    'epic': { items: [], totalWeight: 0, minPrice: 20000 },
    'veryRare': { items: [], totalWeight: 0, minPrice: 15000 },
    'rare': { items: [], totalWeight: 0, minPrice: 10000 },
    'uncommonPlus': { items: [], totalWeight: 0, minPrice: 8000 },
    'uncommon': { items: [], totalWeight: 0, minPrice: 5000 },
    'commonPlus': { items: [], totalWeight: 0, minPrice: 3000 },
    'common': { items: [], totalWeight: 0, minPrice: 1000 },
    'frequent': { items: [], totalWeight: 0, minPrice: 500 },
    'expensive': { items: [], totalWeight: 0, minPrice: 100 }, // Дорогие предметы (≥100₽) с бонусом
    'cheap': { items: [], totalWeight: 0, minPrice: 0 }        // Дешевые предметы (<100₽) без бонуса
  };

  items.forEach(item => {
    const price = parseFloat(item.price) || 0;
    const weight = item.modifiedWeight || calculateCorrectWeightByPrice(price);

    let category = 'cheap';
    if (price >= 50000) category = 'legendary';
    else if (price >= 30000) category = 'mythic';
    else if (price >= 20000) category = 'epic';
    else if (price >= 15000) category = 'veryRare';
    else if (price >= 10000) category = 'rare';
    else if (price >= 8000) category = 'uncommonPlus';
    else if (price >= 5000) category = 'uncommon';
    else if (price >= 3000) category = 'commonPlus';
    else if (price >= 1000) category = 'common';
    else if (price >= 500) category = 'frequent';
    else if (price >= 100) category = 'expensive'; // Дорогие предметы с бонусом

    priceCategories[category].items.push(item);
    priceCategories[category].totalWeight += weight;
  });

  return {
    totalItems: items.length,
    totalWeight: totalWeight,
    averageWeight: averageWeight,
    priceCategories: priceCategories
  };
}

/**
 * Определяет тип кейса на основе шаблона кейса
 * @param {Object} caseTemplate - шаблон кейса
 * @param {boolean} isPaid - является ли кейс платным
 * @returns {string} тип кейса для расчета весов
 */
function determineCaseType(caseTemplate, isPaid = false) {
  if (!caseTemplate) {
    console.warn('[determineCaseType] Шаблон кейса не передан, используем premium по умолчанию');
    return 'premium';
  }

  const templateId = caseTemplate.id;
  const templateName = caseTemplate.name || '';
  const price = caseTemplate.price;

  // Определяем тип по ID шаблона
  // Бесплатный ежедневный кейс
  if (templateId === '11111111-1111-1111-1111-111111111111') {
    return 'free_daily';
  }

  // Ежедневный кейс - Статус (tier 1)
  if (templateId === '22222222-2222-2222-2222-222222222222') {
    return 'daily_tier1';
  }

  // Ежедневный кейс - Статус+ (tier 2)
  if (templateId === '33333333-3333-3333-3333-333333333333') {
    return 'daily_tier2';
  }

  // Ежедневный кейс - Статус++ (tier 3)
  if (templateId === '44444444-4444-4444-4444-444444444444') {
    return 'daily_tier3';
  }

  // Бонусный кейс
  if (templateId === '55555555-5555-5555-5555-555555555555') {
    return 'bonus';
  }

  // Стандартный кейс за 99₽
  if (templateId === '66666666-6666-6666-6666-666666666666' || price === 99) {
    return 'standard_99';
  }

  // Премиум кейс за 499₽
  if (templateId === '77777777-7777-7777-7777-777777777777' || price === 499) {
    return 'premium_499';
  }

  // Новые премиум кейсы
  if (templateId === '88888888-8888-8888-8888-888888888888' || price === 17) {
    return 'standard_99'; // Бронзовый - используем веса стандартного кейса
  }
  if (templateId === '99999999-9999-9999-9999-999999999999' || price === 50) {
    return 'standard_99'; // Серебряный
  }
  if (templateId === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' || price === 100) {
    return 'standard_99'; // Золотой
  }
  if (templateId === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' || price === 250) {
    return 'platinum_250'; // Платиновый - щедрые веса (RTP 70%)
  }
  if (templateId === 'cccccccc-cccc-cccc-cccc-cccccccccccc' || price === 500) {
    return 'diamond_500'; // Алмазный - более щедрые веса (RTP 72%)
  }
  if (templateId === 'dddddddd-dddd-dddd-dddd-dddddddddddd' || price === 1000) {
    return 'legendary_1000'; // Легендарный - самые щедрые веса (RTP 75%)
  }
  if (templateId === 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' || price === 2500) {
    return 'legendary_1000'; // Мистический - используем веса легендарного
  }
  if (templateId === 'ffffffff-ffff-ffff-ffff-ffffffffffff' || price === 5000) {
    return 'legendary_1000'; // Эпический - используем веса легендарного
  }
  if (templateId === '10101010-1010-1010-1010-101010101010' || price === 10000) {
    return 'mythic_10000'; // Мифический - ОЧЕНЬ ЩЕДРЫЕ веса (RTP 85%)
  }

  // Определяем по типу и цене
  if (caseTemplate.type === 'daily') {
    const minTier = caseTemplate.min_subscription_tier || 0;
    if (minTier === 0) return 'free_daily';
    if (minTier === 1) return 'daily_tier1';
    if (minTier === 2) return 'daily_tier2';
    if (minTier === 3) return 'daily_tier3';
  }

  if (caseTemplate.type === 'special' || templateName.toLowerCase().includes('бонус')) {
    return 'bonus';
  }

  // Платные кейсы
  if (isPaid || price > 0) {
    if (price === 99) return 'standard_99';
    if (price === 250) return 'platinum_250';
    if (price === 499) return 'premium_499';
    if (price === 500) return 'diamond_500';
    if (price === 1000) return 'legendary_1000';
    if (price >= 2500) return 'legendary_1000'; // Для очень дорогих кейсов
    // Для других цен используем премиум веса
    return 'premium_499';
  }

  // Fallback
  console.warn(`[determineCaseType] Не удалось определить точный тип кейса для ${templateName} (ID: ${templateId}), используем premium`);
  return 'premium_499';
}

module.exports = {
  calculateModifiedDropWeights,
  selectItemWithModifiedWeights,
  selectItemWithModifiedWeightsAndDuplicateProtection,
  selectItemWithFullDuplicateProtection,
  selectItemWithCorrectWeights,
  filterExcludedItems,
  getWeightDistributionStats,
  calculateCorrectWeightByPrice,
  determineCaseType
};

