const SteamBot = require('../../services/steamBotService');

const botAccountName = 'adavan3';
const botPassword = '9524Vlad1243Stalker';
const botSharedSecret = 'RfqZkqnNJDGZxXLLmCEuiaMOBiA=';
const botIdentitySecret = 'P2tHB9XcWaIMcrpzQ1Ogn/0Vulg=';

// В логах не выводим пароли и секреты!

const steamBot = new SteamBot(botAccountName, botPassword, botSharedSecret, botIdentitySecret);

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

const SteamID = require('steamid');

async function sendTrade(req, res) {
  // Не логируем пароли, секреты и приватные данные!
  console.log('Received sendTrade request', { time: new Date().toISOString(), body: { ...req.body, tradeUrl: req.body.tradeUrl ? '[REDACTED]' : undefined } });
  try {
    if (!hasLoggedIn) {
      console.log('sendTrade rejected: Bot is not logged in!');
      return res.status(403).json({ success: false, message: 'Bot is not logged in' });
    }
    const { tradeUrl, itemAssetId } = req.body;
    if (!tradeUrl || !itemAssetId) {
      console.log('sendTrade missing params:', { tradeUrlPresent: !!tradeUrl, itemAssetIdPresent: !!itemAssetId });
      return res.status(400).json({ success: false, message: 'tradeUrl and itemAssetId are required' });
    }

    // Convert tradeUrl to partnerSteamId
    console.log('Resolving SteamID from tradeUrl ...');
    const partnerSteamId = await new Promise((resolve, reject) => {
      steamBot.community.getSteamIdFromTradeURL(tradeUrl, (err, steamId) => {
        if (err) {
          console.error('Error getting SteamID from tradeUrl:', err);
          return reject(err);
        }
        resolve(steamId.getSteamID64());
      });
    });
    console.log('Resolved partner steamid:', partnerSteamId);

    // Get bot inventory
    console.log('Fetching bot inventory ...');
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

    // Find item by assetid
    const itemToGive = inventory.find(item => item.assetid === itemAssetId);
    if (!itemToGive) {
      console.log('Item not found in inventory:', itemAssetId);
      return res.status(404).json({ success: false, message: 'Item not found in bot inventory' });
    }

    // Send trade offer
    console.log('Sending trade offer...', { to: partnerSteamId, assetid: itemAssetId });
    const status = await steamBot.sendTradeOffer(partnerSteamId, [itemToGive], []);
    console.log('Trade offer sent. Status:', status);

    res.json({ success: true, status });
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
