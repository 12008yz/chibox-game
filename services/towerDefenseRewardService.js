const db = require('../models');
const { Op } = require('sequelize');
const { logger } = require('../utils/logger');

/**
 * Выбирает предмет-награду, который дороже ставки
 * @param {number} betItemPrice - Цена предмета ставки
 * @returns {Object|null} - Предмет-награда или null если не найден
 */
async function selectRewardItem(betItemPrice) {
  try {
    // Ищем предметы, которые дороже ставки минимум на 10%
    const minPrice = parseFloat(betItemPrice) * 1.1;
    const maxPrice = parseFloat(betItemPrice) * 3.0; // Максимум в 3 раза дороже

    // Получаем доступные предметы (в наличии и доступные для выдачи)
    const rewardItems = await db.Item.findAll({
      where: {
        price: {
          [Op.gte]: minPrice,
          [Op.lte]: maxPrice
        },
        is_available: true,
        in_stock: true
      },
      order: [
        // Сначала предметы ближе к минимальной цене (чтобы награда была справедливой)
        [db.Sequelize.literal(`ABS(price - ${minPrice})`), 'ASC']
      ],
      limit: 50 // Берем топ 50 для случайного выбора
    });

    if (rewardItems.length === 0) {
      logger.warn(`[TOWER_DEFENSE_REWARD] Не найдено предметов для награды. Ставка: ${betItemPrice}, мин: ${minPrice}`);
      
      // Если не нашли в диапазоне, ищем просто дороже
      const fallbackItems = await db.Item.findAll({
        where: {
          price: {
            [Op.gt]: betItemPrice
          },
          is_available: true,
          in_stock: true
        },
        order: [['price', 'ASC']],
        limit: 10
      });

      if (fallbackItems.length === 0) {
        logger.error(`[TOWER_DEFENSE_REWARD] Не найдено предметов дороже ставки ${betItemPrice}`);
        return null;
      }

      // Выбираем случайный из первых 5 (чтобы награда была не слишком дорогой)
      const randomIndex = Math.floor(Math.random() * Math.min(5, fallbackItems.length));
      return fallbackItems[randomIndex];
    }

    // Выбираем случайный предмет из найденных
    // Предпочтение отдаем предметам в диапазоне 1.1x - 2x от ставки (70% шанс)
    const preferredItems = rewardItems.filter(item => {
      const price = parseFloat(item.price);
      return price >= minPrice && price <= parseFloat(betItemPrice) * 2.0;
    });

    let selectedItem;
    if (preferredItems.length > 0 && Math.random() < 0.7) {
      // 70% шанс выбрать из предпочтительных
      const randomIndex = Math.floor(Math.random() * preferredItems.length);
      selectedItem = preferredItems[randomIndex];
    } else {
      // 30% шанс выбрать из всех доступных
      const randomIndex = Math.floor(Math.random() * rewardItems.length);
      selectedItem = rewardItems[randomIndex];
    }

    logger.info(`[TOWER_DEFENSE_REWARD] Выбран предмет-награда: ${selectedItem.name}, цена: ${selectedItem.price}, ставка: ${betItemPrice}`);
    return selectedItem;

  } catch (error) {
    logger.error('[TOWER_DEFENSE_REWARD] Ошибка выбора предмета-награды:', error);
    return null;
  }
}

module.exports = {
  selectRewardItem
};

