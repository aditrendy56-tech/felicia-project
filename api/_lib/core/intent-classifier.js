/**
 * RESPONSE PARSER — Flexible chat/action format
 */

const VALID_ACTIONS = ['create_event', 'delete_event', 'reschedule', 'set_mode', 'save_memory', 'get_events', 'create_case_auto', 'update_case'];

/**
 * Parse response dari Gemini — handle JSON, partial JSON, atau plain text
 * PRINSIP: Kalau gagal parse → anggap chat reply, JANGAN error
 */
export function parseGeminiResponse(text) {
  const cleanedText = stripCodeFence(String(text || '').trim());

  if (!cleanedText) {
    return { type: 'chat', reply: 'Hmm, Felicia nggak dapet response. Coba ulangi ya Adit.', confidence: 0.2 };
  }

  // 1. Coba parse sebagai JSON langsung
  try {
    const parsed = JSON.parse(cleanedText);
    return normalizeResponse(parsed);
  } catch {
    // Bukan valid JSON langsung — lanjut coba cara lain
  }

  // 2. Coba extract JSON dari dalam teks (kadang Gemini wrap dengan teks tambahan)
  const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return normalizeResponse(parsed);
    } catch {
      // JSON-nya invalid — lanjut
    }
  }

  // 3. Coba parse loose/partial JSON (regex-based)
  const looseParsed = parseLooseResponse(cleanedText);
  if (looseParsed) {
    return looseParsed;
  }

  // 4. FALLBACK: Teks biasa → anggap sebagai chat reply natural
  //    Ini BUKAN error — Gemini mungkin memang balas natural text
  return {
    type: 'chat',
    reply: cleanPlainTextReply(cleanedText),
    confidence: 0.7,
  };
}

/**
 * Normalize parsed JSON ke format standar { type, action?, params?, reply }
 */
function normalizeResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { type: 'chat', reply: String(parsed || ''), confidence: 0.3 };
  }

  // Deteksi format baru (type: chat/action)
  const type = parsed.type === 'action' ? 'action' : 'chat';

  const reply = extractReplyText(parsed.reply || parsed.message || parsed.text || '');

  if (type === 'action' || (parsed.action && parsed.action !== 'reply')) {
    const action = String(parsed.action || '').trim().toLowerCase();

    // Validasi action — kalau invalid, treat as chat
    if (!VALID_ACTIONS.includes(action)) {
      return { type: 'chat', reply: reply || 'Oke Adit, Felicia proses ya.', confidence: 0.35 };
    }

    const params = parsed.params && typeof parsed.params === 'object' ? parsed.params : {};

    return {
      type: 'action',
      action,
      params,
      reply: reply || buildActionFallbackReply(action, params),
      confidence: normalizeConfidence(parsed.confidence, 0.9),
    };
  }

  // Default: chat
  return {
    type: 'chat',
    reply: reply || 'Hmm, Felicia kurang paham. Bisa jelaskan lagi Adit?',
    confidence: normalizeConfidence(parsed.confidence, 0.8),
  };
}

/**
 * Parse response yang JSON-nya tidak sempurna (loose regex extraction)
 */
function parseLooseResponse(text) {
  // Cek apakah ada indicator action di teks
  const actionMatch = text.match(/"action"\s*:\s*"([a-z_]+)"/i);
  if (!actionMatch) {
    return null; // Bukan JSON partial — biarkan fallback ke plain text
  }

  const action = actionMatch[1].toLowerCase();
  if (!VALID_ACTIONS.includes(action)) {
    return null;
  }

  const params = {};

  const modeMatch = text.match(/"mode"\s*:\s*"([a-z_]+)"/i);
  if (modeMatch) params.mode = modeMatch[1].toLowerCase();

  const eventIdMatch = text.match(/"eventId"\s*:\s*"([^"]+)"/i);
  if (eventIdMatch) params.eventId = eventIdMatch[1];

  const summaryMatch = text.match(/"summary"\s*:\s*"([^"]+)"/i);
  if (summaryMatch) params.summary = summaryMatch[1];

  const startTimeMatch = text.match(/"startTime"\s*:\s*"([^"]+)"/i);
  if (startTimeMatch) params.startTime = startTimeMatch[1];

  const endTimeMatch = text.match(/"endTime"\s*:\s*"([^"]+)"/i);
  if (endTimeMatch) params.endTime = endTimeMatch[1];

  const categoryMatch = text.match(/"category"\s*:\s*"([^"]+)"/i);
  if (categoryMatch) params.category = categoryMatch[1];

  const contentMatch = text.match(/"content"\s*:\s*"([^"]+)"/i);
  if (contentMatch) params.content = contentMatch[1];

  const dateMatch = text.match(/"date"\s*:\s*"([^"]+)"/i);
  if (dateMatch) params.date = dateMatch[1];

  // Extract reply dari teks
  const replyMatch = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const reply = replyMatch
    ? replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
    : buildActionFallbackReply(action, params);

  return {
    type: 'action',
    action,
    params,
    reply,
    confidence: 0.65,
  };
}

function normalizeConfidence(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function stripCodeFence(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Bersihkan plain text reply — hapus artefak JSON yang tersisa
 */
function cleanPlainTextReply(text) {
  let cleaned = text
    .replace(/^```(?:json)?\s*/gi, '')
    .replace(/\s*```$/gi, '')
    .replace(/^\s*\{[\s\S]*?"reply"\s*:\s*"?/i, '')
    .replace(/"\s*\}\s*$/i, '')
    .trim();

  // Kalau masih terlalu pendek atau aneh, return as-is
  if (cleaned.length < 3) {
    return text.trim();
  }

  return cleaned;
}

function extractReplyText(rawReply) {
  if (typeof rawReply === 'string' && rawReply.trim()) {
    const trimmed = rawReply.trim();

    // Cek apakah reply isinya nested JSON lagi
    try {
      const nested = JSON.parse(trimmed);
      if (nested && typeof nested.reply === 'string' && nested.reply.trim()) {
        return nested.reply.trim();
      }
    } catch {
      // rawReply memang teks natural — bagus
    }

    return trimmed;
  }

  if (rawReply !== undefined && rawReply !== null) {
    const stringified = String(rawReply).trim();
    if (stringified) return stringified;
  }

  return '';
}

function buildActionFallbackReply(action, params = {}) {
  const mode = typeof params?.mode === 'string' ? params.mode.toUpperCase() : null;

  switch (action) {
    case 'set_mode':
      return mode ? `Siap Adit, Felicia aktifkan mode ${mode} ya.` : 'Siap Adit, mode akan diproses.';
    case 'create_event':
      return `Siap Adit, Felicia buat event "${params.summary || ''}" di kalender ya.`;
    case 'delete_event':
      return 'Siap Adit, Felicia hapus eventnya dari kalender.';
    case 'reschedule':
      return 'Siap Adit, Felicia reschedule jadwalnya ya.';
    case 'save_memory':
      return 'Oke Adit, Felicia sudah catat itu. 🧠';
    case 'get_events':
      return 'Oke Adit, Felicia cek jadwalnya ya.';
    default:
      return 'Oke Adit, Felicia proses ya.';
  }
}
