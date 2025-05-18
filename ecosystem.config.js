module.exports = {
  apps: [
    {
      name: 'steam-bot-service',
      script: './app.js',
      watch: true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
