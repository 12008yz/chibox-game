const { CaseTemplate, Item } = require('../../models');
const { logger } = require('../../utils/logger');

const getCaseTemplateItems = async (req, res) => {
  try {
    const { caseTemplateId } = req.params;

    // Проверяем валидность UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(caseTemplateId)) {
      return res.status(400).json({
        success: false,
        message: 'Неверный формат ID кейс-темплейта'
      });
    }

    // Получаем кейс-темплейт с предметами через связующую таблицу
    const caseTemplate = await CaseTemplate.findByPk(caseTemplateId, {
      include: [{
        model: Item,
        as: 'items',
        through: {
          attributes: [] // Не включаем атрибуты связующей таблицы
        },
        attributes: [
          'id',
          'name',
          'description',
          'image_url',
          'price',
          'rarity',
          'drop_weight',
          'category_id',
          'is_tradable',
          'in_stock'
        ]
      }],
      attributes: ['id', 'name', 'description', 'type', 'is_active']
    });

    if (!caseTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Кейс-темплейт не найден'
      });
    }

    if (!caseTemplate.is_active) {
      return res.status(404).json({
        success: false,
        message: 'Кейс-темплейт недоступен'
      });
    }

    // Возвращаем предметы
    res.json({
      success: true,
      data: {
        caseTemplate: {
          id: caseTemplate.id,
          name: caseTemplate.name,
          description: caseTemplate.description,
          type: caseTemplate.type
        },
        items: caseTemplate.items || []
      }
    });

  } catch (error) {
    logger.error('Ошибка при получении предметов кейс-темплейта:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { getCaseTemplateItems };
