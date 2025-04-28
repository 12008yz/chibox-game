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

    if (items.length === 0) {
      console.error('No items available to add to the case.');
      return;
    }

    // Find the case template
    const caseTemplate = await CaseTemplate.findByPk(caseId);
    if (!caseTemplate) {
      console.error('Case template not found for id:', caseId);
      return;
    }

    // Clear existing associations
    await caseTemplate.setItems([]);

    // Add new associations
    await caseTemplate.addItems(items);

    console.log(`Updated item associations for case ${caseTemplate.name} (${caseId})`);
  } catch (error) {
    console.error('Error updating case item pool:', error);
  } finally {
    await sequelize.close();
  }
}

// Replace with the case ID you want to update
const caseIdToUpdate = '7ada3037-75cf-4c6a-b68a-63bb80a60659'; // Example: Elite case ID

updateCaseItemPool(caseIdToUpdate);
