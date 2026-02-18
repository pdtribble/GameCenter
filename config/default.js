require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DEPLOYMENT: process.env.DEPLOYMENT || 'proxmox',       // 'proxmox' | 'pi'
  DB_PATH: process.env.DB_PATH || './gamecenter.db',
  SESSION_SECRET: process.env.SESSION_SECRET || 'changeme',
  SYNC_ENABLED: process.env.SYNC_ENABLED === 'true' || false,
  SYNC_TARGET_URL: process.env.SYNC_TARGET_URL || '',
  SYNC_API_KEY: process.env.SYNC_API_KEY || '',
  SYNC_INTERVAL_MS: parseInt(process.env.SYNC_INTERVAL_MS) || 120000,
  HOTSPOT_MODE: process.env.HOTSPOT_MODE === 'true' || false,
  LOBBY_IDLE_TIMEOUT_MS: parseInt(process.env.LOBBY_IDLE_TIMEOUT_MS) || 1800000,
  DISCONNECT_HOLD_MS: parseInt(process.env.DISCONNECT_HOLD_MS) || 120000,
  JOIN_CODE_LENGTH: 4,
  ADMIN_PIN: process.env.ADMIN_PIN || 'admin',
  LOW_POWER_IDLE_MS: parseInt(process.env.LOW_POWER_IDLE_MS) || 600000,
};
