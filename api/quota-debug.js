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
    const twelveHoursAgoIso = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();

    // Fetch quota_limited events
    const quotaRes = await supabase
      .from('felicia_commands')
      .select('created_at, status, error_message, input')
      .eq('status', 'quota_limited')
      .gte('created_at', oneDayAgoIso)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch success events
    const successRes = await supabase
      .from('felicia_commands')
      .select('created_at, status')
      .eq('status', 'success')
      .gte('created_at', oneDayAgoIso)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch recent errors
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

    // Determine current state
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
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Unexpected error',
      debug: 'Check server logs untuk error detail.',
    });
  }
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
