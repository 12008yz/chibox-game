'use strict';

/**
 * Tier для отображения в общем чате: только при неистёкшей подписке
 * (согласовано с getCaseStatus / getSafeCrackerStatus).
 */
function getEffectiveSubscriptionTierForChat(userLike) {
  if (!userLike) return 0;
  const tier = Number(userLike.subscription_tier) || 0;
  if (tier <= 0) return 0;
  const exp = userLike.subscription_expiry_date;
  if (!exp) return 0;
  return new Date(exp).getTime() > Date.now() ? tier : 0;
}

module.exports = { getEffectiveSubscriptionTierForChat };
