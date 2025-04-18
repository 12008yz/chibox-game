-- Удалить таблицы в правильном порядке (чтобы избежать проблем с внешними ключами)
DROP TABLE IF EXISTS "SequelizeMeta" CASCADE;
DROP TABLE IF EXISTS "user_inventory" CASCADE;
DROP TABLE IF EXISTS "user_achievements" CASCADE;
DROP TABLE IF EXISTS "cases" CASCADE;
DROP TABLE IF EXISTS "withdrawals" CASCADE;
DROP TABLE IF EXISTS "transactions" CASCADE;
DROP TABLE IF EXISTS "items" CASCADE;
DROP TABLE IF EXISTS "item_categories" CASCADE;
DROP TABLE IF EXISTS "case_templates" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "achievements" CASCADE;
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "live_drops" CASCADE;
DROP TABLE IF EXISTS "missions" CASCADE;
DROP TABLE IF EXISTS "user_missions" CASCADE;
DROP TABLE IF EXISTS "promo_codes" CASCADE;
DROP TABLE IF EXISTS "promo_code_usages" CASCADE;
DROP TABLE IF EXISTS "promo_code_users" CASCADE;
DROP TABLE IF EXISTS "xp_transactions" CASCADE;
DROP TABLE IF EXISTS "settings" CASCADE;
DROP TABLE IF EXISTS "statistics" CASCADE;
DROP TABLE IF EXISTS "unlockable_contents" CASCADE;
DROP TABLE IF EXISTS "user_unlockable_contents" CASCADE;
DROP TABLE IF EXISTS "level_settings" CASCADE;
DROP TABLE IF EXISTS "leaderboards" CASCADE;
DROP TABLE IF EXISTS "leaderboard_entries" CASCADE;
DROP TABLE IF EXISTS "caches" CASCADE;
DROP TABLE IF EXISTS "drop_rules" CASCADE;

-- Удалить ENUM типы
DROP TYPE IF EXISTS "enum_users_role";
DROP TYPE IF EXISTS "enum_items_rarity";
DROP TYPE IF EXISTS "enum_case_templates_type";
DROP TYPE IF EXISTS "enum_cases_source";
DROP TYPE IF EXISTS "enum_user_inventory_source";
DROP TYPE IF EXISTS "enum_user_inventory_status";
DROP TYPE IF EXISTS "enum_transactions_type";
DROP TYPE IF EXISTS "enum_achievements_type";
DROP TYPE IF EXISTS "enum_notifications_type";
DROP TYPE IF EXISTS "enum_payments_status";
DROP TYPE IF EXISTS "enum_payments_method";
DROP TYPE IF EXISTS "enum_promo_codes_type";
DROP TYPE IF EXISTS "enum_withdrawals_status";
