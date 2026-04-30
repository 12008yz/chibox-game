const axios = require('axios');

const ALLOWED_STEAM_HOSTS = new Set([
  'community.fastly.steamstatic.com',
  'steamcommunity-a.akamaihd.net',
  'cdn.akamai.steamstatic.com',
  'steamstatic.com',
]);

function isAllowedSteamImageUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    if (!parsed.pathname.includes('/economy/image/')) return false;
    return ALLOWED_STEAM_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

async function proxySteamImage(req, res) {
  const rawUrl = String(req.query.url || '');
  if (!rawUrl || !isAllowedSteamImageUrl(rawUrl)) {
    return res.status(400).json({ success: false, message: 'Invalid Steam image URL' });
  }

  try {
    const upstream = await axios.get(rawUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'ChiBox-Image-Proxy/1.0',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const contentType = upstream.headers['content-type'] || 'image/jpeg';
    const contentLength = upstream.headers['content-length'];

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    return res.send(Buffer.from(upstream.data));
  } catch (error) {
    return res.status(502).json({ success: false, message: 'Failed to fetch Steam image' });
  }
}

module.exports = { proxySteamImage };
