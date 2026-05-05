/**
 * Instant Replies — Fast-path responses for common messages
 * Phase 1: Skeleton (extracted from chat.js)
 */

export function buildInstantReply(message) {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return null;

  if (/^(hai|hi|halo|hello|p|woi|oy|oi)$/i.test(normalized)) {
    return 'Hai Adit 👋 Felicia standby. Kalau mau cepat, tinggal bilang: "jadwal hari ini", "status mode", atau "ingat ya ...".';
  }

  if (/^(makasih|terima kasih|thanks|thx|tq|thank you)$/i.test(normalized)) {
    return 'Sama-sama Adit 🤍';
  }

  if (/^(test|tes|testing)$/i.test(normalized)) {
    return 'Masuk kok Adit. Felicia online dan siap bantu.';
  }

  if (/^(gm|good morning|pagi|selamat pagi)$/i.test(normalized)) {
    return 'Pagi Adit ☀️ Semangat hari ini! Ada yang mau dikerjain bareng?';
  }

  if (/^(gn|good night|malam|selamat malam|tidur)$/i.test(normalized)) {
    return 'Malam Adit 🌙 Istirahat yang cukup ya. Besok Felicia standby lagi!';
  }

  return null;
}
