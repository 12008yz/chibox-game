'use strict';

const { randomUUID } = require('crypto');

/**
 * «Теневая» модерация общего чата: текст проверяется до записи в БД.
 * Совпадения — не сохраняем и не вещаем, но отправителю уходит такое же
 * событие globalChatMessage (локальная иллюзия отправки).
 */

function normalizeChatText(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Целое слово (кириллица/латиница/цифры/маркеры комбинируемых букв) */
function containsWholeWord(haystack, word) {
  const w = word.toLowerCase();
  if (!w.length) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])${escapeRegex(w)}(?![\\p{L}\\p{M}\\p{N}_])`, 'iu');
  return re.test(haystack);
}

/** Мошенничество, токсичные обвинения (как отдельные слова/формы) */
const SCAM_TERMS = [
  'scam',
  'scammer',
  'скам',
  'скамер',
  'скамят',
  'скамить',
  'обман',
  'обманул',
  'обманули',
  'обмануть',
  'обманщик',
  'кидал',
  'кидало',
  'кидали',
  'кидала',
  'кидалы',
  'кидалово',
  'кинул',
  'кинули',
  'развод',
  'разводняк',
  'швырнул',
  'наебал',
  'наёбал',
  'наебут',
  'наебалово',
  'наёбалово',
];

/** Экстремизм / террор (короткий список по запросу модерации площадки) */
const TERROR_TERMS = [
  'терроризм',
  'террорист',
  'теракт',
  'взрывчатк',
  'смертник',
  'джихад',
  'игил',
];

const TERROR_PHRASES = ['исламское государство'];

/**
 * Грубые корни (подстрока после нормализации): ловят склонения и типичные замены.
 * Намеренно без очень коротких шаблонов вроде «еб», чтобы снизить ложные срабатывания.
 */
const MAT_SUBSTRINGS = [
  'хуй',
  'хуя',
  'хуе',
  'хуи',
  'hui',
  'пизд',
  'бляд',
  'блят',
  'бляц',
  'уеб',
  'уёб',
  'ебан',
  'ебат',
  'ебёт',
  'ебет',
  'ебаль',
  'ебп',
  'ёбан',
  'ёбн',
  'ёбт',
  'епт',
  'сука',
  'суки',
  'суку',
  'мудак',
  'мудач',
  'говн',
  'дерьм',
  'залуп',
  'мраз',
  'пидор',
  'пидр',
  'шлюх',
];

function isGlobalChatShadowBlocked(rawText) {
  const n = normalizeChatText(rawText);
  if (!n) return false;

  for (const w of SCAM_TERMS) {
    if (containsWholeWord(n, w)) return true;
  }
  for (const w of TERROR_TERMS) {
    if (containsWholeWord(n, w)) return true;
  }
  for (const p of TERROR_PHRASES) {
    if (n.includes(p)) return true;
  }
  for (const sub of MAT_SUBSTRINGS) {
    if (n.includes(sub)) return true;
  }
  return false;
}

function buildShadowGlobalChatPayload(author, text) {
  const uid = author?.id != null ? String(author.id) : '';
  return {
    id: `shadow-${randomUUID()}`,
    userId: uid,
    username: author?.username || '—',
    level: author?.level ?? 1,
    body: text,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  isGlobalChatShadowBlocked,
  buildShadowGlobalChatPayload,
};
