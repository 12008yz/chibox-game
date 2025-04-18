'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Получим доступные шаблоны кейсов
    const caseTemplates = await queryInterface.sequelize.query(
      'SELECT id, name, type FROM case_templates;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    // Создадим карту шаблонов по типу
    const caseTemplateMap = {};
    caseTemplates.forEach(template => {
      if (!caseTemplateMap[template.type]) {
        caseTemplateMap[template.type] = [];
      }
      caseTemplateMap[template.type].push({ id: template.id, name: template.name });
    });

    // Получим первый попавшийся daily кейс для миссий
    const dailyCaseTemplate = caseTemplateMap.daily && caseTemplateMap.daily.length > 0 ?
      caseTemplateMap.daily[0] : { id: uuidv4(), name: 'Ежедневный кейс' };

    // Получим первый попавшийся premium кейс для миссий
    const premiumCaseTemplate = caseTemplateMap.premium && caseTemplateMap.premium.length > 0 ?
      caseTemplateMap.premium[0] : { id: uuidv4(), name: 'Премиум кейс' };

    // Создаем последовательность миссий для обучения
    const tutorial1Id = uuidv4();
    const tutorial2Id = uuidv4();
    const tutorial3Id = uuidv4();

    return queryInterface.bulkInsert('missions', [
      // Обучающие миссии
      {
        id: tutorial1Id,
        title: 'Добро пожаловать!',
        description: 'Войдите в игру 1 раз, чтобы получить награду',
        icon_url: '/images/missions/welcome.png',
        type: 'onetime',
        status: 'active',
        difficulty: 'easy',
        action_type: 'login',
        required_count: 1,
        min_subscription_tier: 0,
        min_level: 1,
        condition_config: JSON.stringify({}),
        reward_config: JSON.stringify({
          xp: 50,
          cases: [{ template_id: dailyCaseTemplate.id }]
        }),
        xp_reward: 50,
        has_progress: false,
        is_hidden: false,
        order: 1,
        is_sequential: true,
        next_mission_id: tutorial2Id,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: tutorial2Id,
        title: 'Открой свой первый кейс',
        description: 'Откройте полученный кейс и получите предмет',
        icon_url: '/images/missions/open_case.png',
        type: 'onetime',
        status: 'active',
        difficulty: 'easy',
        action_type: 'open_cases',
        required_count: 1,
        min_subscription_tier: 0,
        min_level: 1,
        condition_config: JSON.stringify({}),
        reward_config: JSON.stringify({
          xp: 100,
          balance: 25.00
        }),
        xp_reward: 100,
        has_progress: true,
        is_hidden: true, // Скрыта до выполнения предыдущей
        hidden_condition_config: JSON.stringify({
          previous_mission_completed: tutorial1Id
        }),
        order: 2,
        is_sequential: true,
        next_mission_id: tutorial3Id,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: tutorial3Id,
        title: 'Подпишись на новости',
        description: 'Подпишитесь на рассылку новостей игры',
        icon_url: '/images/missions/subscribe.png',
        type: 'onetime',
        status: 'active',
        difficulty: 'easy',
        action_type: 'subscribe_newsletter',
        required_count: 1,
        min_subscription_tier: 0,
        min_level: 1,
        condition_config: JSON.stringify({}),
        reward_config: JSON.stringify({
          xp: 150,
          balance: 50.00,
          cases: [{ template_id: premiumCaseTemplate.id }]
        }),
        xp_reward: 150,
        has_progress: false,
        is_hidden: true,
        hidden_condition_config: JSON.stringify({
          previous_mission_completed: tutorial2Id
        }),
        order: 3,
        is_sequential: false,
        created_at: new Date(),
        updated_at: new Date()
      },

      // Ежедневные миссии
      {
        id: uuidv4(),
        title: 'Ежедневный вход',
        description: 'Войдите в игру сегодня',
        icon_url: '/images/missions/daily_login.png',
        type: 'daily',
        status: 'active',
        difficulty: 'easy',
        action_type: 'login',
        required_count: 1,
        min_subscription_tier: 0,
        min_level: 1,
        condition_config: JSON.stringify({}),
        reward_config: JSON.stringify({
          xp: 25,
          balance: 5.00
        }),
        xp_reward: 25,
        reset_period: 24, // Сброс через 24 часа
        has_progress: false,
        is_hidden: false,
        order: 10,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        title: 'Открой 3 кейса',
        description: 'Откройте 3 любых кейса за сегодня',
        icon_url: '/images/missions/open_three_cases.png',
        type: 'daily',
        status: 'active',
        difficulty: 'medium',
        action_type: 'open_cases',
        required_count: 3,
        min_subscription_tier: 0,
        min_level: 1,
        condition_config: JSON.stringify({}),
        reward_config: JSON.stringify({
          xp: 75,
          balance: 20.00
        }),
        xp_reward: 75,
        reset_period: 24,
        has_progress: true,
        is_hidden: false,
        order: 11,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        title: 'Получи редкий предмет',
        description: 'Получите хотя бы один предмет редкости "rare" или выше',
        icon_url: '/images/missions/get_rare_item.png',
        type: 'daily',
        status: 'active',
        difficulty: 'hard',
        action_type: 'get_rare_items',
        required_count: 1,
        min_subscription_tier: 0,
        min_level: 1,
        condition_config: JSON.stringify({
          min_rarity: 'rare'
        }),
        reward_config: JSON.stringify({
          xp: 150,
          balance: 50.00
        }),
        xp_reward: 150,
        reset_period: 24,
        has_progress: true,
        is_hidden: false,
        order: 12,
        created_at: new Date(),
        updated_at: new Date()
      },

      // Еженедельные миссии
      {
        id: uuidv4(),
        title: 'Недельный хантер',
        description: 'Откройте 15 кейсов за неделю',
        icon_url: '/images/missions/weekly_hunter.png',
        type: 'weekly',
        status: 'active',
        difficulty: 'medium',
        action_type: 'open_cases',
        required_count: 15,
        min_subscription_tier: 0,
        min_level: 3,
        condition_config: JSON.stringify({}),
        reward_config: JSON.stringify({
          xp: 300,
          balance: 100.00,
          cases: [{ template_id: premiumCaseTemplate.id }]
        }),
        xp_reward: 300,
        reset_period: 168, // 7 дней в часах
        has_progress: true,
        is_hidden: false,
        order: 20,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        title: 'Коллекционер редкостей',
        description: 'Получите 5 предметов редкости "rare" или выше за неделю',
        icon_url: '/images/missions/rare_collector.png',
        type: 'weekly',
        status: 'active',
        difficulty: 'hard',
        action_type: 'get_rare_items',
        required_count: 5,
        min_subscription_tier: 0,
        min_level: 5,
        condition_config: JSON.stringify({
          min_rarity: 'rare'
        }),
        reward_config: JSON.stringify({
          xp: 500,
          balance: 250.00,
          cases: [{ template_id: premiumCaseTemplate.id }]
        }),
        xp_reward: 500,
        reset_period: 168,
        has_progress: true,
        is_hidden: false,
        order: 21,
        created_at: new Date(),
        updated_at: new Date()
      },

      // Достижения
      {
        id: uuidv4(),
        title: 'Начинающий коллекционер',
        description: 'Откройте 50 кейсов',
        icon_url: '/images/missions/beginner_collector.png',
        type: 'achievement',
        status: 'active',
        difficulty: 'medium',
        action_type: 'open_cases',
        required_count: 50,
        min_subscription_tier: 0,
        min_level: 1,
        condition_config: JSON.stringify({}),
        reward_config: JSON.stringify({
          xp: 500,
          balance: 100.00,
          cases: [{ template_id: premiumCaseTemplate.id }]
        }),
        xp_reward: 500,
        has_progress: true,
        is_hidden: false,
        order: 30,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        title: 'Опытный коллекционер',
        description: 'Откройте 250 кейсов',
        icon_url: '/images/missions/experienced_collector.png',
        type: 'achievement',
        status: 'active',
        difficulty: 'hard',
        action_type: 'open_cases',
        required_count: 250,
        min_subscription_tier: 0,
        min_level: 10,
        condition_config: JSON.stringify({}),
        reward_config: JSON.stringify({
          xp: 1500,
          balance: 500.00,
          cases: [
            { template_id: premiumCaseTemplate.id },
            { template_id: premiumCaseTemplate.id }
          ]
        }),
        xp_reward: 1500,
        has_progress: true,
        is_hidden: false,
        order: 31,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        title: 'Мастер коллекционер',
        description: 'Откройте 1000 кейсов',
        icon_url: '/images/missions/master_collector.png',
        type: 'achievement',
        status: 'active',
        difficulty: 'extreme',
        action_type: 'open_cases',
        required_count: 1000,
        min_subscription_tier: 0,
        min_level: 20,
        condition_config: JSON.stringify({}),
        reward_config: JSON.stringify({
          xp: 5000,
          balance: 2000.00,
          cases: [
            { template_id: premiumCaseTemplate.id },
            { template_id: premiumCaseTemplate.id },
            { template_id: premiumCaseTemplate.id }
          ]
        }),
        xp_reward: 5000,
        has_progress: true,
        is_hidden: false,
        order: 32,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        title: 'Охотник за редкостями',
        description: 'Получите 20 предметов редкости "epic" или выше',
        icon_url: '/images/missions/epic_hunter.png',
        type: 'achievement',
        status: 'active',
        difficulty: 'hard',
        action_type: 'get_rare_items',
        required_count: 20,
        min_subscription_tier: 0,
        min_level: 15,
        condition_config: JSON.stringify({
          min_rarity: 'epic'
        }),
        reward_config: JSON.stringify({
          xp: 2000,
          balance: 1000.00,
          cases: [
            { template_id: premiumCaseTemplate.id },
            { template_id: premiumCaseTemplate.id }
          ]
        }),
        xp_reward: 2000,
        has_progress: true,
        is_hidden: false,
        order: 33,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('missions', null, {});
  }
};
