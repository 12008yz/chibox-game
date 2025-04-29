const db = require('../../models');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

async function openCase(req, res) {
  try {
    const { caseId } = req.body;
    const userId = req.user.id;

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (user.cases_opened_today >= user.max_daily_cases) {
      return res.status(400).json({ message: 'Достигнут лимит открытия кейсов на сегодня' });
    }

    const now = new Date();
    if (user.next_case_available_time && user.next_case_available_time > now) {
      return res.status(400).json({ message: 'Следующий кейс будет доступен позже', next_case_available_time: user.next_case_available_time });
    }

    const caseTemplate = await db.CaseTemplate.findByPk(caseId, {
      include: [{
        model: db.Item,
        as: 'items',
        through: { attributes: [] }
      }]
    });
    if (!caseTemplate) {
      return res.status(404).json({ message: 'Кейс не найден' });
    }

    const userCase = await db.Case.findOne({
      where: { id: caseId, user_id: userId, is_opened: false },
      include: [
        { model: db.CaseTemplate, as: 'template' },
        { model: db.Item, as: 'result_item' }
      ]
    });

    if (!userCase) {
      return res.status(404).json({ message: 'Кейс не найден или уже открыт' });
    }

    const items = caseTemplate.items || [];
    if (!items.length) {
      return res.status(404).json({ message: 'В кейсе нет предметов' });
    }

    const totalWeight = items.reduce((sum, item) => sum + (item.drop_weight || 1), 0);
    let randomWeight = Math.random() * totalWeight;
    let selectedItem = null;
    for (const item of items) {
      randomWeight -= (item.drop_weight || 1);
      if (randomWeight <= 0) {
        selectedItem = item;
        break;
      }
    }
    if (!selectedItem) {
      selectedItem = items[items.length - 1];
    }

    userCase.is_opened = true;
    userCase.opened_date = new Date();
    userCase.result_item_id = selectedItem.id;
    await userCase.save();

    await db.UserInventory.create({
      user_id: userId,
      itemId: selectedItem.id,
      quantity: 1,
      case_id: userCase.id
    });

    user.cases_opened_today += 1;
    user.next_case_available_time = new Date(now.getTime() + 60 * 60 * 1000);
    await user.save();

    logger.info(`Пользователь ${userId} открыл кейс ${caseId} и получил предмет ${selectedItem.id}`);

    return res.json({ item: selectedItem, message: 'Кейс успешно открыт' });
  } catch (error) {
    logger.error('Ошибка открытия кейса:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  openCase
};
