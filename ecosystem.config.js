module.exports = {
  apps: [
    {
      name: 'backend-server',
      script: 'bin/www',
      watch: true,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'daily-case-issuer',
      script: 'scripts/dailyCaseIssuer.js',
      watch: false,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
