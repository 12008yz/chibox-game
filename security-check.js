#!/usr/bin/env node

/**
 * Скрипт для комплексной проверки безопасности приложения
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔒 Запуск комплексной проверки безопасности...\n');

// 1. Проверка npm audit
console.log('📋 1. Проверка уязвимостей в зависимостях (npm audit)...');
try {
  const auditResult = execSync('npm audit --json', { encoding: 'utf8' });
  const audit = JSON.parse(auditResult);

  if (audit.vulnerabilities && Object.keys(audit.vulnerabilities).length > 0) {
    console.log('⚠️  Найдены уязвимости в зависимостях:');
    Object.entries(audit.vulnerabilities).forEach(([pkg, vuln]) => {
      console.log(`   - ${pkg}: ${vuln.severity} (${vuln.range})`);
    });
  } else {
    console.log('✅ Уязвимости в зависимостях не найдены');
  }
} catch (error) {
  console.log('❌ Найдены уязвимости в зависимостях (запустите npm audit для деталей)');
}

// 2. Проверка ESLint Security
console.log('\n📋 2. Проверка безопасности кода (ESLint Security)...');
try {
  const lintResult = execSync('npx eslint . --ext .js --format json', { encoding: 'utf8' });
  const lintData = JSON.parse(lintResult);

  const securityIssues = lintData.filter(file =>
    file.messages.some(msg => msg.ruleId && msg.ruleId.startsWith('security/'))
  );

  if (securityIssues.length > 0) {
    console.log('⚠️  Найдены проблемы безопасности в коде:');
    securityIssues.forEach(file => {
      console.log(`   Файл: ${file.filePath}`);
      file.messages.forEach(msg => {
        if (msg.ruleId && msg.ruleId.startsWith('security/')) {
          console.log(`     - Строка ${msg.line}: ${msg.message}`);
        }
      });
    });
  } else {
    console.log('✅ Проблемы безопасности в коде не найдены');
  }
} catch (error) {
  console.log('⚠️  Есть проблемы в коде (запустите npm run security-lint для деталей)');
}

// 3. Проверка переменных окружения
console.log('\n📋 3. Проверка переменных окружения...');
const requiredEnvVars = [
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.log('⚠️  Отсутствуют обязательные переменные окружения:');
  missingEnvVars.forEach(envVar => console.log(`   - ${envVar}`));
} else {
  console.log('✅ Все обязательные переменные окружения настроены');
}

// 4. Проверка JWT_SECRET
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.log('⚠️  JWT_SECRET слишком короткий (должен быть минимум 32 символа)');
} else if (process.env.JWT_SECRET) {
  console.log('✅ JWT_SECRET имеет достаточную длину');
}

// 5. Проверка безопасности файлов
console.log('\n📋 4. Проверка безопасности файлов...');
const sensitiveFiles = [
  'config/secrets.js',
  'config/config.js',
  '.env',
  '.env.local',
  '.env.production'
];

sensitiveFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const permissions = (stats.mode & parseInt('777', 8)).toString(8);
    if (permissions !== '600' && permissions !== '644') {
      console.log(`⚠️  Небезопасные права доступа для ${file}: ${permissions}`);
    }
  }
});

// 6. Проверка валидации типов
console.log('\n📋 5. Проверка валидации типов...');
const filesToCheck = [
  'controllers/user/login.js',
  'controllers/user/register.js',
  'controllers/user/updateProfile.js'
];

filesToCheck.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');

    // Проверяем наличие typeof проверок
    if (!content.includes('typeof') || !content.includes('!== \'string\'')) {
      console.log(`⚠️  ${file}: Отсутствует валидация типов`);
    } else {
      console.log(`✅ ${file}: Валидация типов присутствует`);
    }

    // Проверяем использование .trim() без проверки типа
    const unsafeTrimMatch = content.match(/(\w+)\.trim\(\)/g);
    if (unsafeTrimMatch) {
      const lines = content.split('\n');
      unsafeTrimMatch.forEach(match => {
        const lineIndex = lines.findIndex(line => line.includes(match));
        if (lineIndex > -1) {
          const prevLines = lines.slice(Math.max(0, lineIndex - 3), lineIndex).join(' ');
          if (!prevLines.includes('typeof') && !prevLines.includes('string')) {
            console.log(`⚠️  ${file}: Строка ${lineIndex + 1}: Небезопасное использование .trim()`);
          }
        }
      });
    }
  }
});

// 7. Проверка использования HTTPS
console.log('\n📋 6. Проверка конфигурации безопасности...');
try {
  const appContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  // Проверяем использование helmet
  if (!appContent.includes('helmet')) {
    console.log('⚠️  Не используется middleware helmet для безопасности заголовков');
  } else {
    console.log('✅ Используется helmet middleware');
  }

  // Проверяем rate limiting
  if (!appContent.includes('rate-limit') && !appContent.includes('rateLimit')) {
    console.log('⚠️  Не настроено ограничение частоты запросов (rate limiting)');
  } else {
    console.log('✅ Настроено ограничение частоты запросов');
  }

  // Проверяем CORS
  if (!appContent.includes('cors')) {
    console.log('⚠️  CORS может быть не настроен правильно');
  } else {
    console.log('✅ CORS настроен');
  }

} catch (error) {
  console.log('❌ Не удалось проверить app.js');
}

console.log('\n🔒 Проверка безопасности завершена!');
console.log('\n📝 Рекомендации:');
console.log('   1. Регулярно обновляйте зависимости: npm update');
console.log('   2. Исправьте найденные уязвимости: npm audit fix');
console.log('   3. Используйте переменные окружения для секретов');
console.log('   4. Настройте мониторинг безопасности в продакшене');
console.log('   5. Регулярно запускайте этот скрипт для проверки');
