const db = require('../../models');
const { FREE_CASE_TEMPLATE_ID, checkFreeCaseAvailability } = require('../../utils/freeCaseHelper');

/**
 * Получает статус доступности бесплатного кейса для новых пользователей
 */
async function getFreeCaseStatus(req, res) {
  try {
    const userId = req.user.id;

    const user = await db.User.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    const availability = checkFreeCaseAvailability(user);

    return res.json({
      success: true,
      data: {
        canClaim: availability.canClaim,
        reason: availability.reason,
        nextAvailableTime: availability.nextAvailableTime,
        claimCount: user.free_case_claim_count,
        maxClaims: 2,
        firstClaimDate: user.free_case_first_claim_date,
        lastClaimDate: user.free_case_last_claim_date,
        caseTemplateId: FREE_CASE_TEMPLATE_ID
      }
    });
  } catch (error) {
    console.error('Ошибка при получении статуса бесплатного кейса:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка сервера при получении статуса бесплатного кейса'
    });
  }
}

module.exports = getFreeCaseStatus;
