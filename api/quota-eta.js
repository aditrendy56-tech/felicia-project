import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    const { data, error } = await supabase
      .from('felicia_commands')
      .select('created_at, status, error_message, input')
      .eq('status', 'quota_limited')
      .gte('created_at', oneDayAgoIso)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ error: error.message || 'Failed to query quota logs' });
    }

    const rows = data || [];
    const latest = rows[0] || null;

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

    const retryAt = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? new Date(now.getTime() + retryAfterSeconds * 1000)
      : null;

    const nextDailyReset = getNextApproxDailyReset(now);

    const warning = likelyDailyQuota
      ? `Limit harian free tier kemungkinan sudah habis. Coba lagi sekitar ${formatWib(nextDailyReset)} WIB.`
      : retryAt
        ? `Rate limit sementara. Coba lagi sekitar ${formatWib(retryAt)} WIB.`
        : 'Quota sedang ketat. Coba lagi 1–3 menit.';

    return res.status(200).json({
      now: now.toISOString(),
      state: likelyDailyQuota ? 'daily_limited' : 'rate_limited',
      warning,
      latest_event: {
        created_at: latest.created_at,
        input: latest.input,
      },
      eta: {
        retry_after_seconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
        retry_at_iso: retryAt ? retryAt.toISOString() : null,
        retry_at_wib: retryAt ? `${formatWib(retryAt)} WIB` : null,
        daily_reset_estimate_wib: `${formatWib(nextDailyReset)} WIB`,
        confidence: likelyDailyQuota ? 'medium' : (retryAt ? 'high' : 'low'),
      },
      note: 'ETA berasal dari log internal quota_limited dan pola retry provider; reset harian bersifat estimasi.',
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
}

function extractRetryAfterSeconds(message) {
  const text = String(message || '');
  const retryInMatch = text.match(/retry\s+in\s+([\d.]+)s/i);
  if (retryInMatch?.[1]) {
    const seconds = Number.parseFloat(retryInMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }

  const retryDelayMatch = text.match(/retryDelay\"?\s*:\s*\"?([\d.]+)s/i);
  if (retryDelayMatch?.[1]) {
    const seconds = Number.parseFloat(retryDelayMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }

  return null;
}

function isLikelyDailyQuota(message) {
  const merged = String(message || '').toLowerCase();
  return (
    merged.includes('generaterequestsperdayperprojectpermodel-freetier') ||
    merged.includes('perday') ||
    merged.includes('requests/day') ||
    merged.includes('quota exceeded')
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