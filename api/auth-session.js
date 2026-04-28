import { setCorsHeaders, setSecurityHeaders, handleOptions } from './_lib/cors.js';
import {
  clearAuthSessionCookie,
  getRequestBearerToken,
  isAuthorizedRequest,
  setAuthSessionCookie,
} from './_lib/auth.js';

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptions(res, req);
  }

  if (req.method === 'GET') {
    return res.status(200).json({ authenticated: isAuthorizedRequest(req) });
  }

  if (req.method === 'DELETE') {
    clearAuthSessionCookie(res);
    return res.status(200).json({ ok: true, authenticated: false });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.API_SECRET || '';
  const bearer = getRequestBearerToken(req);
  const bodyToken = String(req.body?.token || '').trim();
  const provided = bearer || bodyToken;

  if (!secret || !provided || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    setAuthSessionCookie(res);
    return res.status(200).json({ ok: true, authenticated: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Failed to create session' });
  }
}