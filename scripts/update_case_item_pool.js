const { sequelize, Item, CaseTemplate } = require('../models');
const { Op } = require('sequelize');

async function updateCaseItemPool(caseId) {
  try {
    // Fetch all items that are available
    const items = await Item.findAll({
      where: {
        is_available: true
      },
      attributes: ['id', 'name', 'rarity', 'price']
    });

    // Group items by rarity
    // Map BUFF rarity internal names to new rarity ENUM values
    const rarityMap = {
      'consumer': 'consumer',
      'industrial': 'industrial',
      'milspec': 'milspec',
      'restricted': 'restricted',
      'classified': 'classified',
      'covert': 'covert',
      'contraband': 'contraband',
      'exotic': 'exotic',
      // Map old or alternative BUFF rarity names to closest new rarity
      'common': 'consumer',
      'uncommon': 'industrial',
      'rare': 'milspec',
      'epic': 'restricted',
      'legendary': 'classified',
      'mythical': 'covert',
      'ancient_weapon': 'contraband',
      'exotic_weapon': 'exotic'
    };

    const allItems = [];

    items.forEach(item => {
      // Determine rarity from buff_rarity or fallback to item.rarity
      let buffRarity = item.buff_rarity ? item.buff_rarity.toLowerCase() : null;
      let mappedRarity = rarityMap[buffRarity] || item.rarity || 'consumer';

      allItems.push({
        id: item.id,
        name: item.name,
        rarity: mappedRarity,
        price: parseFloat(item.price)
      });
    });

    const totalItems = allItems.length;
    if (totalItems === 0) {
      console.error('No items available to add to the case.');
      return;
    }

    const equalProbability = 1 / totalItems;

    // Create item pool config
    const itemPoolConfig = {};

    allItems.forEach(item => {
      itemPoolConfig[item.id] = {
        id: item.id,
        name: item.name,
        rarity: item.rarity,
        probability: equalProbability,
        price: item.price
      };
    });

    // Update the case_templates table with new item_pool_config
    const caseTemplate = await CaseTemplate.findByPk(caseId);
    if (!caseTemplate) {
      console.error('Case template not found for id:', caseId);
      return;
    }

    caseTemplate.item_pool_config = JSON.stringify(itemPoolConfig);
    await caseTemplate.save();

    console.log(`Updated item_pool_config for case ${caseTemplate.name} (${caseId})`);
  } catch (error) {
    console.error('Error updating case item pool:', error);
  } finally {
    await sequelize.close();
  }
}

// Replace with the case ID you want to update
const caseIdToUpdate = '7ada3037-75cf-4c6a-b68a-63bb80a60659'; // Example: Elite case ID

updateCaseItemPool(caseIdToUpdate);
