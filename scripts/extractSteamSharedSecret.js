/**
 * Пример скрипта для извлечения botSharedSecret из файлов Steam Guard.
 * Требуется доступ к файлам Steam Guard на вашем устройстве.
 * 
 * ВНИМАНИЕ: Используйте этот скрипт только если вы понимаете риски безопасности.
 */

const fs = require('fs');
const path = require('path');
const SteamTotp = require('steam-totp');

function extractSharedSecret(steamGuardFilePath) {
  if (!fs.existsSync(steamGuardFilePath)) {
    console.error('Файл Steam Guard не найден по пути:', steamGuardFilePath);
    return null;
  }

  const data = fs.readFileSync(steamGuardFilePath, 'utf8');
  try {
    const json = JSON.parse(data);
    if (json.shared_secret) {
      const sharedSecret = Buffer.from(json.shared_secret, 'base64').toString('utf8');
      console.log('Извлечённый shared_secret:', sharedSecret);
      console.log('Пример кода для генерации Steam Guard кода:', SteamTotp.generateAuthCode(sharedSecret));
      return sharedSecret;
    } else {
      console.error('shared_secret не найден в файле Steam Guard');
      return null;
    }
  } catch (err) {
    console.error('Ошибка при разборе файла Steam Guard:', err);
    return null;
  }
}

// Укажите путь к файлу Steam Guard на вашем устройстве
const steamGuardFilePath = path.resolve('path_to_steam_guard_file.json');

extractSharedSecret(steamGuardFilePath);
