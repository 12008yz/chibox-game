const db = require('../models');
const { Op } = require('sequelize');
const { logger } = require('../utils/logger');

const {
  generateServerSeed,
  generateClientSeed,
  hashServerSeed,
  computeRollUnit,
  verifyServerSeedHash,
  sanitizeClientSeed
} = require('../utils/provablyFair');
const { determineCaseType } = require('../utils/dropWeightCalculator');
const { selectItemForCaseOpen } = require('../utils/caseOpenItemSelection');
function isEnabled() {
  return process.env.PROVABLY_FAIR_ENABLED === 'true' || process.env.PROVABLY_FAIR_ENABLED === '1';
}

function getClientSeedLimits() {
  return {
    min: parseInt(process.env.PROVABLY_FAIR_MIN_CLIENT_SEED_LENGTH, 10) || 8,
    max: parseInt(process.env.PROVABLY_FAIR_MAX_CLIENT_SEED_LENGTH, 10) || 64
  };
}

async function ensureUserFairSeed(userId, transaction) {
  const findOptions = transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {};
  let row = await db.UserFairSeed.findByPk(userId, findOptions);
  if (row) return row;

  const serverSeed = generateServerSeed();
  row = await db.UserFairSeed.create(
    {
      user_id: userId,
      server_seed: serverSeed,
      server_seed_hash: hashServerSeed(serverSeed),
      client_seed: generateClientSeed(),
      next_nonce: 0
    },
    { transaction }
  );
  return row;
}

async function getPublicStatus(userId) {
  if (!isEnabled()) {
    return { enabled: false };
  }

  const row = await ensureUserFairSeed(userId);
  const reveals = await db.UserFairSeedReveal.findAll({
    where: { user_id: userId },
    order: [['revealed_at', 'DESC']],
    limit: 10,
    attributes: ['id', 'server_seed', 'server_seed_hash', 'nonce_from', 'nonce_to', 'revealed_at']
  });

  return {
    enabled: true,
    server_seed_hash: row.server_seed_hash,
    client_seed: row.client_seed,
    next_nonce: Number(row.next_nonce),
    recent_reveals: reveals.map((r) => ({
      id: r.id,
      server_seed: r.server_seed,
      server_seed_hash: r.server_seed_hash,
      nonce_from: Number(r.nonce_from),
      nonce_to: Number(r.nonce_to),
      revealed_at: r.revealed_at
    }))
  };
}

async function setClientSeed(userId, rawClientSeed) {
  if (!isEnabled()) {
    throw new Error('PROVABLY_FAIR_DISABLED');
  }

  const limits = getClientSeedLimits();
  const clientSeed = sanitizeClientSeed(rawClientSeed, limits.min, limits.max);
  if (!clientSeed) {
    throw new Error('INVALID_CLIENT_SEED');
  }

  const row = await ensureUserFairSeed(userId);
  row.client_seed = clientSeed;
  await row.save();
  return { client_seed: row.client_seed, next_nonce: Number(row.next_nonce) };
}

async function rotateServerSeed(userId) {
  if (!isEnabled()) {
    throw new Error('PROVABLY_FAIR_DISABLED');
  }

  const t = await db.sequelize.transaction();
  try {
    const row = await ensureUserFairSeed(userId, t);
    const nonceTo = Number(row.next_nonce);
    const lastReveal = await db.UserFairSeedReveal.findOne({
      where: { user_id: userId },
      order: [['revealed_at', 'DESC']],
      transaction: t
    });
    const nonceFrom = lastReveal ? Number(lastReveal.nonce_to) : 0;
    const revealedSeed = row.server_seed;
    const revealedHash = row.server_seed_hash;

    await db.UserFairSeedReveal.create(
      {
        user_id: userId,
        server_seed: revealedSeed,
        server_seed_hash: revealedHash,
        nonce_from: nonceFrom,
        nonce_to: nonceTo,
        revealed_at: new Date()
      },
      { transaction: t }
    );

    const newServerSeed = generateServerSeed();
    row.server_seed = newServerSeed;
    row.server_seed_hash = hashServerSeed(newServerSeed);
    await row.save({ transaction: t });

    await t.commit();

    return {
      revealed_server_seed: revealedSeed,
      revealed_server_seed_hash: revealedHash,
      nonce_from: nonceFrom,
      nonce_to: nonceTo,
      new_server_seed_hash: row.server_seed_hash,
      client_seed: row.client_seed,
      next_nonce: Number(row.next_nonce)
    };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Читает roll для текущего nonce без инкремента (до успешного commit).
 */
async function peekRollForOpen(userId, transaction) {
  if (!isEnabled()) return null;

  const row = await ensureUserFairSeed(userId, transaction);
  const nonce = Number(row.next_nonce);
  const { rollUnit, rollHex } = computeRollUnit(row.server_seed, row.client_seed, nonce);

  return {
    nonce,
    rollUnit,
    rollHex,
    clientSeed: row.client_seed,
    serverSeedHash: row.server_seed_hash
  };
}

/**
 * Фиксирует использованный nonce после успешного открытия (перед commit).
 */
async function commitRollForOpen(userId, transaction) {
  if (!isEnabled()) return;

  const row = await ensureUserFairSeed(userId, transaction);
  row.next_nonce = Number(row.next_nonce) + 1;
  await row.save({ transaction });
}

async function findRevealedServerSeed(userId, nonce, serverSeedHash) {
  const reveals = await db.UserFairSeedReveal.findAll({
    where: { user_id: userId, server_seed_hash: serverSeedHash },
    order: [['revealed_at', 'DESC']]
  });

  for (const reveal of reveals) {
    const from = Number(reveal.nonce_from);
    const to = Number(reveal.nonce_to);
    if (nonce >= from && nonce < to) {
      return reveal.server_seed;
    }
  }

  const active = await db.UserFairSeed.findByPk(userId);
  if (active && active.server_seed_hash === serverSeedHash) {
    const lastReveal = await db.UserFairSeedReveal.findOne({
      where: { user_id: userId },
      order: [['revealed_at', 'DESC']]
    });
    const minNonce = lastReveal ? Number(lastReveal.nonce_to) : 0;
    const maxNonce = Number(active.next_nonce);
    if (nonce >= minNonce && nonce < maxNonce) {
      return active.server_seed;
    }
  }

  return null;
}

/** Replay выбора предмета — та же функция, что при реальном openCase. */
function replayItemSelection({
  items,
  template,
  isPaid,
  effectiveDropBonus,
  userSubscriptionTier,
  droppedItemIds,
  templateId,
  rollUnit
}) {
  const caseType = determineCaseType(template, isPaid);
  return selectItemForCaseOpen({
    items,
    templateName: template?.name,
    templateId,
    isPaid,
    effectiveDropBonus,
    userSubscriptionTier,
    droppedItemIds,
    caseType,
    rollUnit
  });
}

async function verifyCaseOpen(caseId, userId) {
  if (!isEnabled()) {
    return { verified: false, reason: 'disabled' };
  }

  const caseRow = await db.Case.findByPk(caseId, {
    include: [
      { model: db.Item, as: 'result_item' },
      { model: db.CaseTemplate, as: 'template', include: [{ model: db.Item, as: 'items' }] }
    ]
  });

  if (!caseRow || !caseRow.is_opened) {
    return { verified: false, reason: 'case_not_found' };
  }

  if (userId && caseRow.user_id !== userId) {
    return { verified: false, reason: 'forbidden' };
  }

  if (caseRow.pf_nonce === null || caseRow.pf_nonce === undefined) {
    return { verified: false, reason: 'not_provably_fair_open' };
  }

  const nonce = Number(caseRow.pf_nonce);
  const serverSeed = await findRevealedServerSeed(
    caseRow.user_id,
    nonce,
    caseRow.pf_server_seed_hash
  );

  if (!serverSeed) {
    return {
      verified: false,
      reason: 'server_seed_not_revealed',
      message: 'Серверный seed ещё не раскрыт. Смените seed в настройках provably fair.',
      server_seed_hash: caseRow.pf_server_seed_hash,
      client_seed: caseRow.pf_client_seed,
      nonce
    };
  }

  if (!verifyServerSeedHash(serverSeed, caseRow.pf_server_seed_hash)) {
    return { verified: false, reason: 'hash_mismatch' };
  }

  const { rollUnit, rollHex } = computeRollUnit(serverSeed, caseRow.pf_client_seed, nonce);
  if (rollHex !== caseRow.pf_roll_hex) {
    return {
      verified: false,
      reason: 'roll_mismatch',
      expected_roll_hex: rollHex,
      stored_roll_hex: caseRow.pf_roll_hex
    };
  }

  const template = caseRow.template;
  const items = template?.items || [];
  const isPaid = caseRow.is_paid;
  const effectiveDropBonus = parseFloat(caseRow.drop_bonus_applied) || 0;

  const droppedBefore = await db.CaseItemDrop.findAll({
    where: {
      user_id: caseRow.user_id,
      case_template_id: caseRow.template_id,
      dropped_at: { [Op.lt]: caseRow.opened_date }
    },
    attributes: ['item_id']
  });
  const droppedItemIds = droppedBefore.map((d) => d.item_id);

  const replayParams = {
    items,
    template,
    isPaid,
    effectiveDropBonus,
    userSubscriptionTier: caseRow.subscription_tier || 0,
    droppedItemIds,
    templateId: caseRow.template_id,
    rollUnit
  };

  const expectedItem = replayItemSelection(replayParams);

  const itemMatches = expectedItem && caseRow.result_item_id === expectedItem.id;

  return {
    verified: itemMatches,
    reason: itemMatches ? 'ok' : 'item_mismatch',
    roll_hex: rollHex,
    roll_unit: rollUnit,
    nonce,
    server_seed: serverSeed,
    server_seed_hash: caseRow.pf_server_seed_hash,
    client_seed: caseRow.pf_client_seed,
    expected_item_id: expectedItem?.id || null,
    actual_item_id: caseRow.result_item_id
  };
}

function attachPfFieldsToCaseRecord(caseInstance, pfRoll) {
  if (!pfRoll) return;
  caseInstance.pf_nonce = pfRoll.nonce;
  caseInstance.pf_roll_hex = pfRoll.rollHex;
  caseInstance.pf_client_seed = pfRoll.clientSeed;
  caseInstance.pf_server_seed_hash = pfRoll.serverSeedHash;
}

function buildOpenPfPayload(pfRoll) {
  if (!pfRoll) return null;
  return {
    nonce: pfRoll.nonce,
    roll_hex: pfRoll.rollHex,
    client_seed: pfRoll.clientSeed,
    server_seed_hash: pfRoll.serverSeedHash
  };
}

module.exports = {
  isEnabled,
  getPublicStatus,
  setClientSeed,
  rotateServerSeed,
  peekRollForOpen,
  commitRollForOpen,
  verifyCaseOpen,
  attachPfFieldsToCaseRecord,
  buildOpenPfPayload,
  findRevealedServerSeed
};
