const provablyFairService = require('../../services/provablyFairService');
const { logger } = require('../../utils/logger');

async function getProvablyFairStatus(req, res) {
  try {
    const status = await provablyFairService.getPublicStatus(req.user.id);
    return res.json({ success: true, data: status });
  } catch (error) {
    logger.error('getProvablyFairStatus error:', error);
    return res.status(500).json({ success: false, message: 'Ошибка получения статуса provably fair' });
  }
}

async function setProvablyFairClientSeed(req, res) {
  try {
    if (!provablyFairService.isEnabled()) {
      return res.status(400).json({ success: false, message: 'Provably fair отключён на сервере' });
    }

    const clientSeed = req.body?.client_seed ?? req.body?.clientSeed;
    const result = await provablyFairService.setClientSeed(req.user.id, clientSeed);
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error.message === 'INVALID_CLIENT_SEED') {
      return res.status(400).json({
        success: false,
        message: 'Недопустимый client seed (8–64 символа: a-z, A-Z, 0-9, _, -)'
      });
    }
    logger.error('setProvablyFairClientSeed error:', error);
    return res.status(500).json({ success: false, message: 'Не удалось обновить client seed' });
  }
}

async function rotateProvablyFairSeed(req, res) {
  try {
    if (!provablyFairService.isEnabled()) {
      return res.status(400).json({ success: false, message: 'Provably fair отключён на сервере' });
    }

    const result = await provablyFairService.rotateServerSeed(req.user.id);
    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error('rotateProvablyFairSeed error:', error);
    return res.status(500).json({ success: false, message: 'Не удалось сменить server seed' });
  }
}

async function verifyProvablyFairCase(req, res) {
  try {
    const caseId = req.params.caseId;
    const result = await provablyFairService.verifyCaseOpen(caseId, req.user.id);

    if (result.reason === 'case_not_found') {
      return res.status(404).json({ success: false, message: 'Открытие не найдено' });
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error('verifyProvablyFairCase error:', error);
    return res.status(500).json({ success: false, message: 'Ошибка верификации' });
  }
}

module.exports = {
  getProvablyFairStatus,
  setProvablyFairClientSeed,
  rotateProvablyFairSeed,
  verifyProvablyFairCase
};
