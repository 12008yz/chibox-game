'use strict';

const { randomUUID } = require('crypto');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const PROMO_USER_ID = '__promo__';

function isGlobalChatPromoEnabled() {
  return process.env.GLOBAL_CHAT_PROMO_ENABLED !== 'false' &&
    process.env.GLOBAL_CHAT_PROMO_ENABLED !== '0';
}

/**
 * Один таймер на процесс: при PM2 cluster — только воркер с NODE_APP_INSTANCE=0.
 * INSTANCE_ID не используем (в AWS/K8s это часто UUID/имя инстанса, не индекс — реклама бы никогда не шла).
 */
function shouldRunGlobalChatPromoTimer() {
  const inst = process.env.NODE_APP_INSTANCE;
  if (inst === undefined || inst === '') return true;
  return String(inst) === '0';
}

function getGlobalChatPromoIntervalMs() {
  const n = parseInt(process.env.GLOBAL_CHAT_PROMO_INTERVAL_MS, 10);
  if (Number.isFinite(n) && n >= 60_000) return n;
  return DEFAULT_INTERVAL_MS;
}

function getGlobalChatPromoBody() {
  const custom = (process.env.GLOBAL_CHAT_PROMO_MESSAGE || '').trim();
  if (custom.length) return custom.slice(0, 500);
  return 'Подписывайтесь на ChiBox: Telegram https://t.me/chibox_official · ВКонтакте https://vk.com/chibox_game — новости, акции и розыгрыши!';
}

function buildGlobalChatPromoPayload() {
  return {
    id: `promo-${randomUUID()}`,
    userId: PROMO_USER_ID,
    username: 'ChiBox',
    level: 0,
    body: getGlobalChatPromoBody(),
    createdAt: new Date().toISOString(),
    kind: 'promo',
  };
}

module.exports = {
  isGlobalChatPromoEnabled,
  shouldRunGlobalChatPromoTimer,
  getGlobalChatPromoIntervalMs,
  buildGlobalChatPromoPayload,
  PROMO_USER_ID,
};
