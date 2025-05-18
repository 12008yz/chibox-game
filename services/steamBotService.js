const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');
const SteamTotp = require('steam-totp');

let instance = null;
let hasLoggedIn = false;

class SteamBot {
  constructor(accountName, password, sharedSecret, identitySecret) {
    if (instance) {
      return instance;
    }
    this.client = new SteamUser();
    this.community = new SteamCommunity();
    this.manager = new TradeOfferManager({
      steam: this.client,
      community: this.community,
      language: 'en',
    });
    this.accountName = accountName;
    this.password = password;
    this.sharedSecret = sharedSecret;
    this.identitySecret = identitySecret;
    this.loggedIn = false;
    instance = this;
  }

  async login() {
    if (hasLoggedIn) {
      console.log('Already logged in, skipping login.');
      return;
    }
    return new Promise((resolve, reject) => {
      // Генерируем код 2FA для первого логина
      const twoFactorCode = SteamTotp.generateAuthCode(this.sharedSecret);
      const logOnOptions = {
        accountName: this.accountName,
        password: this.password,
        twoFactorCode: twoFactorCode
      };
      console.log('Attempting Steam login...');
      this.client.logOn(logOnOptions);

      this.client.once('loggedOn', () => {
        this.loggedIn = true;
        hasLoggedIn = true;
        console.log('Logged into Steam as ' + this.client.steamID.getSteam3RenderedID());
        // Ждать webSession!
      });

      this.client.once('webSession', (sessionID, cookies) => {
        console.log('Steam webSession received, setting cookies to manager & community...');
        this.manager.setCookies(cookies);
        this.community.setCookies(cookies);
        this.community.startConfirmationChecker(10000, this.identitySecret);
        console.log('Cookies set, confirmation checker started, bot now fully operational.');
        resolve();
      });

      this.client.once('error', (err) => {
        console.error('Steam login error:', err);
        reject(err);
      });

      // Steam Guard обработка - всегда отправлять актуальный мобильный код из sharedSecret
      this.client.on('steamGuard', (domain, callback) => {
        if (!domain) {
          const code = SteamTotp.generateAuthCode(this.sharedSecret);
          console.log('Generated Steam Guard (2FA Mobile) code:', code);
          callback(code);
        } else {
          console.error('Steam Guard requires code from email:', domain);
          callback(null); // Если вдруг нужен код с почты — ручное вмешательство
        }
      });
    });
  }

  async buyItem(marketHashName, price) {
    throw new Error('Buying items programmatically is not supported directly by SteamUser library.');
  }

  async sendTradeOffer(partnerSteamId, itemsToGive, itemsToReceive = []) {
    return new Promise((resolve, reject) => {
      const offer = this.manager.createOffer(partnerSteamId);
      if (itemsToGive.length > 0) {
        offer.addMyItems(itemsToGive);
      }
      if (itemsToReceive.length > 0) {
        offer.addTheirItems(itemsToReceive);
      }
      offer.send(async (err, status) => {
        if (err) {
          console.error('Failed to send trade offer:', err);
          return reject(err);
        }
        console.log('Trade offer sent. Status:', status);
        try {
          await this.community.acceptConfirmationForObject(this.identitySecret, offer.id);
          console.log('Trade offer confirmed:', offer.id);
        } catch (confirmErr) {
          console.error('Failed to confirm trade offer:', confirmErr);
          return reject(confirmErr);
        }
        resolve(status);
      });
    });
  }

  async acceptTradeOffer(offerId) {
    return new Promise((resolve, reject) => {
      this.manager.getOffer(offerId).accept(async (err) => {
        if (err) {
          console.error('Failed to accept trade offer:', err);
          return reject(err);
        }
        console.log('Trade offer accepted:', offerId);
        try {
          await this.community.acceptConfirmationForObject(this.identitySecret, offerId);
          console.log('Trade offer acceptance confirmed:', offerId);
        } catch (confirmErr) {
          console.error('Failed to confirm trade acceptance:', confirmErr);
          return reject(confirmErr);
        }
        resolve();
      });
    });
  }
}

module.exports = SteamBot;
