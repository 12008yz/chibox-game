const db = require('../models');

async function addItemToUserInventory(userId, csmoneyId) {
  try {
    // Find the item by csmoney_id
    const item = await db.Item.findOne({ where: { csmoney_id: csmoneyId } });
    if (!item) {
      console.error(`Item with csmoney_id ${csmoneyId} not found`);
      return;
    }

    // Check if user already has this item in inventory with status 'inventory'
    const existingInventory = await db.UserInventory.findOne({
      where: {
        user_id: userId,
        item_id: item.id,
        status: 'inventory'
      }
    });

    if (existingInventory) {
      console.log(`User already has item ${item.name} in inventory`);
      return;
    }

    // Add item to user's inventory
    await db.UserInventory.create({
      user_id: userId,
      item_id: item.id,
      acquisition_date: new Date(),
      source: 'system',
      status: 'inventory'
    });

    console.log(`Item ${item.name} added to user ${userId} inventory successfully`);
  } catch (error) {
    console.error('Error adding item to user inventory:', error);
  }
}

// If run as script
if (require.main === module) {
  const userId = '429e95b8-7ea0-4a99-a600-440b9ef0c551';
  const csmoneyId = 30767290; // From add-single-item.js

  addItemToUserInventory(userId, csmoneyId);
}

module.exports = { addItemToUserInventory };
