const db = require('../models');

/** Нормализация кода ссылки: в БД хранятся в верхнем регистре */
function normalizeCode(code) {
  return code && typeof code === 'string' ? code.trim().toUpperCase() : '';
}

/**
 * Увеличить счётчик переходов по реферальной ссылке (без логина).
 * @param {string} code - код ссылки (из URL)
 * @returns {Promise<{ success: boolean, link?: object, error?: string }>}
 */
async function trackClick(code) {
  const cleanCode = normalizeCode(code);
  if (!cleanCode) {
    return { success: false, error: 'invalid_code' };
  }
  const link = await db.ReferralLink.findOne({
    where: { code: cleanCode },
    include: [{ model: db.Streamer, as: 'streamer', where: { is_active: true }, required: true }]
  });
  if (!link) {
    return { success: false, error: 'link_not_found' };
  }
  await link.increment('clicks_count');
  return { success: true, link: { id: link.id, code: link.code, label: link.label } };
}

/**
 * Привязать реферера к пользователю при первом логине (Steam).
 * Вызывать после создания/поиска user в passport.
 * @param {string} userId - UUID пользователя
 * @param {string} referralCode - код из cookie/session (streamer.chibox-site.com/CODE)
 * @returns {Promise<{ bound: boolean, streamer?: object, error?: string }>}
 */
async function bindReferrer(userId, referralCode) {
  const code = normalizeCode(referralCode);
  if (!userId || !code) {
    return { bound: false };
  }
  const user = await db.User.findByPk(userId);
  if (!user || user.referred_by_streamer_id) {
    return { bound: false };
  }
  const link = await db.ReferralLink.findOne({
    where: { code },
    include: [{ model: db.Streamer, as: 'streamer', where: { is_active: true }, required: true }]
  });
  if (!link) {
    return { bound: false, error: 'link_not_found' };
  }

  const streamer = link.streamer;
  const transaction = await db.sequelize.transaction();
  try {
    await user.update(
      {
        referred_by_streamer_id: streamer.id,
        referred_by_link_id: link.id,
        referred_at: new Date()
      },
      { transaction }
    );
    await link.increment('registrations_count', { transaction });

    const fixedReg = parseFloat(streamer.fixed_registration) || 0;
    if (fixedReg > 0) {
      const newBalance = parseFloat(streamer.balance) + fixedReg;
      await streamer.update({ balance: newBalance }, { transaction });
      await db.StreamerEarning.create(
        {
          streamer_id: streamer.id,
          type: 'registration',
          amount: fixedReg,
          referral_link_id: link.id,
          referred_user_id: userId
        },
        { transaction }
      );
    }
    await transaction.commit();
    return {
      bound: true,
      streamer: {
        id: streamer.id,
        username: streamer.user?.username,
        avatar_url: streamer.user?.steam_avatar_url || streamer.user?.avatar_url
      }
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Начислить стримеру за депозит реферала (процент и/или фикс за первый депозит).
 * Вызывать из payment webhook при status = completed, purpose = deposit.
 * @param {string} userId - пользователь, который пополнил
 * @param {number} depositAmountChiCoins - сумма в ChiCoins, зачисленная на баланс
 * @param {string} paymentId - UUID платежа
 */
async function onReferralDeposit(userId, depositAmountChiCoins, paymentId) {
  const user = await db.User.findByPk(userId, {
    attributes: ['id', 'referred_by_streamer_id', 'referred_by_link_id']
  });
  if (!user || !user.referred_by_streamer_id) return;

  const streamer = await db.Streamer.findByPk(user.referred_by_streamer_id);
  if (!streamer || !streamer.is_active) return;

  const amount = parseFloat(depositAmountChiCoins) || 0;
  if (amount <= 0) return;

  const isFirstDeposit = await db.Payment.count({
    where: {
      user_id: userId,
      status: 'completed',
      purpose: 'deposit'
    }
  }) <= 1;

  const transaction = await db.sequelize.transaction();
  try {
    let totalEarned = 0;

    if (isFirstDeposit) {
      const fixedFirst = parseFloat(streamer.fixed_first_deposit) || 0;
      if (fixedFirst > 0) {
        totalEarned += fixedFirst;
        await db.StreamerEarning.create(
          {
            streamer_id: streamer.id,
            type: 'first_deposit',
            amount: fixedFirst,
            referral_link_id: user.referred_by_link_id || null,
            referred_user_id: userId,
            payment_id: paymentId
          },
          { transaction }
        );
      }
      if (user.referred_by_link_id) {
        await db.ReferralLink.increment(
          'first_deposits_count',
          { by: 1, where: { id: user.referred_by_link_id }, transaction }
        );
      }
    }

    const percent = parseFloat(streamer.percent_from_deposit) || 0;
    if (percent > 0) {
      const percentAmount = Math.round((amount * percent) / 100 * 100) / 100;
      if (percentAmount > 0) {
        totalEarned += percentAmount;
        await db.StreamerEarning.create(
          {
            streamer_id: streamer.id,
            type: 'deposit_percent',
            amount: percentAmount,
            referral_link_id: user.referred_by_link_id || null,
            referred_user_id: userId,
            payment_id: paymentId
          },
          { transaction }
        );
      }
    }

    if (totalEarned > 0) {
      const newBalance = parseFloat(streamer.balance) + totalEarned;
      await streamer.update({ balance: newBalance }, { transaction });
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Данные стримера для модалки «кого пригласил» и «какие бонусы».
 * Публичный эндпоинт по коду ссылки.
 */
async function getReferralInfoByCode(code) {
  const cleanCode = normalizeCode(code);
  if (!cleanCode) return null;
  const link = await db.ReferralLink.findOne({
    where: { code: cleanCode },
    include: [
      {
        model: db.Streamer,
        as: 'streamer',
        where: { is_active: true },
        required: true,
        include: [{ model: db.User, as: 'user', attributes: ['id', 'username', 'steam_avatar_url', 'avatar_url'] }]
      }
    ]
  });
  if (!link) return null;
  const streamer = link.streamer;
  const user = streamer.user;
  return {
    code: link.code,
    streamer: {
      id: streamer.id,
      username: user?.username || 'Стример',
      avatar_url: user?.avatar_url || user?.steam_avatar_url
    },
    bonuses: {
      percent_from_deposit: parseFloat(streamer.percent_from_deposit) || 0,
      fixed_registration: parseFloat(streamer.fixed_registration) || 0,
      fixed_first_deposit: parseFloat(streamer.fixed_first_deposit) || 0
    }
  };
}

module.exports = {
  trackClick,
  bindReferrer,
  onReferralDeposit,
  getReferralInfoByCode
};
