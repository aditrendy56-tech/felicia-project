/**
 * Deterministic Routes — Handle known intents without Gemini
 * Phase 1: Skeleton (extracted from chat.js)
 */

export async function tryDeterministicRoute(message, context) {
  const lower = message.toLowerCase().trim();
  const { events, activeMode } = context;

  // --- Jadwal hari ini (tanpa Gemini) ---
  if (/^(jadwal|schedule|agenda)\s*(hari ini|today)?[?!.]*$/i.test(lower) || lower === 'jadwal') {
    if (!events || events.length === 0) {
      return { reply: 'Tidak ada event di kalender hari ini, Adit. Mau tambah jadwal?' };
    }
    const lines = events.map(e => `📌 ${e.start}–${e.end}: ${e.summary}`);
    const tipeHari = getTipeHariLabel();
    return {
      reply: `Jadwal kamu hari ini (${tipeHari}):\n\n${lines.join('\n')}\n\nMau ubah atau tambah sesuatu?`,
    };
  }

  // --- Status mode ---
  if (/^(status\s*mode|mode\s*(apa|aktif|sekarang)|cek\s*mode)[?!.]*$/i.test(lower)) {
    if (activeMode?.mode) {
      return { reply: `Mode aktif sekarang: **${activeMode.mode.toUpperCase()}** (sejak ${new Date(activeMode.activated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}). Mau ganti atau reset?` };
    }
    return { reply: 'Tidak ada mode khusus yang aktif sekarang, Adit. Semua berjalan normal. Mau set mode DROP/CHAOS/OVERWORK?' };
  }

  // --- Tipe hari ---
  if (/^(tipe hari|hari ini (apa|tipe)|ini hari apa)[?!.]*$/i.test(lower)) {
    const tipe = getTipeHariLabel();
    return { reply: `Hari ini tipe: **${tipe}**. ${getTipeHariExplanation(tipe)}` };
  }

  return null; // fallback ke Gemini
}

function getTipeHariLabel() {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const hari = days[now.getDay()];
  if (['Senin', 'Selasa', 'Kamis'].includes(hari)) return 'FULL BUILD';
  if (['Rabu', 'Jumat'].includes(hari)) return 'STABILIZE';
  return 'RECOVERY';
}

function getTipeHariExplanation(tipe) {
  const map = {
    'FULL BUILD': 'Hari ini belajar serius + ShopeeFood + Cepot deepwork + gym. Gas! 💪',
    'STABILIZE': 'Hari ini aktivitas ringan + review + istirahat. Jangan terlalu keras.',
    'RECOVERY': 'Hari santai, ShopeeFood minimal, recharge energi. Nikmatin aja.',
  };
  return map[tipe] || '';
}
