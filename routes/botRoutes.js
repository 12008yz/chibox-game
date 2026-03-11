/**
 * Прокси к Python-боту (сервис в python-ml).
 * Запросы с фронта идут сюда; Node пересылает их на BOT_SERVICE_URL (например http://127.0.0.1:8000).
 */
const express = require('express');
const axios = require('axios');
const { logger } = require('../utils/logger');

const router = express.Router();

const BOT_SERVICE_URL = (process.env.BOT_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const BOT_TIMEOUT_MS = 15000;

/**
 * POST /api/v1/bot/chat
 * Тело: { message: string }
 * Проксируем в Python: POST {BOT_SERVICE_URL}/api/chat
 */
router.post('/chat', async (req, res) => {
  const message = req.body?.message;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Требуется поле message (непустая строка).' });
  }

  try {
    const response = await axios.post(
      `${BOT_SERVICE_URL}/api/chat`,
      { message: message.trim() },
      {
        timeout: BOT_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
      }
    );

    if (response.status !== 200) {
      logger.warn('Bot service error', { status: response.status, data: response.data });
      return res.status(502).json({
        success: false,
        message: 'Сервис бота временно недоступен. Попробуйте позже.',
      });
    }

    const reply = response.data?.reply;
    if (typeof reply !== 'string') {
      return res.status(502).json({
        success: false,
        message: 'Некорректный ответ от бота.',
      });
    }

    return res.json({ success: true, reply });
  } catch (err) {
    logger.error('Bot proxy error', { message: err.message });
    return res.status(502).json({
      success: false,
      message: 'Не удалось связаться с ботом. Попробуйте позже.',
    });
  }
});

module.exports = router;
