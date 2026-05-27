/**
 * Smoke-тест provably fair (без БД).
 * node scripts/test-provably-fair.js
 */
const {
  generateServerSeed,
  hashServerSeed,
  computeRollUnit,
  verifyServerSeedHash
} = require('../utils/provablyFair');

const serverSeed = generateServerSeed();
const hash = hashServerSeed(serverSeed);
const clientSeed = 'my_client_seed_1';

if (!verifyServerSeedHash(serverSeed, hash)) {
  throw new Error('hash verify failed');
}

const a = computeRollUnit(serverSeed, clientSeed, 0);
const b = computeRollUnit(serverSeed, clientSeed, 0);
const c = computeRollUnit(serverSeed, clientSeed, 1);

if (a.rollUnit !== b.rollUnit || a.rollHex !== b.rollHex) {
  throw new Error('determinism failed');
}
if (a.rollUnit === c.rollUnit) {
  throw new Error('different nonce should differ');
}
if (a.rollUnit < 0 || a.rollUnit >= 1) {
  throw new Error('roll out of range');
}

console.log('OK', { rollHex: a.rollHex, rollUnit: a.rollUnit.toFixed(8) });
