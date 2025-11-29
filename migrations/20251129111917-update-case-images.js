'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const updates = [
      { 
        id: '88888888-8888-8888-8888-888888888888', 
        name: 'Ночной дозор',
        image_url: '/images/cases/dozor.png' 
      },
      { 
        id: '99999999-9999-9999-9999-999999999999', 
        name: 'Пушистый кейс',
        image_url: '/images/cases/dog.png' 
      },
      { 
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 
        name: 'Санитарный набор',
        image_url: '/images/cases/sanitar.png' 
      },
      { 
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 
        name: 'Платиновый кейс',
        image_url: '/images/cases/pantera.png' 
      },
      { 
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', 
        name: 'Космический кейс',
        image_url: '/images/cases/space.png' 
      },
      { 
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', 
        name: 'Морской кейс',
        image_url: '/images/cases/morskoy.png' 
      },
      { 
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 
        name: 'Ледяной кейс',
        image_url: '/images/cases/led.png' 
      },
      { 
        id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', 
        name: 'Бурый кейс',
        image_url: '/images/cases/bear_chibox-game.ru.png' 
      },
      { 
        id: '10101010-1010-1010-1010-101010101010', 
        name: 'Демонический кейс',
        image_url: '/images/cases/demon.png' 
      }
    ];

    for (const update of updates) {
      await queryInterface.bulkUpdate('case_templates', 
        { 
          name: update.name,
          image_url: update.image_url, 
          updated_at: new Date() 
        },
        { id: update.id }
      );
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('Откат миграции изображений и названий кейсов');
  }
};
