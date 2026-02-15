const SteamBot = require('../../services/steamBotService');
const steamBotConfig = {
  accountName: process.env.STEAM_ACCOUNT_NAME || '',
  password: process.env.STEAM_PASSWORD || '',
  sharedSecret: process.env.STEAM_SHARED_SECRET || '',
  identitySecret: process.env.STEAM_IDENTITY_SECRET || ''
};

// В логах не выводим пароли и секреты!

const steamBot = new SteamBot(
  steamBotConfig.accountName,
  steamBotConfig.password,
  steamBotConfig.sharedSecret,
  steamBotConfig.identitySecret,
  process.env.STEAM_API_KEY
);

let isLoggingIn = false;
let hasLoggedIn = false;

async function loginBot(req, res) {
  console.log('Received loginBot request', { time: new Date().toISOString() });
  try {
    if (hasLoggedIn) {
      console.log('Bot already logged in');
      return res.json({ success: true, message: 'Bot already logged in' });
    }
    if (isLoggingIn) {
      console.log('Login already in progress');
      return res.status(429).json({ success: false, message: 'Login already in progress' });
    }
    isLoggingIn = true;
    console.log('Starting steamBot.login() ...');
    await steamBot.login();
    hasLoggedIn = true;
    isLoggingIn = false;
    console.log('Bot logged in successfully');
    res.json({ success: true, message: 'Bot logged in successfully' });
  } catch (error) {
    isLoggingIn = false;
    console.error('Login bot failed:', error);
    res.status(500).json({ success: false, message: 'Failed to login bot', error: error.message });
  }
}

async function sendTrade(req, res) {
  console.log('Received sendTrade request', { time: new Date().toISOString(), body: { ...req.body, tradeUrl: req.body.tradeUrl ? '[REDACTED]' : undefined } });
  try {
    if (!hasLoggedIn) {
      console.log('sendTrade rejected: Bot is not logged in!');
      return res.status(403).json({ success: false, message: 'Bot is not logged in' });
    }
    const { tradeUrl, itemAssetId } = req.body;
    if (!tradeUrl || !itemAssetId) {
      return res.status(400).json({ success: false, message: 'tradeUrl and itemAssetId are required' });
    }

    // Валидация Trade URL и извлечение partnerSteamId + token (обязательно для отправки)
    const urlValidation = await steamBot.validateTradeUrl(tradeUrl);
    if (!urlValidation.valid) {
      console.log('Invalid trade URL:', urlValidation.error);
      return res.status(400).json({ success: false, message: urlValidation.error || 'Неверный Trade URL' });
    }
    const { partnerSteamId, token } = urlValidation;

    // Get bot inventory
    console.log('Fetching bot inventory ...');
    const inventory = await new Promise((resolve, reject) => {
      steamBot.manager.getInventoryContents(730, 2, true, (err, items) => {
        if (err) return reject(err);
        resolve(items);
      });
    });
    console.log('Inventory loaded. Count:', inventory.length);

    const itemToGive = inventory.find(item => item.assetid === itemAssetId);
    if (!itemToGive) {
      return res.status(404).json({ success: false, message: 'Item not found in bot inventory' });
    }

    // Отправка с токеном (иначе Steam часто возвращает eresult 15)
    console.log('Sending trade offer with token...');
    const status = await steamBot.sendTradeOfferWithToken(partnerSteamId, token, [itemToGive], []);
    console.log('Trade offer result:', status.success ? `Offer ID ${status.tradeOfferId}` : status.message);

    if (!status.success) {
      return res.status(400).json({ success: false, message: status.message || 'Не удалось отправить трейд', status });
    }
    res.json({ success: true, tradeOfferId: status.tradeOfferId, status });
  } catch (error) {
    console.error('Failed to send trade offer:', error);
    res.status(500).json({ success: false, message: 'Failed to send trade offer', error: error.message });
  }
}

async function getSteamInventory(req, res) {
  console.log('Received getSteamInventory request', { time: new Date().toISOString() });
  try {
    if (!hasLoggedIn) {
      if (!isLoggingIn) {
        isLoggingIn = true;
        console.log('Need login - starting steamBot.login() ...');
        await steamBot.login();
        hasLoggedIn = true;
        isLoggingIn = false;
        console.log('Logged in for inventory.');
      } else {
        console.log('Login in progress - waiting ...');
        while (isLoggingIn) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!hasLoggedIn) {
          console.error('Cannot log in bot after waiting.');
          return res.status(500).json({ success: false, message: 'Failed to log in bot' });
        }
      }
    }
    console.log('Loading Steam Inventory ...');
    const inventory = await new Promise((resolve, reject) => {
      steamBot.manager.getInventoryContents(730, 2, true, (err, items) => {
        if (err) {
          console.error('Error loading inventory:', err);
          return reject(err);
        }
        resolve(items);
      });
    });
    console.log('Inventory loaded. Count of items:', inventory.length);
    res.json({ success: true, count: inventory.length, inventory });
  } catch (error) {
    console.error('Failed to get Steam inventory:', error);
    res.status(500).json({ success: false, message: 'Failed to get Steam inventory', error: error.message });
  }
}

module.exports = {
  loginBot,
  sendTrade,
  getSteamInventory,
};
