const { getUserBonusInfo } = require('../../utils/userBonusCalculator');
const { logger } = require('../../utils/logger');

/**
 * Получает информацию о всех бонусах пользователя
 */
async function getUserBonusInfoController(req, res) {
    try {
        const userId = req.user.id;

        // Получаем полную информацию о бонусах
        const bonusInfo = await getUserBonusInfo(userId);

        // Добавляем дополнительную информацию для фронтенда
        const response = {
            ...bonusInfo,
            explanation: {
                achievements: 'Бонус получен за выполнение достижений',
                level: `Бонус от уровня: +0.1% за каждый уровень свыше 1-го (максимум +10%)`,
                subscription: 'Бонус зависит от уровня подписки: Статус (+2%), Статус+ (+5%), Статус++ (+10%)',
                total: 'Общий бонус влияет на шанс получения дорогих предметов при открытии кейсов'
            },
            nextLevelBonus: bonusInfo.level < 100 ?
                ((bonusInfo.level * 0.1).toFixed(1)) :
                'Максимальный бонус достигнут',
            possibleImprovements: []
        };

        // Добавляем рекомендации по улучшению бонусов
        if (bonusInfo.subscriptionTier === 0) {
            response.possibleImprovements.push({
                type: 'subscription',
                description: 'Купите подписку для получения дополнительного бонуса',
                potentialBonus: '+2% до +10%'
            });
        }

        if (bonusInfo.level < 100) {
            const nextLevelBonus = ((bonusInfo.level) * 0.1).toFixed(1);
            response.possibleImprovements.push({
                type: 'level',
                description: `Повысьте уровень до ${bonusInfo.level + 1} для увеличения бонуса`,
                potentialBonus: `+${nextLevelBonus}%`
            });
        }

        // Информация о достижениях (можно расширить)
        response.possibleImprovements.push({
            type: 'achievements',
            description: 'Выполняйте достижения для получения дополнительных бонусов',
            potentialBonus: 'Зависит от достижения'
        });

        logger.info(`Пользователь ${userId} запросил информацию о бонусах. Общий бонус: +${bonusInfo.totalBonus.toFixed(1)}%`);

        res.json(response);

    } catch (error) {
        logger.error('Ошибка при получении информации о бонусах:', error);
        res.status(500).json({
            message: 'Внутренняя ошибка сервера',
            error: error.message
        });
    }
}

module.exports = {
    getUserBonusInfoController
};
