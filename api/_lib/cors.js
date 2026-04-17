/**
 * CORS & Security Headers Handler
 * Centralized CORS policy + security headers management
 * 
 * CRITICAL: NODE_ENV must be set to 'production' on Vercel for CORS whitelist enforcement
 */

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://felicia-project.vercel.app',
  'https://www.felicia-project.vercel.app',
];

const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV !== 'production';

// Warn if production detected but NODE_ENV not properly set
if (typeof process.env.NODE_ENV === 'undefined' && NODE_ENV === 'development') {
  console.warn('[CORS] ⚠️ WARNING: NODE_ENV is undefined! CORS will allow wildcard (*) origin. Set NODE_ENV=production on Vercel.');
}

/**
 * Apply CORS headers dengan whitelist
 * Jika isDev, terima localhost; kalau prod, hanya domain terdaftar
 * 
 * SECURITY: Jika production mode tidak terdeteksi, akan fall back to '*' (PERMISSIVE)
 * Pastikan Vercel environment variable NODE_ENV=production sudah diset
 */
export function setCorsHeaders(res, req = null) {
  const origin = req?.headers?.origin || '';
  
  let allowedOrigin = '*'; // Default fallback (permissive, untuk dev)
  
  // Verify environment
  const envStatus = {
    nodeEnv: NODE_ENV,
    isProduction: !isDevelopment,
    envCheckPassed: NODE_ENV === 'production' && process.env.NODE_ENV === 'production',
  };

  if (!isDevelopment) {
    // Production mode: enforce whitelist
    if (ALLOWED_ORIGINS.includes(origin)) {
      allowedOrigin = origin;
      console.log('[CORS] ✅ Whitelist match:', origin);
    } else {
      // Reject non-whitelisted origin in production
      allowedOrigin = ALLOWED_ORIGINS[0]; // Fallback ke default, browser akan block anyway
      console.warn('[CORS] ⚠️ Rejected origin in production:', origin, 'NODE_ENV:', NODE_ENV);
    }
  } else {
    // Development mode: accept localhost + any origin with warning
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      allowedOrigin = origin;
    } else if (origin) {
      console.warn('[CORS] Non-localhost origin in dev mode:', origin);
    }
  }

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Version');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Debug header (remove in production if too verbose)
  res.setHeader('X-CORS-Debug', `env=${NODE_ENV},origin=${allowedOrigin},check=${envStatus.envCheckPassed ? 'pass' : 'warn'}`);
}

/**
 * Apply security headers untuk semua response
 */
export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

/**
 * Handle OPTIONS preflight request
 */
export function handleOptions(res, req = null) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);
  res.status(200).end();
}

/**
 * Verify CORS environment is properly configured (call once on server startup)
 */
export function verifyCorsEnvironment() {
  const checks = {
    nodeEnvSet: typeof process.env.NODE_ENV !== 'undefined',
    nodeEnvIsProduction: process.env.NODE_ENV === 'production',
    allowedOriginsPresent: ALLOWED_ORIGINS.length > 0,
  };
  
  const allOk = checks.nodeEnvSet && checks.nodeEnvIsProduction && checks.allowedOriginsPresent;
  
  if (!allOk) {
    console.warn('[CORS] Environment verification failed:', {
      status: allOk ? 'OK' : 'NEEDS_ATTENTION',
      nodeEnvSet: checks.nodeEnvSet,
      nodeEnvIsProduction: checks.nodeEnvIsProduction,
      allowedOriginsPresent: checks.allowedOriginsPresent,
      recommendation: !checks.nodeEnvSet 
        ? 'Set NODE_ENV=production in Vercel Project Settings'
        : 'CORS whitelist mode is active',
    });
  } else {
    console.log('[CORS] ✅ Environment verification passed: production CORS whitelist active');
  }
  
  return allOk;
}
