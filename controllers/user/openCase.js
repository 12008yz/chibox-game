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
    let caseId = req.body.caseId || req.params.caseId || req.query.caseId;
    const userId = req.user.id;

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (!caseId) {
      // Если caseId не передан, ищем первый неоткрытый кейс пользователя
      const userCase = await db.Case.findOne({
        where: { user_id: userId, is_opened: false },
        order: [['received_date', 'ASC']]
      });
      if (!userCase) {
        if (user.next_case_available_time && user.next_case_available_time > new Date()) {
          const now = new Date();
          const msRemaining = user.next_case_available_time.getTime() - now.getTime();

          const hours = Math.floor(msRemaining / (1000 * 60 * 60));
          const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((msRemaining % (1000 * 60)) / 1000);

          const timeString = `${hours}ч ${minutes}м ${seconds}с`;

          return res.status(404).json({ message: `Не найден неоткрытый кейс для пользователя. Следующий кейс будет доступен через ${timeString}`, next_case_available_time: user.next_case_available_time });
        }
        return res.status(404).json({ message: 'Не найден неоткрытый кейс для пользователя' });
      }
      caseId = userCase.id;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!user.last_reset_date || user.last_reset_date < today) {
      user.cases_opened_today = 0;
      user.last_reset_date = today;
      await user.save();
    }

    if (user.cases_opened_today >= user.max_daily_cases) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const msRemaining = tomorrow.getTime() - now.getTime();

      const hours = Math.floor(msRemaining / (1000 * 60 * 60));
      const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((msRemaining % (1000 * 60)) / 1000);

      const timeString = `${hours}ч ${minutes}м ${seconds}с`;

      return res.status(400).json({ message: `Достигнут лимит открытия кейсов на сегодня. Следующий кейс будет доступен через ${timeString}` });
    }

    // Убираем ограничение на время открытия кейса
    // if (user.next_case_available_time && user.next_case_available_time > now) {
    //   const msRemaining = user.next_case_available_time.getTime() - now.getTime();

    //   const hours = Math.floor(msRemaining / (1000 * 60 * 60));
    //   const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
    //   const seconds = Math.floor((msRemaining % (1000 * 60)) / 1000);

    //   const timeString = `${hours}ч ${minutes}м ${seconds}с`;

    //   return res.status(400).json({ message: `Следующий кейс будет доступен через ${timeString}`, next_case_available_time: user.next_case_available_time });
    // }

    const userCase = await db.Case.findOne({
      where: { id: caseId, user_id: userId, is_opened: false },
      include: [
        { model: db.CaseTemplate, as: 'template', include: [{
          model: db.Item,
          as: 'items',
          through: { attributes: [] }
        }] },
        { model: db.Item, as: 'result_item' }
      ]
    });
    if (!userCase) {
      return res.status(404).json({ message: 'Кейс не найден или уже открыт' });
    }

    if (!userCase) {
      return res.status(404).json({ message: 'Кейс не найден или уже открыт' });
    }

    const items = userCase.template.items || [];
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
      item_id: selectedItem.id,
      quantity: 1,
      case_id: userCase.id
    });

    user.cases_opened_today += 1;
    // Убираем установку времени следующего доступного кейса
    // user.next_case_available_time = new Date(now.getTime() + 60 * 60 * 1000);
    // await user.save();
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
