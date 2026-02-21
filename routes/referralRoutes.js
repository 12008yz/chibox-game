const express = require('express');
const { trackClick, getReferralInfoByCode } = require('../services/referralService');
const { logger } = require('../utils/logger');

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://chibox-game.ru';

// Дедупликация: один клик с одного IP по одному коду за окно (мс). Убирает двойной подсчёт из-за prefetch + навигации.
const CLICK_DEDUPE_MS = 30 * 1000; // 30 сек
const clickLastSeen = new Map(); // key: "ip|code" -> timestamp
const DEDUPE_PRUNE_INTERVAL = 60 * 1000; // раз в минуту чистить старые ключи
let lastPrune = Date.now();

function shouldCountClick(ip, code) {
  const key = `${ip || 'unknown'}|${code}`;
  const now = Date.now();
  if (now - lastPrune > DEDUPE_PRUNE_INTERVAL) {
    lastPrune = now;
    for (const [k, ts] of clickLastSeen.entries()) {
      if (now - ts > CLICK_DEDUPE_MS) clickLastSeen.delete(k);
    }
  }
  const last = clickLastSeen.get(key);
  if (last != null && now - last < CLICK_DEDUPE_MS) return false;
  clickLastSeen.set(key, now);
  return true;
}

/**
 * GET /api/v1/referral/redirect/:code
 * Учёт перехода и редирект на основной сайт с ?ref= (для ссылок streamer.domain/CODE).
 * Вызывается при заходе по реферальной ссылке — переход считается на сервере, затем 302.
 */
router.get('/redirect/:code', async (req, res) => {
  const code = (req.params.code || '').trim().replace(/\/.*$/, '');
  // Не кешировать редирект — каждый переход должен дойти до сервера и учться
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  if (!code || code.length > 64) {
    return res.redirect(302, FRONTEND_URL);
  }
  const ip = req.ip || req.connection?.remoteAddress;
  if (shouldCountClick(ip, code)) {
    const result = await trackClick(code);
    if (!result.success) {
      logger.info('Referral redirect: click not counted', { code: code.substring(0, 12), error: result.error });
    } else {
      logger.info('Referral redirect: click counted', { code: result.link?.code });
    }
  }
  return res.redirect(302, `${FRONTEND_URL}?ref=${encodeURIComponent(code)}`);
});

/**
 * GET /api/v1/referral/click?code=XXX
 * Учёт перехода по реферальной ссылке (без авторизации).
 */
router.get('/click', async (req, res) => {
  const code = req.query.code;
  logger.info('Referral click request received', { code: (code || '').substring(0, 16), origin: req.get('origin') });
  const result = await trackClick(code);
  if (!result.success) {
    logger.info('Referral click not counted', { code: (code || '').substring(0, 12), error: result.error });
    return res.status(404).json({ success: false, error: result.error || 'not_found' });
  }
  logger.info('Referral click counted', { code: result.link?.code, linkId: result.link?.id });
  return res.json({ success: true });
});

/**
 * GET /api/v1/referral/info?code=XXX
 * Публичные данные для модалки: кто пригласил, какие бонусы.
 */
router.get('/info', async (req, res) => {
  const code = req.query.code;
  const info = await getReferralInfoByCode(code);
  if (!info) {
    return res.status(404).json({ success: false, message: 'Ссылка не найдена или неактивна' });
  }
  return res.json({ success: true, data: info });
});

module.exports = router;
