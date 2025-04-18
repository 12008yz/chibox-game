'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Получим пользователей
    const users = await queryInterface.sequelize.query(
      'SELECT id, username, subscription_tier FROM users;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    // Получим шаблоны кейсов
    const caseTemplates = await queryInterface.sequelize.query(
      'SELECT id, name, type FROM case_templates;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (users.length === 0 || caseTemplates.length === 0) {
      console.warn('Нет пользователей или шаблонов кейсов для создания кейсов');
      return queryInterface.bulkInsert('cases', []);
    }

    // Группируем шаблоны по типу
    const caseTemplateMap = {};
    caseTemplates.forEach(template => {
      if (!caseTemplateMap[template.type]) {
        caseTemplateMap[template.type] = [];
      }
      caseTemplateMap[template.type].push(template);
    });

    // Создаем массив кейсов для пользователей
    const cases = [];

    // Для каждого пользователя создаем несколько кейсов
    users.forEach(user => {
      // Добавляем ежедневные кейсы всем пользователям
      if (caseTemplateMap.daily && caseTemplateMap.daily.length > 0) {
        const dailyTemplate = caseTemplateMap.daily[0];

        // Добавляем от 1 до 3 ежедневных кейсов
        const numDailyCases = Math.min(3, user.subscription_tier + 1);

        for (let i = 0; i < numDailyCases; i++) {
          cases.push({
            id: uuidv4(),
            name: dailyTemplate.name,
            template_id: dailyTemplate.id,
            user_id: user.id,
            is_opened: false,
            received_date: new Date(new Date().setHours(-Math.random() * 24)), // В течение последних 24 часов
            subscription_tier: user.subscription_tier,
            source: 'subscription',
            created_at: new Date(),
            updated_at: new Date()
          });
        }
      }

      // Добавляем премиум кейсы пользователям с подпиской
      if (user.subscription_tier > 0 && caseTemplateMap.premium && caseTemplateMap.premium.length > 0) {
        const premiumTemplate = caseTemplateMap.premium[0];

        // Добавляем от 1 до 2 премиум кейсов в зависимости от уровня подписки
        const numPremiumCases = Math.min(2, user.subscription_tier);

        for (let i = 0; i < numPremiumCases; i++) {
          cases.push({
            id: uuidv4(),
            name: premiumTemplate.name,
            template_id: premiumTemplate.id,
            user_id: user.id,
            is_opened: false,
            received_date: new Date(new Date().setHours(-Math.random() * 24)), // В течение последних 24 часов
            subscription_tier: user.subscription_tier,
            source: 'subscription',
            created_at: new Date(),
            updated_at: new Date()
          });
        }
      }

      // Добавляем купленные кейсы для пользователей с подпиской уровня 2 и выше
      if (user.subscription_tier >= 2 && caseTemplateMap.premium && caseTemplateMap.premium.length > 0) {
        const eliteTemplate = caseTemplateMap.premium.length > 1 ? caseTemplateMap.premium[1] : caseTemplateMap.premium[0];

        // Добавляем от 1 до 3 купленных элитных кейсов
        const numBoughtCases = user.subscription_tier === 3 ? 3 : 1;

        for (let i = 0; i < numBoughtCases; i++) {
          cases.push({
            id: uuidv4(),
            name: eliteTemplate.name,
            template_id: eliteTemplate.id,
            user_id: user.id,
            is_opened: false,
            received_date: new Date(new Date().setHours(-Math.random() * 72)), // В течение последних 72 часов
            subscription_tier: user.subscription_tier,
            is_paid: true,
            purchase_price: 250.00,
            source: 'purchase',
            created_at: new Date(),
            updated_at: new Date()
          });
        }
      }

      // Добавляем уже открытые кейсы для статистики
      if (caseTemplateMap.daily && caseTemplateMap.daily.length > 0) {
        const dailyTemplate = caseTemplateMap.daily[0];

        // Получим случайный набор из 5 предметов для имитации выпадений
        const numOpenedCases = user.subscription_tier === 0 ? 2 : (user.subscription_tier * 3);

        for (let i = 0; i < numOpenedCases; i++) {
          const openedDate = new Date(new Date().setDate(new Date().getDate() - Math.floor(Math.random() * 30)));
          cases.push({
            id: uuidv4(),
            name: dailyTemplate.name,
            template_id: dailyTemplate.id,
            user_id: user.id,
            is_opened: true,
            received_date: new Date(openedDate.setHours(openedDate.getHours() - 2)), // Получен на 2 часа раньше открытия
            opened_date: openedDate,
            subscription_tier: user.subscription_tier,
            source: 'subscription',
            drop_bonus_applied: user.subscription_tier * 3.0,
            created_at: new Date(openedDate.setHours(openedDate.getHours() - 2)),
            updated_at: openedDate
          });
        }
      }
    });

    return queryInterface.bulkInsert('cases', cases);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('cases', null, {});
  }
};
