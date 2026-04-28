// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Felicia — Google Calendar CRUD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { google } from 'googleapis';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Buat OAuth2 client dengan refresh token
 */
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

/**
 * Buat Calendar API instance
 */
function getCalendar() {
  return google.calendar({ version: 'v3', auth: getAuth() });
}

async function listAccessibleCalendars(calendar) {
  try {
    const res = await calendar.calendarList.list();
    return (res.data.items || [])
      .filter((item) => item?.id && item?.accessRole !== 'freeBusyReader')
      .map((item) => ({
        id: item.id,
        summary: item.summary || item.id,
        primary: Boolean(item.primary),
      }));
  } catch (err) {
    console.error('[Calendar] calendarList.list error:', err.message);
    return [];
  }
}

/**
 * Helper: start dan end of day di timezone WIB
 */
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

async function listEventsForBounds(calendar, calendarId, { timeMin, timeMax }) {
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'Asia/Jakarta',
  });

  return res.data.items || [];
}

async function getEventsByBounds(bounds) {
  const calendar = getCalendar();

  try {
    const searchCalendarIds = [];
    const seenCalendarIds = new Set();

    if (CALENDAR_ID) {
      searchCalendarIds.push(CALENDAR_ID);
      seenCalendarIds.add(CALENDAR_ID);
    }

    if (!seenCalendarIds.has('primary')) {
      searchCalendarIds.push('primary');
      seenCalendarIds.add('primary');
    }

    const calendars = await listAccessibleCalendars(calendar);
    for (const item of calendars) {
      if (!seenCalendarIds.has(item.id)) {
        searchCalendarIds.push(item.id);
        seenCalendarIds.add(item.id);
      }
    }

    const merged = [];
    const dedupe = new Set();

    for (const calendarId of searchCalendarIds) {
      const events = await listEventsForBounds(calendar, calendarId, bounds);
      for (const event of events) {
        const key = `${event.id || 'no-id'}:${event.start?.dateTime || event.start?.date || ''}:${event.summary || ''}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        merged.push({
          ...formatEvent(event),
          sourceCalendarId: calendarId,
        });
      }
    }

    merged.sort((a, b) => String(a.startISO || '').localeCompare(String(b.startISO || '')));
    return merged;
  } catch (err) {
    console.error('[Calendar] getEventsByBounds error:', err.message);
    return [];
  }
}

/**
 * Format event untuk display
 */
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
    description: event.description || '',
    start: formatTime(start),
    end: formatTime(end),
    startISO: start,
    endISO: end,
    status: event.status,
  };
}

/**
 * Ambil semua event hari ini
 */
export async function getEventsToday() {
  const bounds = getDayBounds();
  return getEventsByBounds(bounds);
}

/**
 * Ambil event pada tanggal tertentu (format: YYYY-MM-DD)
 */
export async function getEventsDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00+07:00');
  const bounds = getDayBounds(date);
  return getEventsByBounds(bounds);
}

/**
 * Ambil event dalam range tanggal (untuk weekly review)
 */
export async function getEventsRange(startDate, endDate) {
  const calendar = getCalendar();

  try {
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'Asia/Jakarta',
    });

    return (res.data.items || []).map((event) => ({
      ...formatEvent(event),
      date: new Date(event.start?.dateTime || event.start?.date || '').toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
      }),
    }));
  } catch (err) {
    console.error('[Calendar] getEventsRange error:', err.message);
    return [];
  }
}

/**
 * Buat event baru
 */
export async function createEvent(summary, startTime, endTime, description = '') {
  const calendar = getCalendar();

  try {
    const res = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary,
        description,
        start: { dateTime: startTime, timeZone: 'Asia/Jakarta' },
        end: { dateTime: endTime, timeZone: 'Asia/Jakarta' },
      },
    });

    return formatEvent(res.data);
  } catch (err) {
    console.error('[Calendar] createEvent error:', err.message);
    return null;
  }
}

/**
 * Update event yang sudah ada
 */
export async function updateEvent(eventId, updates) {
  const calendar = getCalendar();

  try {
    // Ambil event existing dulu
    const existing = await calendar.events.get({
      calendarId: CALENDAR_ID,
      eventId,
    });

    const body = { ...existing.data };

    if (updates.summary) body.summary = updates.summary;
    if (updates.description !== undefined) body.description = updates.description;
    if (updates.startTime) body.start = { dateTime: updates.startTime, timeZone: 'Asia/Jakarta' };
    if (updates.endTime) body.end = { dateTime: updates.endTime, timeZone: 'Asia/Jakarta' };

    const res = await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: body,
    });

    return formatEvent(res.data);
  } catch (err) {
    console.error('[Calendar] updateEvent error:', err.message);
    return null;
  }
}

/**
 * Hapus event
 */
export async function deleteEvent(eventId) {
  const calendar = getCalendar();

  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId,
    });
    return true;
  } catch (err) {
    console.error('[Calendar] deleteEvent error:', err.message);
    return false;
  }
}

/**
 * Reschedule events berdasarkan mode (dipanggil dari mode.js)
 * Mengembalikan list perubahan yang dilakukan
 */
export async function rescheduleByMode(mode, events) {
  const changes = [];

  for (const event of events) {
    const summary = (event.summary || '').toUpperCase();
    let action = null;

    switch (mode.toLowerCase()) {
      case 'drop':
        // Skip SKILL, BELAJAR, CEPOT DEEPWORK
        if (
          summary.includes('[SKILL]') ||
          summary.includes('[BELAJAR]') ||
          summary.includes('[CEPOT DEEPWORK]')
        ) {
          action = 'skip';
        }
        break;

      case 'chaos':
        // Pertahankan hanya SHOPEEFOOD dan INCOME
        if (!summary.includes('[SHOPEEFOOD]') && !summary.includes('[INCOME]')) {
          action = 'skip';
        }
        break;

      case 'overwork':
        // Pertahankan hanya GYM atau RECOVERY
        if (!summary.includes('[GYM]') && !summary.includes('[RECOVERY]')) {
          action = 'skip';
        }
        break;
    }

    if (action === 'skip') {
      // Update event: tambah prefix [SKIP] dan note di description
      const noteMap = {
        drop: 'Mode DROP aktif — event di-skip',
        chaos: 'Mode CHAOS aktif — event di-skip',
        overwork: 'Mode OVERWORK aktif — istirahat prioritas',
      };

      const updated = await updateEvent(event.id, {
        summary: `[SKIP] ${event.summary}`,
        description: `${event.description || ''}\n⚠️ ${noteMap[mode.toLowerCase()]}`.trim(),
      });

      if (updated) {
        changes.push({ event: event.summary, action: 'skipped', updated });
      }
    }
  }

  return changes;
}
