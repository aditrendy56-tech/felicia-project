import { setCorsHeaders, setSecurityHeaders, handleOptions } from '../lib/cors.js';
import { requireApiAuth } from '../lib/auth.js';

function getOp(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('op') || url.pathname.split('/').pop();
  } catch (e) {
    return null;
  }
}

async function captureConsoleAsync(fn) {
  const logs = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => logs.push(args.join(' '));
  try {
    await fn();
  } catch (e) {
    logs.push(String(e?.stack || e?.message || e));
  } finally {
    console.log = origLog;
    console.error = origError;
  }
  return logs.join('\n');
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return handleOptions(res, req);

  const op = String(getOp(req) || '').toLowerCase();

  if (!requireApiAuth(req, res)) return;

  try {
    if (op === 'calendar' || op === 'calendar-debug' || op === 'calendar_debug') {
      // Reuse logic from calendar-debug.js
      const { google } = await import('googleapis');

      const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
      const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

      function getAuth() {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        return oauth2Client;
      }

      function getCalendar() { return google.calendar({ version: 'v3', auth: getAuth() }); }

      function getWibDateString(date = new Date()) {
        const wib = new Date(date.getTime() + WIB_OFFSET_MS);
        const year = wib.getUTCFullYear();
        const month = String(wib.getUTCMonth() + 1).padStart(2, '0');
        const day = String(wib.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      function getDayBounds(date = new Date()) {
        const dateStr = getWibDateString(date);
        const startOfDay = new Date(`${dateStr}T00:00:00+07:00`);
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        return { timeMin: startOfDay.toISOString(), timeMax: endOfDay.toISOString(), dateStr };
      }

      function formatEvent(event) {
        const start = event.start?.dateTime || event.start?.date || '';
        const end = event.end?.dateTime || event.end?.date || '';
        const formatTime = (isoStr) => {
          if (!isoStr) return '??:??';
          const d = new Date(isoStr);
          return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        };
        return {
          id: event.id,
          summary: event.summary || '(Tanpa judul)',
          start: formatTime(start),
          end: formatTime(end),
          startISO: start,
          endISO: end,
          status: event.status,
        };
      }

      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

      try {
        const calendar = getCalendar();
        const bounds = getDayBounds();

        const listRes = await calendar.calendarList.list();
        const calendars = (listRes.data.items || []).map((item) => ({
          id: item.id,
          summary: item.summary || item.id,
          primary: Boolean(item.primary),
          accessRole: item.accessRole || null,
          selected: Boolean(item.selected),
        }));

        const candidates = [CALENDAR_ID, 'primary', ...calendars.map((c) => c.id)]
          .filter(Boolean)
          .filter((value, index, array) => array.indexOf(value) === index);

        const perCalendar = [];
        for (const calendarId of candidates) {
          try {
            const eventsRes = await calendar.events.list({
              calendarId,
              timeMin: bounds.timeMin,
              timeMax: bounds.timeMax,
              singleEvents: true,
              orderBy: 'startTime',
              timeZone: 'Asia/Jakarta',
              maxResults: 10,
            });

            const items = eventsRes.data.items || [];
            perCalendar.push({ calendarId, count: items.length, firstEvents: items.slice(0, 5).map(formatEvent) });
          } catch (err) {
            perCalendar.push({ calendarId, error: err.message });
          }
        }

        return res.status(200).json({ ok: true, activeCalendarId: CALENDAR_ID, date: bounds.dateStr, bounds, calendars, perCalendar });
      } catch (err) {
        return res.status(500).json({ error: err?.message || 'Calendar debug failed' });
      }
    }

    if (op === 'embedding-status' || op === 'debug-embedding-status' || op === 'embedding') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      // Ported and adapted from debug-embedding-status.js — return JSON instead of console
      const { getSupabase } = await import('../lib/supabase.js');
      const supabase = getSupabase();
      if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

      try {
        const [{ data: allMem, error: err1 }, { data: noEmb, error: err2 }, { data: withEmb, error: err3 }] = await Promise.all([
          supabase.from('felicia_memories').select('id, content, embedding', { count: 'exact' }).limit(1),
          supabase.from('felicia_memories').select('id, content', { count: 'exact' }).is('embedding', null).limit(1),
          supabase.from('felicia_memories').select('id, content, embedding').not('embedding', 'is', null).limit(3),
        ]);

        if (err1 || err2 || err3) {
          return res.status(500).json({ error: (err1 || err2 || err3)?.message || 'Supabase query failed' });
        }

        return res.status(200).json({
          total_count: allMem?.count || null,
          without_embedding_count: noEmb?.count || 0,
          sample_with_embedding: (withEmb || []).map((m) => ({ id: m.id, content: m.content?.slice(0, 120) })),
        });
      } catch (err) {
        return res.status(500).json({ error: err?.message || err });
      }
    }

    if (op === 'semantic-memory' || op === 'debug-semantic-memory') {
      // There's an existing handler file; forward to it (it expects POST)
      const mod = await import('./debug-semantic-memory.js');
      if (typeof mod.default === 'function') {
        return mod.default(req, res);
      }
    }

    if (op === 'test-semantic' || op === 'verify-call-chain' || op === 'call-chain-summary' || op === 'pgvector-status') {
      // These are console-oriented scripts; capture their console output and return as text
      let targetPath = './test-semantic.js';
      if (op === 'verify-call-chain') targetPath = './verify-call-chain.js';
      if (op === 'call-chain-summary') targetPath = './CALL_CHAIN_SUMMARY.js';
      if (op === 'pgvector-status') targetPath = './PGVECTOR_STATUS.js';

      const text = await captureConsoleAsync(async () => {
        // dynamic import runs top-level script
        // eslint-disable-next-line import/no-dynamic-require
        // Note: importing will execute top-level code for these debug scripts
        // they generally do console logging which we capture
        // some scripts load dotenv from ../../.env.local — in server env env vars already set
        // so import should work fine
        // We purposely do not `await` anything here beyond the import to allow the script to run
        // If script exports function, it's fine — import will still run top-level.
        // Use new Function to avoid bundlers optimizing away dynamic import path
        // But here dynamic import is straightforward
        // eslint-disable-next-line no-unused-vars
        const m = await import(targetPath);
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(text);
    }

    return res.status(400).json({ error: 'Unknown debug op. Use ?op=calendar|embedding-status|semantic-memory|test-semantic|verify-call-chain|call-chain-summary|pgvector-status' });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
}
