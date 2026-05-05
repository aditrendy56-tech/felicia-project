 // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Felicia — Mode Logic (DROP / CHAOS / OVERWORK)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { getEventsToday, rescheduleByMode } from './calendar.js';
import { logMode, getActiveMode } from './supabase.js';

const VALID_MODES = ['drop', 'chaos', 'overwork'];

/**
 * Deskripsi tiap mode
 */
const MODE_DESCRIPTIONS = {
  drop: {
    name: 'DROP',
    emoji: '😮‍💨',
    description: 'Cape/lemes/bangun siang',
    rules: [
      'ShopeeFood tetap jalan',
      'Cepot Tech 1-2 jam saja',
      'Skip belajar, skill leverage, dan deepwork',
    ],
  },
  chaos: {
    name: 'CHAOS',
    emoji: '🌀',
    description: 'Konflik/stres/overload',
    rules: [
      'Fokus income (ShopeeFood) saja',
      'Hanya 2 task kecil hari ini',
      'Skip semua yang bukan income-generating',
    ],
  },
  overwork: {
    name: 'OVERWORK',
    emoji: '🛑',
    description: 'Sakit/kecapean parah',
    rules: [
      'Hanya 1 kerja ringan',
      'Gym/recovery tetap (kalau mampu)',
      'Istirahat adalah prioritas utama',
    ],
  },
};

/**
 * Validasi nama mode
 */
export function isValidMode(mode) {
  return VALID_MODES.includes(mode?.toLowerCase());
}

/**
 * Ambil deskripsi mode
 */
export function getModeInfo(mode) {
  return MODE_DESCRIPTIONS[mode?.toLowerCase()] || null;
}

/**
 * Aktivasi mode: reschedule calendar + log ke Supabase
 * @param {string} mode - nama mode (drop/chaos/overwork)
 * @returns {object} { success, message, changes }
 */
export async function activateMode(mode) {
  const modeLower = mode.toLowerCase();

  if (!isValidMode(modeLower)) {
    return {
      success: false,
      message: `Mode "${mode}" tidak valid. Pilih: drop, chaos, atau overwork.`,
      changes: [],
    };
  }

  const info = MODE_DESCRIPTIONS[modeLower];

  try {
    // 1. Ambil events hari ini
    const events = await getEventsToday();

    if (events.length === 0) {
      // Tetap log mode meskipun tidak ada event
      await logMode({ mode: modeLower, note: `${info.name} diaktifkan (tidak ada event hari ini)` });

      return {
        success: true,
        message: `${info.emoji} Mode **${info.name}** diaktifkan!\n\n_${info.description}_\n\nTidak ada event di kalender hari ini, tapi mode sudah tercatat.`,
        changes: [],
      };
    }

    // 2. Reschedule events berdasarkan mode
    const changes = await rescheduleByMode(modeLower, events);

    // 3. Log ke Supabase
    const note = `${info.name} diaktifkan. ${changes.length} event di-reschedule.`;
    await logMode({ mode: modeLower, note });

    // 4. Format response
    let message = `${info.emoji} Mode **${info.name}** diaktifkan!\n\n`;
    message += `_${info.description}_\n\n`;
    message += `📋 Aturan:\n`;
    info.rules.forEach((r) => (message += `• ${r}\n`));

    if (changes.length > 0) {
      message += `\n🔄 Perubahan jadwal:\n`;
      changes.forEach((c) => {
        message += `• ~~${c.event}~~ → di-skip\n`;
      });
    } else {
      message += `\n✅ Tidak ada event yang perlu di-skip.`;
    }

    return { success: true, message, changes };
  } catch (err) {
    console.error('[Mode] activateMode error:', err);
    return {
      success: false,
      message: 'Gagal mengaktifkan mode. Ada error di sistem. 😕',
      changes: [],
    };
  }
}

/**
 * Ambil status mode aktif saat ini
 */
export async function getCurrentModeStatus() {
  const activeMode = await getActiveMode();

  if (!activeMode) {
    return {
      active: false,
      message: '✅ Tidak ada mode khusus aktif saat ini. Jadwal berjalan normal.',
    };
  }

  const info = MODE_DESCRIPTIONS[activeMode.mode];
  if (!info) {
    return {
      active: true,
      mode: activeMode.mode,
      message: `Mode aktif: ${activeMode.mode} (sejak ${new Date(activeMode.activated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })})`,
    };
  }

  return {
    active: true,
    mode: activeMode.mode,
    message: `${info.emoji} Mode **${info.name}** aktif sejak ${new Date(activeMode.activated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n_${info.description}_\n\n${activeMode.note || ''}`,
  };
}
