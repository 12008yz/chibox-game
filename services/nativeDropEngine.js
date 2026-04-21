const path = require('path');
const { logger } = require('../utils/logger');

let nativeModule = null;
let nativeLoaded = false;

function isNativeEnabled() {
  return process.env.USE_NATIVE_DROP_ENGINE === 'true';
}

function tryLoadNativeModule() {
  if (nativeLoaded) {
    return nativeModule;
  }

  nativeLoaded = true;
  if (!isNativeEnabled()) {
    return null;
  }

  try {
    nativeModule = require(path.join(__dirname, '..', 'build', 'Release', 'drop_engine.node'));
  } catch (error) {
    logger.warn(`Native drop engine unavailable, JS fallback is used: ${error.message}`);
    nativeModule = null;
  }

  return nativeModule;
}

function pickWeightedIndex(weights, randomValue) {
  const mod = tryLoadNativeModule();
  if (!mod || typeof mod.pickWeightedIndex !== 'function') {
    return -1;
  }

  try {
    return mod.pickWeightedIndex(weights, randomValue);
  } catch (error) {
    logger.warn(`Native drop engine failed, JS fallback is used: ${error.message}`);
    return -1;
  }
}

module.exports = {
  pickWeightedIndex,
  isNativeEnabled
};
