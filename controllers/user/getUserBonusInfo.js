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
                achievements: 'Бонус получен за выполнение достижений (максимум +5%)',
                level: `Бонус от уровня: +0.02% за каждый уровень (максимум +2%)`,
                subscription: 'Бонус зависит от уровня подписки: Статус (+3%), Статус+ (+5%), Статус++ (+8% + защита от дубликатов)',
                total: 'Общий бонус влияет на шанс получения дорогих предметов при открытии кейсов (максимум +15%)'
            },
            nextLevelBonus: bonusInfo.level < 100 ?
                (((bonusInfo.level + 1) * 0.02).toFixed(2)) :
                'Максимальный бонус достигнут',
            possibleImprovements: []
        };

        // Добавляем рекомендации по улучшению бонусов
        if (bonusInfo.subscriptionTier === 0) {
            response.possibleImprovements.push({
                type: 'subscription',
                description: 'Купите подписку для получения дополнительного бонуса',
                potentialBonus: '+3% до +8% + защита от дубликатов на макс уровне'
            });
        }

        if (bonusInfo.level < 100) {
            const nextLevelBonus = ((bonusInfo.level + 1) * 0.02).toFixed(2);
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
