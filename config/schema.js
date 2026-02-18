const config = require('./default');

const REQUIRED_STRINGS = ['SESSION_SECRET'];
const VALID_DEPLOYMENTS = ['proxmox', 'pi'];
const VALID_ENVS = ['development', 'production', 'test'];

function validate(cfg) {
  const errors = [];

  for (const key of REQUIRED_STRINGS) {
    if (!cfg[key] || cfg[key] === 'changeme') {
      errors.push(`${key} must be set to a non-default value in production`);
    }
  }

  if (!VALID_DEPLOYMENTS.includes(cfg.DEPLOYMENT)) {
    errors.push(`DEPLOYMENT must be one of: ${VALID_DEPLOYMENTS.join(', ')}`);
  }

  if (!VALID_ENVS.includes(cfg.NODE_ENV)) {
    errors.push(`NODE_ENV must be one of: ${VALID_ENVS.join(', ')}`);
  }

  if (cfg.PORT < 1 || cfg.PORT > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  if (cfg.SYNC_ENABLED && !cfg.SYNC_TARGET_URL) {
    errors.push('SYNC_TARGET_URL is required when SYNC_ENABLED=true');
  }

  if (cfg.SYNC_ENABLED && !cfg.SYNC_API_KEY) {
    errors.push('SYNC_API_KEY is required when SYNC_ENABLED=true');
  }

  if (cfg.NODE_ENV === 'production') {
    const warnings = [];
    if (cfg.ADMIN_PIN === 'admin') warnings.push('ADMIN_PIN is set to default value');
    if (cfg.SESSION_SECRET === 'changeme') warnings.push('SESSION_SECRET is set to default value');
    for (const w of warnings) {
      console.warn(`[config] WARNING: ${w}`);
    }
  }

  return errors;
}

const errors = validate(config);
if (errors.length > 0 && config.NODE_ENV === 'production') {
  console.error('[config] Configuration errors:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (errors.length > 0) {
  for (const e of errors) console.warn(`[config] ${e}`);
}

module.exports = { validate };
