import { getSupabase } from './_lib/supabase.js';
import { setCorsHeaders, setSecurityHeaders, handleOptions } from './_lib/cors.js';

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptions(res, req);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || token !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const now = new Date();
    const oneDayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [quotaRes, latestSuccessRes] = await Promise.all([
      supabase
        .from('felicia_commands')
        .select('created_at, status, error_message, input')
        .eq('status', 'quota_limited')
        .gte('created_at', oneDayAgoIso)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('felicia_commands')
        .select('created_at, status')
        .eq('status', 'success')
        .gte('created_at', oneDayAgoIso)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    if (quotaRes.error || latestSuccessRes.error) {
      const error = quotaRes.error || latestSuccessRes.error;
      return res.status(500).json({ error: error?.message || 'Failed to query quota logs' });
    }

    const rows = quotaRes.data || [];
    const latest = rows[0] || null;
    const latestSuccess = (latestSuccessRes.data || [])[0] || null;

    if (!latest) {
      return res.status(200).json({
        now: now.toISOString(),
        state: 'ok',
        warning: null,
        eta: {
          retry_after_seconds: null,
          retry_at_iso: null,
          retry_at_wib: null,
          daily_reset_estimate_wib: formatWib(getNextApproxDailyReset(now)),
          confidence: 'low',
        },
        note: 'Belum ada log quota_limited dalam 24 jam terakhir.',
      });
    }

    const latestQuotaAt = new Date(latest.created_at);
    const latestSuccessAt = latestSuccess?.created_at ? new Date(latestSuccess.created_at) : null;
    const recoveredAfterLatestQuota = Boolean(latestSuccessAt && latestSuccessAt > latestQuotaAt);

    let retryAfterSeconds = null;
    let likelyDailyQuota = false;
    for (const row of rows) {
      const msg = String(row?.error_message || '');
      if (!likelyDailyQuota && isLikelyDailyQuota(msg)) {
        likelyDailyQuota = true;
      }
      if (!Number.isFinite(retryAfterSeconds)) {
        const parsed = extractRetryAfterSeconds(msg);
        if (Number.isFinite(parsed) && parsed > 0) {
          retryAfterSeconds = parsed;
        }
      }
      if (likelyDailyQuota && Number.isFinite(retryAfterSeconds)) {
        break;
      }
    }

    const defaultRateLimitSeconds = 180;
    const effectiveRetryAfter = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds
      : defaultRateLimitSeconds;
    const retryAt = new Date(latestQuotaAt.getTime() + effectiveRetryAfter * 1000);

    const resetAfterLatestQuota = getNextApproxDailyReset(latestQuotaAt);
    const isDailyLimitActive = likelyDailyQuota && now < resetAfterLatestQuota;
    const isRateLimitActive = !likelyDailyQuota && now < retryAt;
    const isLimited = !recoveredAfterLatestQuota && (isDailyLimitActive || isRateLimitActive);

    const nextDailyReset = getNextApproxDailyReset(now);

    const warning = isLimited
      ? (
        isDailyLimitActive
          ? `Limit harian free tier kemungkinan sudah habis. Coba lagi sekitar ${formatWib(nextDailyReset)} WIB.`
          : `Rate limit sementara. Coba lagi sekitar ${formatWib(retryAt)} WIB.`
      )
      : null;

    return res.status(200).json({
      now: now.toISOString(),
      state: isLimited ? (isDailyLimitActive ? 'daily_limited' : 'rate_limited') : 'ok',
      warning,
      latest_event: {
        created_at: latest.created_at,
        input: latest.input,
      },
      eta: {
        retry_after_seconds: effectiveRetryAfter,
        retry_at_iso: retryAt.toISOString(),
        retry_at_wib: `${formatWib(retryAt)} WIB`,
        daily_reset_estimate_wib: `${formatWib(nextDailyReset)} WIB`,
        confidence: isDailyLimitActive ? 'medium' : (isRateLimitActive ? 'high' : 'low'),
      },
      note: recoveredAfterLatestQuota
        ? 'Status quota sudah pulih karena ada command sukses setelah quota_limited terakhir.'
        : 'ETA berasal dari log internal quota_limited dan pola retry provider; reset harian bersifat estimasi.',
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
}

function extractRetryAfterSeconds(message) {
  const text = String(message || '').trim();
  const FALLBACK_RETRY_AFTER = 180; // Default 3 menit jika parsing gagal
  
  if (!text) {
    console.warn('[Quota] extractRetryAfterSeconds: empty message, using fallback', FALLBACK_RETRY_AFTER, 's');
    return FALLBACK_RETRY_AFTER;
  }

  // Pattern 1: "retry in Xs" or "retry in X seconds"
  const retryInMatch = text.match(/retry\s+in\s+([\d.]+)\s*(?:s|seconds)?/i);
  if (retryInMatch?.[1]) {
    const seconds = Number.parseFloat(retryInMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      console.log('[Quota] extractRetryAfterSeconds: matched pattern1 (retry in Xs):', Math.ceil(seconds));
      return Math.ceil(seconds);
    }
  }

  // Pattern 2: "retryDelay": "Xs" or retryDelay: Xs
  const retryDelayMatch = text.match(/retryDelay["']?\s*:\s*["']?([\d.]+)s/i);
  if (retryDelayMatch?.[1]) {
    const seconds = Number.parseFloat(retryDelayMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      console.log('[Quota] extractRetryAfterSeconds: matched pattern2 (retryDelay):', Math.ceil(seconds));
      return Math.ceil(seconds);
    }
  }

  // Pattern 3: "Retry-After: X" header value (common in HTTP errors)
  const retryAfterHeaderMatch = text.match(/retry-after\s*[:\=]\s*["']?([\d.]+)/i);
  if (retryAfterHeaderMatch?.[1]) {
    const seconds = Number.parseFloat(retryAfterHeaderMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      console.log('[Quota] extractRetryAfterSeconds: matched pattern3 (Retry-After header):', Math.ceil(seconds));
      return Math.ceil(seconds);
    }
  }

  // Pattern 4: X minutes (convert ke seconds)
  const minutesMatch = text.match(/([\d.]+)\s*(?:minute|min|m)(?:s|ute)?/i);
  if (minutesMatch?.[1]) {
    const minutes = Number.parseFloat(minutesMatch[1]);
    if (Number.isFinite(minutes) && minutes > 0) {
      const seconds = Math.ceil(minutes * 60);
      console.log('[Quota] extractRetryAfterSeconds: matched pattern4 (X minutes):', seconds);
      return seconds;
    }
  }

  // Pattern 5: "wait X seconds" or "please wait X seconds"
  const waitMatch = text.match(/wait\s+([\d.]+)\s*(?:s|seconds)?/i);
  if (waitMatch?.[1]) {
    const seconds = Number.parseFloat(waitMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      console.log('[Quota] extractRetryAfterSeconds: matched pattern5 (wait X seconds):', Math.ceil(seconds));
      return Math.ceil(seconds);
    }
  }

  // Pattern 6: ISO 8601 duration (e.g., "PT5M" = 5 minutes)
  const durationMatch = text.match(/PT(\d+)M/i);
  if (durationMatch?.[1]) {
    const minutes = Number.parseInt(durationMatch[1], 10);
    if (Number.isFinite(minutes) && minutes > 0) {
      const seconds = Math.ceil(minutes * 60);
      console.log('[Quota] extractRetryAfterSeconds: matched pattern6 (ISO 8601):', seconds);
      return seconds;
    }
  }

  // No pattern matched → use fallback
  console.warn('[Quota] extractRetryAfterSeconds: no pattern matched, using fallback', FALLBACK_RETRY_AFTER, 's');
  console.debug('[Quota] extractRetryAfterSeconds debug:', { message: text.substring(0, 100) });
  return FALLBACK_RETRY_AFTER;
}

function isLikelyDailyQuota(message) {
  const merged = String(message || '').toLowerCase();
  return (
    merged.includes('generaterequestsperdayperprojectpermodel-freetier') ||
    merged.includes('perday') ||
    merged.includes('requests/day') ||
    merged.includes('quota exceeded') ||
    merged.includes('rate_limit_exceeded') ||
    merged.includes('resource_exhausted')
  );
}

function getNextApproxDailyReset(fromDate = new Date()) {
  // Estimasi konservatif: sekitar 14:30 WIB (UTC+7), bisa bergeser sedikit.
  // Disimpan dalam UTC agar konsisten di server.
  const utc = new Date(fromDate);
  const wibOffsetMs = 7 * 60 * 60 * 1000;
  const wibNow = new Date(utc.getTime() + wibOffsetMs);

  const wibReset = new Date(wibNow);
  wibReset.setHours(14, 30, 0, 0);

  if (wibNow >= wibReset) {
    wibReset.setDate(wibReset.getDate() + 1);
  }

  return new Date(wibReset.getTime() - wibOffsetMs);
}

function formatWib(dateValue) {
  const date = new Date(dateValue);
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}