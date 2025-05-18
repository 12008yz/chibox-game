const SteamCommunity = require('steamcommunity');
const SteamTotp = require('steam-totp');

class SteamGuardHelper {
  constructor() {
    this.community = new SteamCommunity();
  }

  /**
   * Логин с использованием Steam Mobile Authenticator API
   * @param {string} accountName - Логин Steam аккаунта
   * @param {string} password - Пароль Steam аккаунта
   * @param {string} sharedSecret - Секретный ключ Steam Guard (botSharedSecret)
   */
  async login(accountName, password, sharedSecret) {
    return new Promise((resolve, reject) => {
      const twoFactorCode = SteamTotp.generateAuthCode(sharedSecret);
      this.community.login({
        accountName,
        password,
        twoFactorCode
      }, (err, sessionID, cookies, steamguard) => {
        if (err) {
          console.error('SteamCommunity login error:', err);
          return reject(err);
        }
        this.community.startConfirmationChecker(10000, sharedSecret);
        console.log('Logged into SteamCommunity as ' + accountName);
        resolve({ sessionID, cookies, steamguard });
      });
    });
  }

  /**
   * Подтверждение торгового предложения через мобильный аутентификатор
   * @param {string} identitySecret - identitySecret для подтверждения
   * @param {string} offerId - ID торгового предложения
   */
  async confirmTrade(identitySecret, offerId) {
    return new Promise((resolve, reject) => {
      this.community.acceptConfirmationForObject(identitySecret, offerId, (err) => {
        if (err) {
          console.error('Failed to confirm trade offer:', err);
          return reject(err);
        }
        console.log('Trade offer confirmed:', offerId);
        resolve();
      });
    });
  }
}

module.exports = SteamGuardHelper;
