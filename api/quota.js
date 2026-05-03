import { getSupabase } from './_lib/supabase.js';
import { setCorsHeaders, setSecurityHeaders, handleOptions } from './_lib/cors.js';
import { requireApiAuth } from './_lib/auth.js';

function getOp(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('op') || url.pathname.split('/').pop();
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return handleOptions(res, req);

  const op = String(getOp(req) || '').toLowerCase();

  // Require auth for all GET/POST operations
  if (!requireApiAuth(req, res)) return;

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    if (op === 'debug' || op === 'quota-debug') {
      // Ported from quota-debug.js (GET)
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

      const now = new Date();
      const oneDayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const twelveHoursAgoIso = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();

      const quotaRes = await supabase
        .from('felicia_commands')
        .select('created_at, status, error_message, input')
        .eq('status', 'quota_limited')
        .gte('created_at', oneDayAgoIso)
        .order('created_at', { ascending: false })
        .limit(20);

      const successRes = await supabase
        .from('felicia_commands')
        .select('created_at, status')
        .eq('status', 'success')
        .gte('created_at', oneDayAgoIso)
        .order('created_at', { ascending: false })
        .limit(20);

      const errorRes = await supabase
        .from('felicia_commands')
        .select('created_at, status, error_message')
        .eq('status', 'error')
        .gte('created_at', twelveHoursAgoIso)
        .order('created_at', { ascending: false })
        .limit(10);

      const quotaEvents = quotaRes.data || [];
      const successEvents = successRes.data || [];
      const errorEvents = errorRes.data || [];

      const latestQuota = quotaEvents[0] || null;
      const latestSuccess = successEvents[0] || null;
      const latestError = errorEvents[0] || null;

      let currentState = 'ok';
      let reason = '';

      if (latestQuota) {
        const latestQuotaAt = new Date(latestQuota.created_at);
        const recoveredAfterQuota = Boolean(latestSuccess && new Date(latestSuccess.created_at) > latestQuotaAt);

        if (!recoveredAfterQuota) {
          const isLikelyDaily = isLikelyDailyQuota(latestQuota.error_message);
          const timeSinceQuota = (now.getTime() - latestQuotaAt.getTime()) / 1000;
          const defaultRetry = 180;

          if (isLikelyDaily) {
            currentState = 'daily_limited';
            reason = `Daily limit terdeteksi. Event: ${latestQuota.created_at}. Masih dalam window harian.`;
          } else if (timeSinceQuota < defaultRetry) {
            currentState = 'rate_limited';
            reason = `Rate limit dalam retry window. Event: ${latestQuota.created_at}. Sisa: ${Math.max(0, defaultRetry - Math.floor(timeSinceQuota))}s.`;
          } else {
            currentState = 'ok';
            reason = `Sudah past retry window tapi tidak ada recovery signal. Mungkin stuck belum refresh.`;
          }
        } else {
          currentState = 'ok';
          reason = `Sudah ada success event setelah quota_limited terakhir (${latestSuccess.created_at}). Quota recovered.`;
        }
      } else {
        reason = 'Tidak ada quota_limited event dalam 24 jam terakhir.';
      }

      return res.status(200).json({
        now: now.toISOString(),
        current_state: currentState,
        reason,
        analysis: {
          quota_events_24h: quotaEvents.length,
          success_events_24h: successEvents.length,
          error_events_12h: errorEvents.length,
          latest_quota: latestQuota ? {
            timestamp: latestQuota.created_at,
            error_msg: latestQuota.error_message?.substring(0, 150) || null,
            is_daily: isLikelyDailyQuota(latestQuota.error_message),
            input: latestQuota.input?.substring(0, 80) || null,
          } : null,
          latest_success: latestSuccess ? {
            timestamp: latestSuccess.created_at,
            time_after_quota: latestQuota && new Date(latestSuccess.created_at) > new Date(latestQuota.created_at)
              ? `${Math.floor((new Date(latestSuccess.created_at).getTime() - new Date(latestQuota.created_at).getTime()) / 1000)}s`
              : null,
          } : null,
          latest_error: latestError ? {
            timestamp: latestError.created_at,
            error_msg: latestError.error_message?.substring(0, 150) || null,
          } : null,
        },
        debug_tips: [
          'Kalau state "rate_limited" tapi sudah > 3 menit → coba refresh page atau restart service.',
          'Kalau latest_success ada dan setelah latest_quota → state seharusnya "ok", bukan rate_limited.',
          'Kalau latest_quota punya "perday" atau "daily" → daily_limited, coba lagi sekitar 14:30 WIB.',
          'Endpoint ini recompute status real-time, bukan cache — jadi akurat untuk audit.',
        ],
      });
    }

    if (op === 'eta' || op === 'quota-eta') {
      // Ported from quota-eta.js (GET)
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
    }

    // default / status
    // Ported from quota-status.js (GET)
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const now = Date.now();
    const oneHourAgoIso = new Date(now - 60 * 60 * 1000).toISOString();
    const oneDayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const [lastHourRes, lastDayRes, recentQuotaRes] = await Promise.all([
      supabase
        .from('felicia_commands')
        .select('status', { count: 'exact', head: false })
        .gte('created_at', oneHourAgoIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('felicia_commands')
        .select('status', { count: 'exact', head: false })
        .gte('created_at', oneDayAgoIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('felicia_commands')
        .select('created_at, status, error_message, input')
        .eq('status', 'quota_limited')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (lastHourRes.error || lastDayRes.error || recentQuotaRes.error) {
      const err = lastHourRes.error || lastDayRes.error || recentQuotaRes.error;
      return res.status(500).json({ error: err.message || 'Failed to query quota status' });
    }

    const summarize = (rows = []) => {
      const summary = {
        total: rows.length,
        success: 0,
        quota_limited: 0,
        error: 0,
        other: 0,
      };
      for (const row of rows) {
        const status = String(row?.status || 'other');
        if (status === 'success') summary.success += 1;
        else if (status === 'quota_limited') summary.quota_limited += 1;
        else if (status === 'error') summary.error += 1;
        else summary.other += 1;
      }
      return summary;
    };

    const lastHour = summarize(lastHourRes.data || []);
    const last24h = summarize(lastDayRes.data || []);

    const quotaRate = {
      lastHourPct: lastHour.total > 0 ? Number(((lastHour.quota_limited / lastHour.total) * 100).toFixed(2)) : 0,
      last24hPct: last24h.total > 0 ? Number(((last24h.quota_limited / last24h.total) * 100).toFixed(2)) : 0,
    };

    return res.status(200).json({
      now: new Date().toISOString(),
      window: {
        last_hour: lastHour,
        last_24h: last24h,
      },
      quota_rate: quotaRate,
      recent_quota_events: recentQuotaRes.data || [],
      note: 'Status ini dari log internal felicia_commands, bukan dashboard resmi Google quota.',
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
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

function extractRetryAfterSeconds(message) {
  const text = String(message || '').trim();
  const FALLBACK_RETRY_AFTER = 180;
  if (!text) return FALLBACK_RETRY_AFTER;

  const retryInMatch = text.match(/retry\s+in\s+([\d.]+)\s*(?:s|seconds)?/i);
  if (retryInMatch?.[1]) {
    const seconds = Number.parseFloat(retryInMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }

  const retryDelayMatch = text.match(/retryDelay["']?\s*:\s*["']?([\d.]+)s/i);
  if (retryDelayMatch?.[1]) {
    const seconds = Number.parseFloat(retryDelayMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }

  const retryAfterHeaderMatch = text.match(/retry-after\s*[:\=]\s*["']?([\d.]+)/i);
  if (retryAfterHeaderMatch?.[1]) {
    const seconds = Number.parseFloat(retryAfterHeaderMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }

  const minutesMatch = text.match(/([\d.]+)\s*(?:minute|min|m)(?:s|ute)?/i);
  if (minutesMatch?.[1]) {
    const minutes = Number.parseFloat(minutesMatch[1]);
    if (Number.isFinite(minutes) && minutes > 0) return Math.ceil(minutes * 60);
  }

  const waitMatch = text.match(/wait\s+([\d.]+)\s*(?:s|seconds)?/i);
  if (waitMatch?.[1]) {
    const seconds = Number.parseFloat(waitMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }

  const durationMatch = text.match(/PT(\d+)M/i);
  if (durationMatch?.[1]) {
    const minutes = Number.parseInt(durationMatch[1], 10);
    if (Number.isFinite(minutes) && minutes > 0) return Math.ceil(minutes * 60);
  }

  return FALLBACK_RETRY_AFTER;
}

function getNextApproxDailyReset(fromDate = new Date()) {
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
