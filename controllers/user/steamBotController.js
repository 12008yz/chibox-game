const SteamBot = require('../../services/steamBotService');
const SteamGuardHelper = require('../../services/steamGuardHelper');

const botAccountName = 'adavan3';
const botPassword = '9524Vlad1243Stalker';
const botSharedSecret = 'RfqZkqnNJDGZxXLLmCEuiaMOBiA=';
const botIdentitySecret = 'P2tHB9XcWaIMcrpzQ1Ogn/0Vulg=';

const steamBot = new SteamBot(botAccountName, botPassword, botSharedSecret, botIdentitySecret);
const steamGuardHelper = new SteamGuardHelper();

let isLoggingIn = false;
let hasLoggedIn = false;

async function loginBot(req, res) {
try {
await steamGuardHelper.login(botAccountName, botPassword, botSharedSecret);
hasLoggedIn = true;
res.json({ success: true, message: 'Bot logged in successfully with Steam Mobile Authenticator API' });
} catch (error) {
res.status(500).json({ success: false, message: 'Failed to login bot', error: error.message });
}
}

const SteamID = require('steamid');

async function sendTrade(req, res) {
try {
const { tradeUrl, itemAssetId } = req.body;
if (!tradeUrl || !itemAssetId) {
return res.status(400).json({ success: false, message: 'tradeUrl and itemAssetId are required' });
}


// Convert tradeUrl to partnerSteamId
const partnerSteamId = await new Promise((resolve, reject) => {
  steamBot.community.getSteamIdFromTradeURL(tradeUrl, (err, steamId) => {
    if (err) {
      return reject(err);
    }
    resolve(steamId.getSteamID64());
  });
});

// Get bot inventory
const inventory = await new Promise((resolve, reject) => {
  steamBot.manager.getInventoryContents(730, 2, true, (err, items) => {
    if (err) {
      return reject(err);
    }
    resolve(items);
  });
});

// Find item by assetid
const itemToGive = inventory.find(item => item.assetid === itemAssetId);
if (!itemToGive) {
  return res.status(404).json({ success: false, message: 'Item not found in bot inventory' });
}

// Send trade offer
const status = await steamBot.sendTradeOffer(partnerSteamId, [itemToGive], []);

res.json({ success: true, status });
} catch (error) {
res.status(500).json({ success: false, message: 'Failed to send trade offer', error: error.message });
}
}

async function getSteamInventory(req, res) {
try {
if (!hasLoggedIn) {
if (!isLoggingIn) {
isLoggingIn = true;
await steamBot.login();
hasLoggedIn = true;
isLoggingIn = false;
} else {
// Wait until login is finished by another request
while (isLoggingIn) {
await new Promise(resolve => setTimeout(resolve, 100));
}
}
}
const inventory = await new Promise((resolve, reject) => {
steamBot.manager.getInventoryContents(730, 2, true, (err, items) => {
if (err) {
return reject(err);
}
resolve(items);
});
});
res.json({ success: true, inventory });
} catch (error) {
res.status(500).json({ success: false, message: 'Failed to get Steam inventory', error: error.message });
}
}

module.exports = {
loginBot,
sendTrade,
getSteamInventory,
};