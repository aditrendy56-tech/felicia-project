// Middleware helpers for external runtime endpoints
export function setExternalCorsHeaders(req, res) {
  const origin = req.headers?.origin || '';

  // Allow localhost and LiveKit-ish origins (dev domains)
  const allowed = (
    origin && (
      origin.startsWith('http://localhost') ||
      origin.startsWith('https://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      origin.includes('livekit')
    )
  );

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-felicia-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
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
