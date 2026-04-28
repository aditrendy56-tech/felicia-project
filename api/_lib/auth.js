import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'felicia_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payload, secret) {
  return encodeBase64Url(
    crypto.createHmac('sha256', secret).update(payload).digest()
  );
}

function parseCookies(req) {
  const raw = req?.headers?.cookie || '';
  const pairs = raw.split(';');
  const cookies = {};

  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

function createSessionToken(secret) {
  const payloadObj = {
    ver: 1,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const payload = encodeBase64Url(JSON.stringify(payloadObj));
  const sig = signPayload(payload, secret);
  return `${payload}.${sig}`;
}

function verifySessionToken(token, secret) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return false;

    const expected = signPayload(payload, secret);
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

    const payloadObj = JSON.parse(decodeBase64Url(payload));
    const exp = Number(payloadObj?.exp || 0);
    if (!Number.isFinite(exp) || exp <= Date.now()) return false;

    return true;
  } catch {
    return false;
  }
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieValue]);
    return;
  }
  res.setHeader('Set-Cookie', [existing, cookieValue]);
}

export function getRequestBearerToken(req) {
  const authHeader = req?.headers?.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

export function isAuthorizedRequest(req) {
  const secret = process.env.API_SECRET || '';
  if (!secret) return false;

  const bearer = getRequestBearerToken(req);
  if (bearer && bearer === secret) return true;

  const cookies = parseCookies(req);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  return verifySessionToken(sessionToken, secret);
}

export function requireApiAuth(req, res) {
  if (isAuthorizedRequest(req)) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

export function setAuthSessionCookie(res) {
  const secret = process.env.API_SECRET || '';
  if (!secret) {
    throw new Error('API_SECRET not configured');
  }

  const token = createSessionToken(secret);
  const isProd = process.env.NODE_ENV === 'production';
  const cookie = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    isProd ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  appendSetCookie(res, cookie);
}

export function clearAuthSessionCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookie = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    isProd ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  appendSetCookie(res, cookie);
}