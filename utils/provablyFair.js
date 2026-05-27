const crypto = require('crypto');

const ROLL_HEX_LENGTH = 13;
const ROLL_DIVISOR = Math.pow(16, ROLL_HEX_LENGTH);

function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

function generateClientSeed() {
  return crypto.randomBytes(16).toString('hex');
}

function hashServerSeed(serverSeed) {
  return crypto.createHash('sha256').update(String(serverSeed)).digest('hex');
}

/**
 * Детерминированный roll ∈ [0, 1) из server/client seed и nonce.
 * Формула совместима с типичными кейс-сайтами (HMAC-SHA256, первые 13 hex).
 */
function computeRollUnit(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', String(serverSeed));
  hmac.update(`${String(clientSeed)}:${String(nonce)}`);
  const hash = hmac.digest('hex');
  const slice = hash.slice(0, ROLL_HEX_LENGTH);
  const int = parseInt(slice, 16);
  return {
    rollUnit: int / ROLL_DIVISOR,
    rollHex: slice
  };
}

function verifyServerSeedHash(serverSeed, expectedHash) {
  if (!serverSeed || !expectedHash) return false;
  return hashServerSeed(serverSeed) === expectedHash;
}

function sanitizeClientSeed(raw, minLen = 8, maxLen = 64) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < minLen || trimmed.length > maxLen) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

module.exports = {
  generateServerSeed,
  generateClientSeed,
  hashServerSeed,
  computeRollUnit,
  verifyServerSeedHash,
  sanitizeClientSeed,
  ROLL_HEX_LENGTH
};
