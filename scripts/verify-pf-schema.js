require('dotenv').config();
const db = require('../models');

(async () => {
  await db.sequelize.authenticate();
  const tablesResult = await db.sequelize.query(
    `SELECT tablename AS table_name FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename IN ('user_fair_seeds', 'user_fair_seed_reveals')`
  );
  const tables = tablesResult[0];
  const [cols] = await db.sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'cases' AND column_name LIKE 'pf_%'`
  );
  console.log('PF tables:', tables.map((t) => t.table_name).join(', ') || 'MISSING');
  console.log('cases.pf_*:', cols.map((c) => c.column_name).sort().join(', ') || 'MISSING');
  const [meta] = await db.sequelize.query(
    `SELECT name FROM "SequelizeMeta" WHERE name LIKE '%provably%'`
  );
  console.log('SequelizeMeta:', meta.map((m) => m.name).join(', ') || 'none');

  const ok = tables.length === 2 && cols.length >= 4;
  if (!ok) {
    console.error('Schema incomplete');
    process.exit(1);
  }
  console.log('Schema OK');
  await db.sequelize.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
