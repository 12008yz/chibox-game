'use strict';

/**
 * Общий чат: типичные спам-приглашения («переходи по ссылке», «заработок», «заходи в тг»).
 * Держите в синхроне с frontend/src/utils/globalChatSpamInvite.ts
 */

function normalizeSpamText(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Подстроки в нормализованном тексте (ловят склонения/частичные совпадения) */
const SPAM_SUBSTRINGS_RU = [
  'переходи по',
  'перейди по',
  'переходите по',
  'жми по',
  'жмите по',
  'кликни по',
  'кликните по',
  'кликай по',
  'кликайте по',
  'жми сюда',
  'кликай сюда',
  'кликни сюда',
  'заходи сюда',
  'заходите сюда',
  'залетай сюда',
  'заходи в тг',
  'заходите в тг',
  'заходи в телегу',
  'заходите в телегу',
  'залетай на канал',
  'залетайте на канал',
  'залетай на телегу',
  'залетайте на телегу',
  'залетай в телегу',
  'залетайте в телегу',
  'заходи в лс',
  'заходите в лс',
  'пиши в лс',
  'пишите в лс',
  'пиши в личку',
  'пишите в личку',
  'пиши в тг',
  'пишите в тг',
  'напиши в тг',
  'напишите в тг',
  'напиши в лс',
  'напиши мне в тг',
  'напиши мне в лс',
  'напишите мне в тг',
  'напишите мне в лс',
  'переходи в тг',
  'переходите в тг',
  'в личку',
  'в личные сообщ',
  'добавляйся в тг',
  'добавляйтесь в тг',
  'подпишись на канал',
  'подписывайся на тг',
  'подписывайся на канал',
  'скинул в лс',
  'скинула в лс',
  'хочешь заработать ден',
  'хотите заработать ден',
  'хочу заработать ден',
  'заработай ден',
  'заработайте ден',
  'заработок без влож',
  'заработок в инт',
  'заработать ден',
  'заработать в инт',
  'легкие деньги',
  'легких денег',
  'быстрые деньги',
  'быстрых денег',
  'пассивный доход',
  'хочешь денег',
  'хотите денег',
  'без вложений заработ',
  'удалённая занятость',
  'удаленная занятость',
  'удалённый заработ',
  'удаленный заработ',
];

const SPAM_SUBSTRINGS_EN = [
  'click here',
  'go here',
  'join telegram',
  'join our tg',
  'join discord',
  'dm me',
  'text me',
  'message me on',
  'add me on',
  'want money',
  'want to earn',
  'easy money',
  'quick money',
  'fast money',
  'passive income',
  'earn money',
  'make money',
  'work from home',
  'side hustle',
];

/** Регулярки: редкие опечатки / лат. обходы (без общего «ссылк», чтобы не резать слово «ссылка» в обычном смысле) */
const SPAM_REGEX = [
  /ссы+ыл/i,
  /ссыллк/i,
  /po\s*ssylk/i,
  /perexod/i,
  /\btelega\b/i,
];

function globalChatContainsSpamInvite(text) {
  const n = normalizeSpamText(text);
  if (!n) return false;
  for (const s of SPAM_SUBSTRINGS_RU) {
    if (n.includes(s)) return true;
  }
  for (const s of SPAM_SUBSTRINGS_EN) {
    if (n.includes(s)) return true;
  }
  for (const re of SPAM_REGEX) {
    if (re.test(n)) return true;
  }
  return false;
}

module.exports = { globalChatContainsSpamInvite };
