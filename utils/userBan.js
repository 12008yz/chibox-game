'use strict';

/**
 * Активная блокировка: is_banned и (бессрочно или срок ещё не истёк).
 */
function isUserBanned(user) {
  if (!user || !user.is_banned) return false;
  if (!user.ban_expires) return true;
  return new Date(user.ban_expires) > new Date();
}

module.exports = { isUserBanned };
