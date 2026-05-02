'use strict';

/**
 * Общий чат: запрет ссылок (как в тексте, так и обходы без схемы).
 * Держите в синхроне с frontend/src/utils/globalChatLinks.ts
 */
function globalChatContainsProhibitedLink(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (/https?:\/\//i.test(text)) return true;
  if (/www\./i.test(text)) return true;
  if (
    /\b(?:t\.me\/|telegram\.me\/|vk\.com\/|vkontakte\.ru\/|discord\.gg\/|discord\.com\/|youtu\.be\/|youtube\.com\/|twitch\.tv\/|steamcommunity\.com\/|steampowered\.com\/)/i.test(
      text
    )
  ) {
    return true;
  }
  const tldPath =
    /\b[a-z0-9][a-z0-9-]{0,252}\.(?:ru|com|net|org|io|gg|me|tv|xyz|info|app|dev|co|su|biz|online|site|studio)\/[^\s]*/i;
  if (tldPath.test(text)) return true;
  const bare =
    /\b[a-z0-9][a-z0-9-]{0,252}\.(?:ru|com|net|org|io|gg|me|tv|xyz|info|app|co|su)\b(?=\s|$|[,.!?;:])/i;
  if (bare.test(text)) return true;
  return false;
}

module.exports = { globalChatContainsProhibitedLink };
