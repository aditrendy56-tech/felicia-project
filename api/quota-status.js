import { getSupabase } from './_lib/supabase.js';
import { setCorsHeaders, setSecurityHeaders, handleOptions } from './_lib/cors.js';
import { requireApiAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptions(res, req);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireApiAuth(req, res)) {
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
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
