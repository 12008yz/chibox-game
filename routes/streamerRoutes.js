const express = require('express');
const db = require('../models');
const auth = require('../middleware/auth');
const requireStreamer = require('../middleware/requireStreamer');
const { Op } = require('sequelize');
const crypto = require('crypto');

const router = express.Router();

const STREAMER_SUBDOMAIN = process.env.STREAMER_SUBDOMAIN || 'streamer.chibox-game.ru';
const STREAMER_BASE_URL = process.env.STREAMER_BASE_URL || `https://${STREAMER_SUBDOMAIN}`;

/**
 * Все маршруты: сначала авторизация, затем проверка что пользователь — стример.
 */
router.use(auth);
router.use(requireStreamer);

/**
 * GET /api/v1/streamer/me
 * Текущий стример: баланс, настройки, пользователь.
 */
router.get('/me', async (req, res) => {
  const streamer = req.streamer;
  const user = streamer.user;
  res.json({
    success: true,
    data: {
      id: streamer.id,
      balance: parseFloat(streamer.balance) || 0,
      percent_from_deposit: parseFloat(streamer.percent_from_deposit) || 0,
      fixed_registration: parseFloat(streamer.fixed_registration) || 0,
      fixed_first_deposit: parseFloat(streamer.fixed_first_deposit) || 0,
      is_active: streamer.is_active,
      user: user ? {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url || user.steam_avatar_url
      } : null
    }
  });
});

/**
 * GET /api/v1/streamer/links
 * Список реферальных ссылок с счётчиками.
 */
router.get('/links', async (req, res) => {
  const links = await db.ReferralLink.findAll({
    where: { streamer_id: req.streamer.id, deleted_at: null },
    order: [['created_at', 'DESC']],
    attributes: ['id', 'code', 'label', 'clicks_count', 'registrations_count', 'first_deposits_count', 'created_at']
  });
  const baseUrl = STREAMER_BASE_URL;
  const list = links.map((l) => ({
    id: l.id,
    code: l.code,
    label: l.label,
    url: `${baseUrl}/r/${l.code}`,
    clicks_count: l.clicks_count,
    registrations_count: l.registrations_count,
    first_deposits_count: l.first_deposits_count,
    created_at: l.created_at
  }));
  res.json({ success: true, data: list });
});

/**
 * POST /api/v1/streamer/links
 * Создать новую реферальную ссылку. code опционально (сгенерируем), label опционально.
 */
router.post('/links', async (req, res) => {
  let { code, label } = req.body || {};
  if (code && typeof code === 'string') {
    code = code.trim().replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase() || null;
  } else {
    code = null;
  }
  if (!code) {
    code = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  const existing = await db.ReferralLink.findOne({ where: { code } });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Такой код ссылки уже занят' });
  }
  const link = await db.ReferralLink.create({
    streamer_id: req.streamer.id,
    code,
    label: label && typeof label === 'string' ? label.trim().slice(0, 128) : null
  });
  res.status(201).json({
    success: true,
    data: {
      id: link.id,
      code: link.code,
      label: link.label,
      url: `${STREAMER_BASE_URL}/r/${link.code}`,
      clicks_count: 0,
      registrations_count: 0,
      first_deposits_count: 0,
      created_at: link.created_at
    }
  });
});

/**
 * DELETE /api/v1/streamer/links/:id
 * Удалить реферальную ссылку (только свою).
 */
router.delete('/links/:id', async (req, res) => {
  const linkId = req.params.id;
  const link = await db.ReferralLink.findOne({
    where: { id: linkId, streamer_id: req.streamer.id, deleted_at: null }
  });
  if (!link) {
    return res.status(404).json({ success: false, message: 'Ссылка не найдена' });
  }
  await link.update({ deleted_at: new Date() });
  return res.json({ success: true });
});

/**
 * GET /api/v1/streamer/stats
 * Сводная статистика: переходы, регистрации, первые депозиты, сумма начислений.
 */
router.get('/stats', async (req, res) => {
  const streamerId = req.streamer.id;
  const links = await db.ReferralLink.findAll({
    where: { streamer_id: streamerId },
    attributes: ['clicks_count', 'registrations_count', 'first_deposits_count']
  });
  const totalClicks = links.reduce((s, l) => s + (l.clicks_count || 0), 0);
  const totalRegistrations = links.reduce((s, l) => s + (l.registrations_count || 0), 0);
  const totalFirstDeposits = links.reduce((s, l) => s + (l.first_deposits_count || 0), 0);
  const totalEarned = await db.StreamerEarning.sum('amount', { where: { streamer_id: streamerId } });
  res.json({
    success: true,
    data: {
      clicks_count: totalClicks,
      registrations_count: totalRegistrations,
      first_deposits_count: totalFirstDeposits,
      total_earned: parseFloat(totalEarned) || 0,
      balance: parseFloat(req.streamer.balance) || 0
    }
  });
});

/**
 * GET /api/v1/streamer/earnings
 * История начислений (пагинация).
 */
router.get('/earnings', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const list = await db.StreamerEarning.findAll({
    where: { streamer_id: req.streamer.id },
    order: [['created_at', 'DESC']],
    limit,
    offset,
    attributes: ['id', 'type', 'amount', 'referral_link_id', 'referred_user_id', 'payment_id', 'created_at']
  });
  res.json({ success: true, data: list });
});

/**
 * GET /api/v1/streamer/payouts
 * История выплат.
 */
router.get('/payouts', async (req, res) => {
  const list = await db.StreamerPayout.findAll({
    where: { streamer_id: req.streamer.id },
    order: [['created_at', 'DESC']],
    attributes: ['id', 'amount', 'method', 'status', 'details', 'processed_at', 'created_at']
  });
  res.json({ success: true, data: list });
});

/**
 * POST /api/v1/streamer/payouts
 * Заявка на вывод. method: balance | card | steam | other, amount, details (опционально).
 */
router.post('/payouts', async (req, res) => {
  const { method, amount, details } = req.body || {};
  const allowedMethods = ['balance', 'card', 'steam', 'other'];
  if (!allowedMethods.includes(method)) {
    return res.status(400).json({ success: false, message: 'Недопустимый способ вывода' });
  }
  const numAmount = parseFloat(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Укажите корректную сумму' });
  }
  const streamer = req.streamer;
  const balance = parseFloat(streamer.balance) || 0;
  if (numAmount > balance) {
    return res.status(400).json({ success: false, message: 'Недостаточно средств на балансе стримера' });
  }
  const payout = await db.sequelize.transaction(async (t) => {
    await streamer.update({ balance: balance - numAmount }, { transaction: t });
    return db.StreamerPayout.create(
      {
        streamer_id: streamer.id,
        amount: numAmount,
        method,
        status: 'pending',
        details: details && typeof details === 'object' ? details : null
      },
      { transaction: t }
    );
  });
  res.status(201).json({
    success: true,
    data: {
      id: payout.id,
      amount: payout.amount,
      method: payout.method,
      status: payout.status,
      created_at: payout.created_at
    }
  });
});

/**
 * GET /api/v1/streamer/materials
 * Баннеры и тексты (глобальные + свои).
 */
router.get('/materials', async (req, res) => {
  const materials = await db.StreamerMaterial.findAll({
    where: {
      [Op.or]: [{ streamer_id: null }, { streamer_id: req.streamer.id }]
    },
    order: [
      ['streamer_id', 'ASC'],
      ['sort_order', 'ASC'],
      ['created_at', 'ASC']
    ],
    attributes: ['id', 'type', 'title', 'url', 'content', 'sort_order']
  });
  res.json({ success: true, data: materials });
});

module.exports = router;
