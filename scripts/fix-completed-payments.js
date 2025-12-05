console.log('\n🔍 ПРОВЕРКА КОНФИГУРАЦИИ FREEKASSA\n');
console.log('━'.repeat(60));

console.log('\n1️⃣  ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ:');
console.log(`   FREEKASSA_MERCHANT_ID: ${process.env.FREEKASSA_MERCHANT_ID || '❌ НЕ УСТАНОВЛЕНА'}`);
console.log(`   FREEKASSA_SECRET_WORD_1: ${process.env.FREEKASSA_SECRET_WORD_1 ? '✅ Установлена' : '❌ НЕ УСТАНОВЛЕНА'}`);
console.log(`   FREEKASSA_SECRET_WORD_2: ${process.env.FREEKASSA_SECRET_WORD_2 ? '✅ Установлена' : '❌ НЕ УСТАНОВЛЕНА'}`);
console.log(`   BACKEND_URL: ${process.env.BACKEND_URL || '❌ НЕ УСТАНОВЛЕНА'}`);

console.log('\n2️⃣  WEBHOOK URL-ы (которые должны быть в личном кабинете FREEKASSA):');

const backendUrl = process.env.BACKEND_URL || 'https://ВАШ_ДОМЕН';

console.log(`\n   ✅ Result URL (обязательный!):`);
console.log(`      ${backendUrl}/api/payment/freekassa/result`);
console.log(`\n   ℹ️  Success URL (необязательный):`);
console.log(`      ${backendUrl}/api/payment/freekassa/success`);
console.log(`\n   ℹ️  Fail URL (необязательный):`);
console.log(`      ${backendUrl}/api/payment/freekassa/fail`);

console.log('\n3️⃣  ЧТО НУЖНО ПРОВЕРИТЬ В ЛИЧНОМ КАБИНЕТЕ FREEKASSA:');
console.log(`   • Откройте: https://fk.money/merchant/`);
console.log(`   • Перейдите в раздел "Магазины" → Выберите ваш магазин`);
console.log(`   • В разделе "Уведомления" (или "Notification") убедитесь:`);
console.log(`     - Result URL: ${backendUrl}/api/payment/freekassa/result`);
console.log(`     - Метод: POST или GET (лучше оба)`);
console.log(`     - Secret Word 2 совпадает с FREEKASSA_SECRET_WORD_2`);

console.log('\n4️⃣  ПРОВЕРКА ДОСТУПНОСТИ WEBHOOK URL:');
console.log(`   Выполните команду на ДРУГОМ компьютере:`);
console.log(`   curl -X POST ${backendUrl}/api/payment/freekassa/result`);
console.log(`\n   Должен вернуться ответ "BAD REQUEST" (это нормально!)`);
console.log(`   Если URL недоступен - проверьте firewall и nginx/apache конфиг`);

console.log('\n5️⃣  ТЕСТОВЫЙ WEBHOOK:');
console.log(`   В личном кабинете FREEKASSA должна быть кнопка "Тест уведомлений"`);
console.log(`   Нажмите её и проверьте логи сервера`);

console.log('\n6️⃣  ПРОВЕРКА ЛОГОВ СЕРВЕРА:');
console.log(`   pm2 logs backend --lines 50`);
console.log(`   Или:`);
console.log(`   tail -f /путь/к/логам/backend.log`);

console.log('\n━'.repeat(60));
console.log('\n⚠️  ВАЖНО: Без Result URL баланс НЕ будет обновляться!\n');
