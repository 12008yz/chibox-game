const selfsigned = require('selfsigned');
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 3650 });
require('fs').writeFileSync('server.key', pems.private);
require('fs').writeFileSync('server.cert', pems.cert);
console.log('SSL-сертификат для локалки создан!');