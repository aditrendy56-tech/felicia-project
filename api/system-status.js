import { google } from 'googleapis';
import { setCorsHeaders, setSecurityHeaders, handleOptions } from './_lib/cors.js';
import { requireApiAuth } from './_lib/auth.js';
import { getSupabase } from './_lib/supabase.js';
import { getCanonicalProfile } from './_lib/profile.js';

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

function makeBadge(state, detail) {
  return { state, detail };
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

  const now = new Date().toISOString();
  const notes = [];

  const supabase = getSupabase();
  const integrationStatus = {
    googleCalendar: makeBadge('unknown', 'Belum diperiksa'),
    supabase: makeBadge('unknown', 'Belum diperiksa'),
    profileMemory: makeBadge('unknown', 'Belum diperiksa'),
    gemini: makeBadge(process.env.GEMINI_API_KEY ? 'configured' : 'missing', process.env.GEMINI_API_KEY ? 'API key terpasang' : 'API key belum terpasang'),
    discord: makeBadge(
      process.env.DISCORD_PUBLIC_KEY && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_APPLICATION_ID && process.env.DISCORD_USER_ID ? 'configured' : 'partial',
      process.env.DISCORD_PUBLIC_KEY && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_APPLICATION_ID && process.env.DISCORD_USER_ID
        ? 'Webhook + bot token siap'
        : 'Sebagian env Discord belum lengkap'
    ),
    apiToken: makeBadge(process.env.API_SECRET ? 'active' : 'missing', process.env.API_SECRET ? 'Server auth aktif' : 'API secret belum diset'),
  };

  if (!supabase) {
    integrationStatus.supabase = makeBadge('missing', 'Supabase env belum lengkap');
    integrationStatus.profileMemory = makeBadge('missing', 'Profil & memori tidak bisa dicek');
  } else {
    try {
      const [commandsCheck, memoriesCheck] = await Promise.all([
        supabase.from('felicia_commands').select('id', { head: true, count: 'exact' }).limit(1),
        supabase.from('felicia_memories').select('id', { head: true, count: 'exact' }).limit(1),
      ]);

      if (commandsCheck.error || memoriesCheck.error) {
        const err = commandsCheck.error || memoriesCheck.error;
        integrationStatus.supabase = makeBadge('error', err.message || 'Gagal query Supabase');
        integrationStatus.profileMemory = makeBadge('error', 'Tabel memori/profil tidak bisa dibaca');
      } else {
        integrationStatus.supabase = makeBadge('connected', 'Query Supabase berhasil');
        integrationStatus.profileMemory = makeBadge('connected', 'Memori & profil terhubung ke Supabase');
      }
    } catch (err) {
      integrationStatus.supabase = makeBadge('error', err?.message || 'Supabase check failed');
      integrationStatus.profileMemory = makeBadge('error', 'Memori/profil tidak bisa dicek');
    }
  }

  try {
    const profile = await getCanonicalProfile();
    integrationStatus.profileMemory.detail = profile?.name
      ? `Profil aktif: ${profile.name}`
      : integrationStatus.profileMemory.detail;
  } catch (err) {
    notes.push(`Profil canonical fallback dipakai: ${err?.message || 'unknown error'}`);
  }

  try {
    const calendar = getCalendar();
    const bounds = getDayBounds();

    const calendarListRes = await calendar.calendarList.list();
    const calendars = calendarListRes.data.items || [];
    const candidateIds = [CALENDAR_ID, 'primary', ...calendars.map((item) => item.id)]
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);

    let calendarConnected = false;
    let calendarDetail = `${calendars.length} calendar terbaca`;
    let activeCalendarId = null;

    for (const calendarId of candidateIds) {
      try {
        const eventsRes = await calendar.events.list({
          calendarId,
          timeMin: bounds.timeMin,
          timeMax: bounds.timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          timeZone: 'Asia/Jakarta',
          maxResults: 5,
        });

        activeCalendarId = calendarId;
        calendarConnected = true;
        calendarDetail = `${calendars.length} calendar terbaca · aktif: ${calendarId} · event hari ini: ${(eventsRes.data.items || []).length}`;
        break;
      } catch (err) {
        calendarDetail = `Coba ${calendarId} gagal: ${err?.message || 'unknown error'}`;
      }
    }

    integrationStatus.googleCalendar = calendarConnected
      ? makeBadge('connected', calendarDetail)
      : makeBadge('error', calendarDetail);

    if (activeCalendarId) {
      notes.push(`Calendar aktif: ${activeCalendarId}`);
    }
  } catch (err) {
    integrationStatus.googleCalendar = makeBadge('error', err?.message || 'Google Calendar check failed');
  }

  const overallState = deriveOverallState(integrationStatus);
  const architectureSummary = overallState === 'healthy'
    ? 'Satu brain, satu data layer, multi-interface. Semua status utama tersambung.'
    : 'Ada komponen yang perlu dibenerin; sistem tetap berjalan tapi belum sepenuhnya sehat.';

  return res.status(200).json({
    ok: true,
    updatedAt: now,
    overall: {
      state: overallState,
      summary: architectureSummary,
    },
    integrations: integrationStatus,
    architecture: {
      source_of_truth: ['Supabase', 'Google Calendar', 'Gemini API'],
      personal_data: 'Profil, memory, cases, goals, dan command logs tersimpan terpusat di Supabase.',
      security: process.env.API_SECRET ? 'Server auth aktif; data tidak bergantung state frontend.' : 'Server auth belum lengkap.',
      notes: [
        'Discord status hanya konfigurasi, bukan verifikasi live socket.',
        'Encryption at rest / advanced access control masih fase berikutnya sesuai arsitektur.',
      ],
    },
    notes,
  });
}

function deriveOverallState(status) {
  const states = Object.values(status).map((item) => item?.state);

  if (states.includes('error') || states.includes('missing')) return 'degraded';
  if (states.includes('partial') || states.includes('configured') || states.includes('unknown')) return 'healthy';
  return 'healthy';
}