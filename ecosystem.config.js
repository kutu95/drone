module.exports = {
  apps: [{
    name: 'drone',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: 3002,
      // Environment variables will be loaded from .env.production
      // Do not hardcode secrets here - use .env.production instead
    },
  }]
};

