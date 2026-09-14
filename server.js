const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STORAGE_FILE = path.join(DATA_DIR, 'storage.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial storage seed
const initialData = {
  presenceCount: 128,
  presenceDevices: {},
  deviceSecretCounts: {},
  secrets: []
};

// Safe helper to read storage
function readStorage() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(initialData, null, 2), 'utf8');
      return { ...initialData };
    }
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const validSecrets = (Array.isArray(parsed.secrets) ? parsed.secrets : [])
      .filter(s => s && typeof s === 'object' && typeof s.id === 'string' && typeof s.text === 'string' && s.text.trim().length > 0);

    return {
      presenceCount: typeof parsed.presenceCount === 'number' ? parsed.presenceCount : 0,
      presenceDevices: parsed.presenceDevices && typeof parsed.presenceDevices === 'object' ? parsed.presenceDevices : {},
      deviceSecretCounts: parsed.deviceSecretCounts && typeof parsed.deviceSecretCounts === 'object' ? parsed.deviceSecretCounts : {},
      secrets: validSecrets
    };
  } catch (err) {
    console.error('Error reading storage.json, using fallback:', err.message);
    return { ...initialData };
  }
}

// Atomic helper to write storage
function writeStorage(data) {
  try {
    const tempFile = `${STORAGE_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, STORAGE_FILE);
    return true;
  } catch (err) {
    console.error('Error writing storage.json:', err.message);
    return false;
  }
}

app.use(cors());
app.use(express.json());
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to extract device ID
function getDeviceId(req) {
  const fromHeader = req.headers['x-device-id'];
  const fromBody = req.body && req.body.deviceId;
  const fromQuery = req.query && req.query.deviceId;
  const id = fromHeader || fromBody || fromQuery;
  return (typeof id === 'string' && id.trim().length > 0) ? id.trim() : null;
}

// API: Get presence count and device status
app.get('/api/presence', (req, res) => {
  const data = readStorage();
  const deviceId = getDeviceId(req);

  const hasLeftPresence = deviceId ? Boolean(data.presenceDevices[deviceId]) : false;
  const secretCount = deviceId ? (data.deviceSecretCounts[deviceId] || 0) : 0;
  const secretsRemaining = Math.max(0, 2 - secretCount);

  res.json({
    count: data.presenceCount,
    hasLeftPresence,
    secretCount,
    secretsRemaining,
    totalSecrets: data.secrets.length
  });
});

// API: Increment presence count (once per device)
app.post('/api/presence/increment', (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) {
    return res.status(400).json({ error: 'Device identifier required.' });
  }

  const data = readStorage();

  if (data.presenceDevices[deviceId]) {
    return res.status(403).json({
      error: 'Presence has already been recorded for this device.',
      hasLeftPresence: true,
      count: data.presenceCount
    });
  }

  data.presenceDevices[deviceId] = new Date().toISOString();
  data.presenceCount += 1;
  writeStorage(data);

  res.json({
    success: true,
    count: data.presenceCount,
    hasLeftPresence: true
  });
});

// API: Submit anonymous secret to the void (max 2 per device)
app.post('/api/secrets', (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) {
    return res.status(400).json({ error: 'Device identifier required.' });
  }

  const { secret } = req.body;
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ error: 'A secret must be provided.' });
  }

  const trimmed = secret.trim();
  if (trimmed.length === 0) {
    return res.status(400).json({ error: 'Secret cannot be empty.' });
  }

  if (trimmed.length > 500) {
    return res.status(400).json({ error: 'Secret cannot exceed 500 characters.' });
  }

  const data = readStorage();
  const currentCount = data.deviceSecretCounts[deviceId] || 0;

  if (currentCount >= 2) {
    return res.status(403).json({
      error: 'This device has already offered the maximum of 2 secrets to the void.',
      secretsRemaining: 0
    });
  }

  // Record increment for device
  data.deviceSecretCounts[deviceId] = currentCount + 1;
  const remaining = 2 - data.deviceSecretCounts[deviceId];

  // Completely anonymous secret storage (no device identifier attached to secret record)
  const newSecret = {
    id: 'sec_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    text: trimmed,
    timestamp: new Date().toISOString()
  };

  data.secrets.push(newSecret);
  writeStorage(data);

  res.json({
    success: true,
    message: 'Whispered into the void.',
    totalSecrets: data.secrets.length,
    secretCount: data.deviceSecretCounts[deviceId],
    secretsRemaining: remaining
  });
});

// --- VAULT / ADMIN CONFIGURATION ---
const VAULT_PASSWORD = process.env.VAULT_PASSWORD || '6digga7#jesus';
const crypto = require('crypto');
// In-memory active session tokens for vault
const activeTokens = new Set();

function verifyVaultAuth(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const directPass = req.headers['x-vault-password'];

  if (directPass === VAULT_PASSWORD) return true;
  if (token && activeTokens.has(token)) return true;
  return false;
}

// Vault Auth API
app.post('/api/vault/auth', (req, res) => {
  const { password } = req.body;
  if (password === VAULT_PASSWORD) {
    const token = 'vlt_' + crypto.randomBytes(24).toString('hex');
    activeTokens.add(token);
    return res.json({ success: true, token });
  }
  return res.status(401).json({ error: 'Incorrect passphrase.' });
});

// Vault Secrets List API (Protected)
app.get('/api/vault/secrets', (req, res) => {
  if (!verifyVaultAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized access to the void vault.' });
  }

  const data = readStorage();
  res.json({
    success: true,
    presenceCount: data.presenceCount,
    totalDevices: Object.keys(data.presenceDevices || {}).length,
    totalSecrets: data.secrets.length,
    secrets: data.secrets.slice().reverse() // Most recent first
  });
});

// Vault Delete Secret API (Protected)
app.delete('/api/vault/secrets/:id', (req, res) => {
  if (!verifyVaultAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const { id } = req.params;
  const data = readStorage();
  const initialLength = data.secrets.length;
  data.secrets = data.secrets.filter(s => s.id !== id);

  if (data.secrets.length !== initialLength) {
    writeStorage(data);
    return res.json({ success: true, message: 'Whisper dissolved.' });
  }
  return res.status(404).json({ error: 'Secret not found.' });
});

// Vault HTML Route
app.get(['/void-vault', '/secrets'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vault.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✨ Presence & Void server running gracefully at http://localhost:${PORT}`);
  console.log(`🗝️  Void Vault accessible at http://localhost:${PORT}/void-vault`);
});

