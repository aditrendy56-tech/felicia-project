// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Felicia — Discord Interactions Endpoint
// POST /api/interactions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  verifySignature,
  isAuthorizedUser,
  getUserId,
  getOption,
} from './_lib/discord.js';

import { askGemini, generateWeeklyReview } from './_lib/gemini.js';
import {
  getEventsToday,
  getEventsRange,
  createEvent,
  updateEvent,
  deleteEvent,
} from './_lib/calendar.js';
import { activateMode, getCurrentModeStatus } from './_lib/mode.js';
import { logCommand, getActiveMode, getCommandLogs } from './_lib/supabase.js';
import { getTipeHari, getHariIni, getTanggalHariIni } from './_lib/context.js';

/**
 * Vercel Serverless Function Config
 * Kita perlu raw body untuk Ed25519 verification
 */
export const config = {
  api: { bodyParser: false },
};

/**
 * Main handler — POST /api/interactions
 */
export default async function handler(req, res) {
  // Hanya terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ─── 1. Baca raw body ───
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks);

  // ─── 2. Verifikasi Ed25519 signature ───
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!verifySignature(rawBody, signature, timestamp)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ─── 3. Parse body ───
  let interaction;
  try {
    interaction = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // ─── 4. Handle PING (type 1) ───
  if (interaction.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  // ─── 5. Handle Application Command (type 2) ───
  if (interaction.type === 2) {
    // Whitelist check
    if (!isAuthorizedUser(interaction)) {
      return res.status(200).json({
        type: 4,
        data: { content: '🚫 Akses ditolak.', flags: 64 },
      });
    }

    const commandName = interaction.data?.name;
    const userId = getUserId(interaction);

    // Commands yang butuh proses cepat
    if (commandName === 'status') {
      return await handleStatus(res, userId);
    }

    // Semua command diproses langsung lalu dibalas type 4
    try {
      let message = '';

      switch (commandName) {
        case 'jadwal':
          message = await handleJadwal(userId);
          break;
        case 'mode':
          message = await handleMode(userId, interaction);
          break;
        case 'reschedule':
          message = await handleReschedule(userId);
          break;
        case 'review':
          message = await handleReview(userId);
          break;
        case 'tanya':
          message = await handleTanya(userId, interaction);
          break;
        default:
          message = `❓ Command /${commandName} belum diimplementasi.`;
      }

      const reply = (message || '✅ Perintah diproses.').length > 1990
        ? (message || '✅ Perintah diproses.').substring(0, 1990) + '...'
        : (message || '✅ Perintah diproses.');

      return res.status(200).json({
        type: 4,
        data: { content: reply },
      });
    } catch (err) {
      console.error(`[Interactions] Error handling /${commandName}:`, err);
      return res.status(200).json({
        type: 4,
        data: { content: '❌ Terjadi error saat memproses command. Coba lagi ya, Adit.' },
      });
    }
  }

  // Unknown interaction type
  return res.status(400).json({ error: 'Unknown interaction type' });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMAND HANDLERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * /status — tampilkan mode aktif + ringkasan hari ini (immediate response)
 */
async function handleStatus(res, userId) {
  try {
    const modeStatus = await getCurrentModeStatus();
    const hari = getHariIni();
    const tipeHari = getTipeHari();
    const tanggal = getTanggalHariIni();

    let message = `📊 **Status Felicia**\n\n`;
    message += `📅 ${tanggal}\n`;
    message += `📌 Tipe hari: **${tipeHari}** (${hari})\n\n`;
    message += modeStatus.message;

    await logCommand({
      userId,
      command: 'status',
      input: null,
      action: 'reply',
      response: message,
    });

    return res.status(200).json({
      type: 4,
      data: { content: message },
    });
  } catch (err) {
    console.error('[Status] Error:', err);
    return res.status(200).json({
      type: 4,
      data: { content: '❌ Gagal mengambil status. Coba lagi ya.' },
    });
  }
}

/**
 * /jadwal — tampilkan jadwal hari ini dari Google Calendar
 */
async function handleJadwal(userId) {
  const events = await getEventsToday();
  const tanggal = getTanggalHariIni();
  const tipeHari = getTipeHari();

  let message = `📅 **Jadwal Hari Ini**\n`;
  message += `${tanggal} — _${tipeHari}_\n\n`;

  if (events.length === 0) {
    message += `📭 Tidak ada event di kalender hari ini.\nMau Felicia buatkan jadwal? Pakai \`/tanya\` ya!`;
  } else {
    events.forEach((e, i) => {
      message += `**${i + 1}.** \`${e.start} — ${e.end}\` ${e.summary}\n`;
    });
    message += `\n📊 Total: ${events.length} event`;
  }

  await logCommand({
    userId,
    command: 'jadwal',
    input: null,
    action: 'get_events',
    response: message,
  });

  return message;
}

/**
 * /mode [nama] — aktifkan mode DROP/CHAOS/OVERWORK
 */
async function handleMode(userId, interaction) {
  const modeName = getOption(interaction, 'nama');

  if (!modeName) {
    // Tampilkan mode aktif saat ini
    const modeStatus = await getCurrentModeStatus();
    return modeStatus.message;
  }

  const result = await activateMode(modeName);

  await logCommand({
    userId,
    command: 'mode',
    input: modeName,
    action: 'set_mode',
    response: result.message,
  });

  return result.message;
}

/**
 * /reschedule — pindahkan goal yang terlewat ke hari lain
 */
async function handleReschedule(userId) {
  const events = await getEventsToday();
  const activeMode = await getActiveMode();
  const mode = activeMode?.mode || null;

  // Minta Gemini analisa events yang perlu di-reschedule
  const eventsText = events.map(e => `- [${e.id}] ${e.start}—${e.end}: ${e.summary}`).join('\n');
  const prompt = `
Analisa jadwal hari ini dan identifikasi event yang sudah terlewat (sekarang sudah lewat jam mulainya).
Untuk event yang terlewat, sarankan reschedule ke waktu yang masuk akal hari ini atau besok.

Jadwal hari ini:
${eventsText || '(kosong)'}

Waktu sekarang: ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}

Berikan response dalam format JSON:
{
  "action": "reply",
  "params": {},
  "reply": "... analisa dan rekomendasi reschedule ..."
}
`.trim();

  const geminiResult = await askGemini(prompt, { mode, events, command: 'reschedule' });

  // Handle jika Gemini minta reschedule spesifik
  if (geminiResult.action === 'reschedule' && geminiResult.params?.eventId) {
    const { eventId, startTime, endTime, summary } = geminiResult.params;
    const updated = await updateEvent(eventId, { startTime, endTime, summary });
    if (updated) {
      geminiResult.reply += `\n\n✅ Event berhasil di-reschedule!`;
    }
  }

  await logCommand({
    userId,
    command: 'reschedule',
    input: null,
    action: geminiResult.action,
    response: geminiResult.reply,
  });

  return geminiResult.reply;
}

/**
 * /review — weekly review: goal tercapai vs terlewat
 */
async function handleReview(userId) {
  // Ambil data 7 hari terakhir
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const events = await getEventsRange(weekAgo.toISOString(), now.toISOString());
  const logs = await getCommandLogs(weekAgo.toISOString(), now.toISOString());

  const geminiResult = await generateWeeklyReview(events, logs);

  await logCommand({
    userId,
    command: 'review',
    input: null,
    action: 'reply',
    response: geminiResult.reply,
  });

  return geminiResult.reply;
}

/**
 * /tanya [pesan] — tanya bebas ke Gemini dengan konteks Adit
 */
async function handleTanya(userId, interaction) {
  const pesan = getOption(interaction, 'pesan');

  if (!pesan) {
    return '❓ Mau tanya apa, Adit? Kasih pesannya dong.';
  }

  // Ambil konteks: events hari ini dan mode aktif
  const events = await getEventsToday();
  const activeMode = await getActiveMode();
  const mode = activeMode?.mode || null;

  const geminiResult = await askGemini(pesan, { mode, events, command: 'tanya' });

  // Handle aksi tambahan dari Gemini
  if (geminiResult.action === 'create_event' && geminiResult.params) {
    const { summary, startTime, endTime, description } = geminiResult.params;
    if (summary && startTime && endTime) {
      const created = await createEvent(summary, startTime, endTime, description || '');
      if (created) {
        geminiResult.reply += `\n\n✅ Event "${summary}" berhasil ditambahkan ke kalender!`;
      }
    }
  } else if (geminiResult.action === 'delete_event' && geminiResult.params?.eventId) {
    const deleted = await deleteEvent(geminiResult.params.eventId);
    if (deleted) {
      geminiResult.reply += `\n\n✅ Event berhasil dihapus dari kalender!`;
    }
  } else if (geminiResult.action === 'reschedule' && geminiResult.params?.eventId) {
    const { eventId, startTime, endTime, summary } = geminiResult.params;
    const updated = await updateEvent(eventId, { startTime, endTime, summary });
    if (updated) {
      geminiResult.reply += `\n\n✅ Event berhasil di-reschedule!`;
    }
  } else if (geminiResult.action === 'set_mode' && geminiResult.params?.mode) {
    const modeResult = await activateMode(geminiResult.params.mode);
    geminiResult.reply += `\n\n${modeResult.message}`;
  }

  await logCommand({
    userId,
    command: 'tanya',
    input: pesan,
    action: geminiResult.action,
    response: geminiResult.reply,
  });

  return geminiResult.reply;
}
