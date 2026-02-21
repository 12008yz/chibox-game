const express = require('express');
const { trackClick, getReferralInfoByCode } = require('../services/referralService');

const router = express.Router();

/**
 * GET /api/v1/referral/click?code=XXX
 * Учёт перехода по реферальной ссылке (без авторизации).
 */
router.get('/click', async (req, res) => {
  const code = req.query.code;
  const result = await trackClick(code);
  if (!result.success) {
    return res.status(404).json({ success: false, error: result.error || 'not_found' });
  }
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
