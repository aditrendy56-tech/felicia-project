// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Felicia — Cron Job: Morning Summary
// GET /api/cron
// Dijalankan setiap pagi 08:00 WIB (01:00 UTC)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { sendDM } from './_lib/discord.js';
import { getEventsToday } from './_lib/calendar.js';
import { generateMorningSummary } from './_lib/gemini.js';
import { getActiveMode, logCommand } from './_lib/supabase.js';
import { getTanggalHariIni, getTipeHari } from './_lib/context.js';

export default async function handler(req, res) {
  // Hanya terima GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ─── Verifikasi CRON_SECRET ───
  const authHeader = req.headers.authorization;
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = process.env.DISCORD_USER_ID;
  if (!userId) {
    return res.status(500).json({ error: 'DISCORD_USER_ID not configured' });
  }

  try {
    // 1. Ambil data
    const events = await getEventsToday();
    const activeMode = await getActiveMode();
    const mode = activeMode?.mode || null;
    const tanggal = getTanggalHariIni();
    const tipeHari = getTipeHari();

    // 2. Generate summary via Gemini
    const geminiResult = await generateMorningSummary(events, mode);

    // 3. Format final message
    let message = `☀️ **Morning Briefing — Felicia**\n`;
    message += `📅 ${tanggal} — _${tipeHari}_\n`;
    if (mode) message += `⚠️ Mode aktif: **${mode.toUpperCase()}**\n`;
    message += `\n${geminiResult.reply}`;

    // Tambah jadwal raw jika ada events
    if (events.length > 0) {
      message += `\n\n📋 **Detail Jadwal:**\n`;
      events.forEach((e, i) => {
        message += `${i + 1}. \`${e.start} — ${e.end}\` ${e.summary}\n`;
      });
    }

    // 4. Kirim DM ke Adit
    const sent = await sendDM(userId, message);

    if (!sent) {
      console.error('[Cron] Gagal kirim DM ke Adit');
      return res.status(500).json({ error: 'Failed to send DM' });
    }

    // 5. Log ke Supabase
    await logCommand({
      userId: 'system-cron',
      command: 'cron-morning',
      input: null,
      action: 'reply',
      response: message,
    });

    return res.status(200).json({
      success: true,
      message: 'Morning summary sent',
      eventsCount: events.length,
      mode: mode || 'none',
    });
  } catch (err) {
    console.error('[Cron] Error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
