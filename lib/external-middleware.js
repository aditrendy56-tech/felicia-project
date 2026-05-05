// Middleware helpers for external runtime endpoints
export function setExternalCorsHeaders(req, res) {
  const origin = req.headers?.origin || '';

  const allowed = isAllowedExternalOrigin(origin);

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-felicia-key');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

function isAllowedExternalOrigin(origin = '') {
  if (!origin) return false;

  const normalized = String(origin).trim().toLowerCase();

  const localhostAllowed =
    normalized.startsWith('http://localhost') ||
    normalized.startsWith('https://localhost') ||
    normalized.startsWith('http://127.0.0.1') ||
    normalized.startsWith('https://127.0.0.1');

  const livekitAllowed =
    normalized.includes('livekit.cloud') ||
    normalized.includes('livekit.io') ||
    normalized.includes('.livekit.');

  const envOrigins = String(process.env.FELICIA_EXTERNAL_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const customAllowed = envOrigins.includes(normalized);

  return localhostAllowed || livekitAllowed || customAllowed;
}

export function validateExternalApiKey(req, res) {
  const header = req.headers && (req.headers['x-felicia-key'] || req.headers['X-Felicia-Key']);
  const secret = process.env.FELICIA_EXTERNAL_API_KEY || '';

  if (!secret || !header) return false;
  return String(header).trim() === String(secret).trim();
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    // Respond to preflight quickly
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}
