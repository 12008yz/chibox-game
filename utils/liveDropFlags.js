/**
 * Единые флаги для Live Drop (лента + сокет).
 * Согласовано с визуальными tier на фронте.
 */

const RARE_RARITIES = new Set([
  'restricted',
  'classified',
  'covert',
  'contraband',
  'rare',
  'legendary',
  'epic',
  'mythical'
]);

function parseEnvFloat(name, defaultValue) {
  const parsed = parseFloat(process.env[name]);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getHighlightMinPrice() {
  return parseEnvFloat('LIVE_DROP_HIGHLIGHT_MIN_PRICE', 500);
}

function getRareMinPrice() {
  return parseEnvFloat('LIVE_DROP_RARE_MIN_PRICE', 100);
}

/**
 * @param {{ price?: string|number, rarity?: string }} item
 * @param {{ price?: string|number } | null} caseTemplate
 */
function computeLiveDropFlags(item, caseTemplate = null) {
  const itemPrice = parseFloat(item?.price) || 0;
  const casePrice = parseFloat(caseTemplate?.price) || 0;
  const rarity = (item?.rarity || '').toLowerCase();

  const isRareByRarity = RARE_RARITIES.has(rarity);
  const isRareByRatio = casePrice > 0 && itemPrice >= casePrice * 1.15;
  const isRareByPrice = itemPrice >= getRareMinPrice();

  const is_rare_item = isRareByRarity || isRareByRatio || (isRareByPrice && casePrice <= 0);

  let is_highlighted = false;
  if (casePrice > 0) {
    is_highlighted = itemPrice >= Math.max(getHighlightMinPrice(), casePrice * 1.5);
  } else {
    is_highlighted = itemPrice >= getHighlightMinPrice();
  }

  return { is_rare_item, is_highlighted, itemPrice };
}

module.exports = {
  computeLiveDropFlags,
  RARE_RARITIES
};
