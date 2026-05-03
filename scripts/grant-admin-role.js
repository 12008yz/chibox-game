/**
 * Выдать пользователю роль admin или superadmin (SSH на сервере, из каталога backend).
 *
 *   node scripts/grant-admin-role.js <user-uuid> [admin|superadmin]
 *
 * Пример:
 *   node scripts/grant-admin-role.js a1b2c3d4-e5f6-7890-abcd-ef1234567890 admin
 */
'use strict';

require('dotenv').config();

const db = require('../models');

const [, , userId, roleArg] = process.argv;

const rawRole = (roleArg || 'admin').toLowerCase();
const role = rawRole === 'superadmin' ? 'superadmin' : 'admin';

async function main() {
  if (!userId || userId.length < 8) {
    console.error('Usage: node scripts/grant-admin-role.js <user-uuid> [admin|superadmin]');
    process.exit(1);
  }

  await db.sequelize.authenticate();
  const user = await db.User.findByPk(userId.trim());
  if (!user) {
    console.error('User not found:', userId);
    process.exit(1);
  }

  await user.update({ role });
  console.log(`OK: user ${user.username} (${user.id}) → role=${role}`);
  await db.sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
