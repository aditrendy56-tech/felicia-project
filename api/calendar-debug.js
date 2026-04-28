import { google } from 'googleapis';
import { setCorsHeaders, setSecurityHeaders, handleOptions } from './_lib/cors.js';
import { requireApiAuth } from './_lib/auth.js';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function getAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

function getCalendar() {
  return google.calendar({ version: 'v3', auth: getAuth() });
}

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

  return {
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    dateStr,
  };
}

function formatEvent(event) {
  const start = event.start?.dateTime || event.start?.date || '';
  const end = event.end?.dateTime || event.end?.date || '';

  const formatTime = (isoStr) => {
    if (!isoStr) return '??:??';
    const d = new Date(isoStr);
    return d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    });
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
        perCalendar.push({
          calendarId,
          count: items.length,
          firstEvents: items.slice(0, 5).map(formatEvent),
        });
      } catch (err) {
        perCalendar.push({
          calendarId,
          error: err.message,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      activeCalendarId: CALENDAR_ID,
      date: bounds.dateStr,
      bounds,
      calendars,
      perCalendar,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Calendar debug failed' });
  }
}