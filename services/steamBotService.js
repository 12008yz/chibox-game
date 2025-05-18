const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');

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
      const logOnOptions = {
        accountName: this.accountName,
        password: this.password,
        twoFactorCode: null, // SteamCommunity будет обрабатывать 2FA
      };

      this.client.logOn(logOnOptions);

      this.client.on('loggedOn', () => {
        this.loggedIn = true;
        hasLoggedIn = true;
        console.log('Logged into Steam as ' + this.client.steamID.getSteam3RenderedID());
        resolve();
      });

      this.client.on('error', (err) => {
        console.error('Steam login error:', err);
        reject(err);
      });

      this.client.on('steamGuard', (domain, callback) => {
        // SteamCommunity будет обрабатывать 2FA, поэтому здесь можно оставить пустым или логировать
        console.log('Steam Guard code requested, but handled by SteamCommunity.');
        callback(null);
      });
    });
  }

  async buyItem(marketHashName, price) {
    // This is a placeholder function.
    // Buying items from Steam Community Market programmatically is restricted.
    // Usually requires web scraping or using Steam Market API with session cookies.
    // Implementing this requires advanced handling beyond SteamUser library.
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

        // Подтверждение торгового предложения через мобильный аутентификатор
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

        // Подтверждение принятия торгового предложения через мобильный аутентификатор
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
