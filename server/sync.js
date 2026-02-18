const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const config = require('../config/default');

let syncTimer = null;
let lastSyncAt = null;
let lastSyncStatus = 'offline';
let ioRef = null;

function start(io) {
  if (!config.SYNC_ENABLED) return;
  ioRef = io;
  console.log(`[sync] Starting sync to ${config.SYNC_TARGET_URL} every ${config.SYNC_INTERVAL_MS}ms`);
  runSync();
  syncTimer = setInterval(runSync, config.SYNC_INTERVAL_MS);
}

function stop() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

async function runSync() {
  const online = await checkHealth();
  lastSyncAt = new Date().toISOString();
  lastSyncStatus = online ? 'online' : 'offline';

  if (ioRef) {
    ioRef.emit('server:game_state', { syncStatus: lastSyncStatus, lastSyncAt });
  }

  if (!online) {
    console.log('[sync] Offline — skipping sync');
    return;
  }

  const pending = db.prepare("SELECT * FROM sync_queue WHERE synced = 0 ORDER BY created_at ASC").all();
  console.log(`[sync] Processing ${pending.length} pending records`);

  for (const record of pending) {
    try {
      await postRecord(record);
      db.prepare('UPDATE sync_queue SET synced = 1 WHERE id = ?').run(record.id);
    } catch (err) {
      console.error(`[sync] Failed to sync record ${record.id}: ${err.message}`);
    }
  }
}

function checkHealth() {
  return new Promise((resolve) => {
    const url = `${config.SYNC_TARGET_URL}/health`;
    const lib = url.startsWith('https') ? https : http;
    try {
      const req = lib.get(url, { timeout: 5000 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    } catch {
      resolve(false);
    }
  });
}

function postRecord(record) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(record);
    const url = new URL(`${config.SYNC_TARGET_URL}/api/sync`);
    const lib = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-sync-key': config.SYNC_API_KEY,
      },
      timeout: 10000,
    };

    const req = lib.request(options, (res) => {
      if (res.statusCode === 200) resolve();
      else reject(new Error(`HTTP ${res.statusCode}`));
      res.resume();
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// Queue a record for sync (called from game-runner / db writes)
function enqueue(tableName, recordId, payload) {
  if (!config.SYNC_ENABLED) return;
  db.prepare(`
    INSERT INTO sync_queue (id, table_name, record_id, payload)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), tableName, recordId, JSON.stringify(payload));
}

function getStatus() {
  return { status: lastSyncStatus, lastSyncAt };
}

module.exports = { start, stop, enqueue, getStatus };
