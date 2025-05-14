const db = require('../models');

async function seedLevelSettings() {
  const levels = [
    { level: 1, xp_required: 0, xp_to_next_level: 100, bonus_percentage: 0, daily_cases_bonus: 0, is_milestone: false },
    { level: 2, xp_required: 100, xp_to_next_level: 200, bonus_percentage: 1, daily_cases_bonus: 1, is_milestone: false },
    { level: 3, xp_required: 300, xp_to_next_level: 400, bonus_percentage: 2, daily_cases_bonus: 1, is_milestone: false },
    { level: 4, xp_required: 700, xp_to_next_level: 600, bonus_percentage: 3, daily_cases_bonus: 2, is_milestone: true },
    { level: 5, xp_required: 1300, xp_to_next_level: 800, bonus_percentage: 4, daily_cases_bonus: 2, is_milestone: false },
    // Add more levels as needed
  ];

  for (const lvl of levels) {
    const [levelSetting, created] = await db.LevelSettings.findOrCreate({
      where: { level: lvl.level },
      defaults: lvl
    });
    if (created) {
      console.log(`Level ${lvl.level} created`);
    } else {
      console.log(`Level ${lvl.level} already exists`);
    }
  }
  process.exit();
}

seedLevelSettings().catch(err => {
  console.error('Error seeding level settings:', err);
  process.exit(1);
});
