// scripts/migrate_buff_tags.js

const { Item, sequelize } = require('../models');

async function updateBuffFields() {
   const items = await Item.findAll({ attributes: ['id', 'tags'] }); // если колонка buff_tags
  let done = 0;
  for (let item of items) {
    if (!item.tags) continue;
    let tags;
    try {
      tags = typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags;
      tags = tags.tags || tags;
    } catch (err) {
      console.error('JSON parse error for item', item.id);
      continue;
    }

    await Item.update({
      buff_tags: tags,
      buff_rarity: tags.rarity?.internal_name || null,
      buff_quality: tags.quality?.internal_name || null,
      buff_type: tags.type?.internal_name || null,
      buff_exterior: tags.exterior?.localized_name || tags.exterior?.internal_name || null,
      buff_weapon: tags.weapon?.internal_name || null,
      buff_category: tags.category?.internal_name || null
    }, {
      where: { id: item.id }
    });
    done += 1;
    if (done % 500 === 0) console.log(`Обработано: ${done}`);
  }
  console.log('Готово! Строк обработано:', done);
  await sequelize.close();
}

updateBuffFields();