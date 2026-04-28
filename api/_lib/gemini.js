// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Felicia — Gemini AI Integration (Personal Assistant)
// Supports flexible chat + action response format
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildSystemPrompt } from './core/prompt-builder.js';
import { parseGeminiResponse } from './core/intent-classifier.js';

// Urutan: model terbaik dulu, fallback ke model yang quota-nya lebih besar
// gemini-1.5-flash-8b punya free tier lebih besar (1000 req/hari) — safety net terakhir
const GEMINI_MODELS = [
  'gemini-2.5-flash',       // best quality, 20 req/day
  'gemini-2.0-flash',       // good quality, 20 req/day
  'gemini-1.5-flash',       // solid quality, 20 req/day (quota terpisah dari 2.x)
  'gemini-1.5-flash-8b',    // lighter, ~1500 req/day — last resort
];

const VALID_ACTIONS = ['create_event', 'delete_event', 'reschedule', 'set_mode', 'save_memory', 'get_events', 'create_case_auto', 'update_case'];

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new GoogleGenerativeAI(apiKey);
}

/**
 * Kirim prompt ke Gemini dan dapatkan response (chat atau action)
 * @param {string} userMessage - pesan dari user
 * @param {object} options
 * @param {string|null} options.mode - mode aktif saat ini
 * @param {Array} options.events - events hari ini dari Google Calendar
 * @param {string|null} options.command - slash command yang dipanggil
 * @param {Array} options.conversationHistory - riwayat percakapan untuk multi-turn
 * @param {Array} options.memories - memori personal Adit
 * @param {object|null} options.profileContext - konteks profil terstruktur (immutable, state, timeline)
 * @param {string} options.responseMode - concise|balanced|detailed
 * @param {string} options.caseContext - ✨ Phase 2: case awareness context
 * @returns {object} { type: 'chat'|'action', action?, params?, reply }
 */
export async function askGemini(userMessage, systemPromptOrOptions = {}, maybeOptions = {}) {
  const hasSystemPromptOverride = typeof systemPromptOrOptions === 'string';
  const options = hasSystemPromptOverride ? (maybeOptions || {}) : (systemPromptOrOptions || {});

  const {
    mode = null,
    events = [],
    command = null,
    conversationHistory = [],
    memories = [],
    profileContext = null,
    responseMode = 'balanced',
    chatType = 'utama',
    caseContext = '',
  } = options;

  const systemPromptOverride = hasSystemPromptOverride ? systemPromptOrOptions : options.systemPrompt;

  const genAI = getGenAI();
  if (!genAI) {
    return {
      type: 'chat',
      reply: 'Gemini API key belum diset di environment Vercel. Coba hubungi Adit ya. 🙏',
      rawResponse: null,
    };
  }

  const systemPrompt = systemPromptOverride || buildSystemPrompt(mode, events, memories, profileContext, chatType, caseContext);
  console.log('[Gemini] System prompt:', systemPrompt.length, 'chars | events:', events?.length || 0, '| memories:', memories?.length || 0, '| chatType:', chatType, '| caseContext:', caseContext.length > 0 ? 'yes' : 'no');

  const effectiveResponseMode = normalizeResponseMode(responseMode);

  // Tambah konteks command ke pesan
  let fullMessage = userMessage;
  if (command) {
    fullMessage = `[Slash Command: /${command}]\n${userMessage}`;
  }

  fullMessage = `${buildResponseStyleInstruction(effectiveResponseMode)}\n${fullMessage}`;

  // Build multi-turn chat history
  const chatHistory = conversationHistory.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));

  let lastError = null;
  let quotaErrorCount = 0;
  let rateLimitErrorCount = 0;
  let lastErrorInfo = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      // Primary: JSON mode — sesuai dengan system prompt yang minta JSON format
      const jsonModel = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.8,
          topP: 0.92,
          maxOutputTokens: resolveMaxOutputTokens(effectiveResponseMode),
          responseMimeType: 'application/json',
        },
      });

      let jsonResult;
      if (chatHistory.length > 0) {
        const chat = jsonModel.startChat({ history: chatHistory });
        jsonResult = await chat.sendMessage(fullMessage);
      } else {
        jsonResult = await jsonModel.generateContent(fullMessage);
      }
      const jsonResponse = safeExtractText(jsonResult, modelName, 'json');
      if (!jsonResponse) {
        throw new Error('Empty or blocked JSON response from ' + modelName);
      }
      const parsed = parseGeminiResponse(jsonResponse);
      // Safeguard: kalau reply terlalu pendek atau terpotong, coba ulang text mode
      if (parsed.type === 'chat' && parsed.reply) {
        const r = parsed.reply.trim();
        const isTruncated = r.length < 30 && !/[.!?。]$/.test(r);
        if (isTruncated) {
          console.warn('[Gemini] Reply kemungkinan terpotong:', r, '— fallback ke text mode');
          throw new Error('Reply truncated, fallback to text mode');
        }
      }
      return {
        ...parsed,
        rawResponse: jsonResponse,
      };
    } catch (jsonErr) {
      console.error('[Gemini] JSON mode error from', modelName, ':', jsonErr?.message || jsonErr);
      lastError = jsonErr;
      const jsonErrorInfo = classifyGeminiError(jsonErr);
      lastErrorInfo = jsonErrorInfo;
      const isQuotaError = jsonErrorInfo.isQuota;
      if (isQuotaError) {
        quotaErrorCount += 1;
        if (jsonErrorInfo.isRateLimit) rateLimitErrorCount += 1;
        console.warn('[Gemini] Quota error on', modelName, '— skipping to next model');
        continue;
      }

      // Fallback: text mode tanpa JSON constraint
      try {
        const textModel = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt + '\n\nIMPORTANT: Respond in plain natural Bahasa Indonesia text. Do NOT use JSON format. Just write your reply directly as text.',
          generationConfig: {
            temperature: 0.8,
            topP: 0.92,
            maxOutputTokens: resolveMaxOutputTokens(effectiveResponseMode),
          },
        });

        let textResult;
        if (chatHistory.length > 0) {
          const chat = textModel.startChat({ history: chatHistory });
          textResult = await chat.sendMessage(fullMessage);
        } else {
          textResult = await textModel.generateContent(fullMessage);
        }
        const textResponse = safeExtractText(textResult, modelName, 'text');
        if (textResponse) {
          return { type: 'chat', reply: textResponse.trim(), rawResponse: textResponse };
        }
        throw new Error('Empty text response from ' + modelName);
      } catch (textErr) {
        console.error('[Gemini] Text mode also failed for', modelName, ':', textErr?.message || textErr);
        lastError = textErr;
        const textErrorInfo = classifyGeminiError(textErr);
        lastErrorInfo = textErrorInfo;
        if (textErrorInfo.isQuota) {
          quotaErrorCount += 1;
          if (textErrorInfo.isRateLimit) rateLimitErrorCount += 1;
        }
      }
    }
  }

  console.error('[Gemini] ALL MODELS FAILED. Last error:', lastError?.message || lastError);
  console.error('[Gemini] Prompt:', systemPrompt?.length, 'chars | History:', chatHistory.length, 'msgs | Message:', fullMessage?.substring(0, 100));

  const isLikelyQuotaIssue = quotaErrorCount > 0 || lastErrorInfo?.isQuota;
  if (isLikelyQuotaIssue) {
    const quotaWarning = buildQuotaWarningMessage({
      retryAfterSeconds: lastErrorInfo?.retryAfterSeconds,
      likelyDailyQuota: lastErrorInfo?.likelyDailyQuota,
      isRateLimit: Boolean(rateLimitErrorCount > 0 || lastErrorInfo?.isRateLimit),
    });

    return {
      type: 'chat',
      reply: quotaWarning,
      rawResponse: null,
      meta: {
        errorType: 'quota',
        isRateLimit: Boolean(rateLimitErrorCount > 0 || lastErrorInfo?.isRateLimit),
        quotaErrorCount,
        rateLimitErrorCount,
        retryAfterSeconds: Number.isFinite(lastErrorInfo?.retryAfterSeconds) ? lastErrorInfo.retryAfterSeconds : null,
        likelyDailyQuota: Boolean(lastErrorInfo?.likelyDailyQuota),
        lastErrorMessage: lastErrorInfo?.message || String(lastError?.message || ''),
      },
    };
  }

  return {
    type: 'chat',
    reply: 'Maaf Adit, Felicia lagi ada gangguan teknis. Tapi tenang, coba lagi sebentar lagi ya. 🙏',
    rawResponse: null,
    meta: {
      errorType: 'technical',
      quotaErrorCount,
      rateLimitErrorCount,
      lastErrorMessage: lastErrorInfo?.message || String(lastError?.message || ''),
    },
  };
}

function classifyGeminiError(error) {
  const rawMessage = String(error?.message || '');
  const message = rawMessage.toLowerCase();
  const code = String(error?.status || error?.code || '').toLowerCase();
  const detailText = JSON.stringify(error?.errorDetails || error?.details || {}).toLowerCase();
  const merged = `${message} ${code} ${detailText}`;

  const isRateLimit =
    merged.includes('429') ||
    merged.includes('rate limit') ||
    merged.includes('too many requests') ||
    merged.includes('resource_exhausted');

  const isQuota =
    isRateLimit ||
    merged.includes('quota') ||
    merged.includes('insufficient quota') ||
    merged.includes('quota exceeded');

  const retryAfterSeconds = extractRetryAfterSeconds(rawMessage, detailText);

  const likelyDailyQuota =
    merged.includes('generaterequestsperdayperprojectpermodel-freetier') ||
    merged.includes('perday') ||
    merged.includes('requests/day') ||
    merged.includes('request per day');

  return {
    isQuota,
    isRateLimit,
    retryAfterSeconds,
    likelyDailyQuota,
    message: String(error?.message || ''),
    code: String(error?.status || error?.code || ''),
  };
}

function extractRetryAfterSeconds(rawMessage, detailText = '') {
  const source = `${String(rawMessage || '')} ${String(detailText || '')}`;

  const retryInMatch = source.match(/retry\s+in\s+([\d.]+)s/i);
  if (retryInMatch?.[1]) {
    const seconds = Number.parseFloat(retryInMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds);
    }
  }

  const retryDelayMatch = source.match(/retrydelay[^\d]*([\d.]+)s/i);
  if (retryDelayMatch?.[1]) {
    const seconds = Number.parseFloat(retryDelayMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds);
    }
  }

  return null;
}

function buildQuotaWarningMessage({ retryAfterSeconds = null, likelyDailyQuota = false, isRateLimit = false } = {}) {
  const etaText = formatEta(retryAfterSeconds);

  if (likelyDailyQuota) {
    return `Waduh Adit, limit harian Gemini free tier buat model ini udah kepakai penuh. ${etaText ? `Sinyal API bilang coba lagi sekitar ${etaText}. ` : 'Aku belum dapat ETA pasti dari API. '}Kalau masih mentok, biasanya baru bisa lagi setelah reset harian (seringnya sekitar 14:00–15:00 WIB). ⏳`;
  }

  if (isRateLimit) {
    return `Waduh Adit, Gemini lagi kena rate limit sementara. ${etaText ? `Coba lagi sekitar ${etaText} ya.` : 'Aku belum dapat ETA pasti dari API, jadi perkiraan amannya coba lagi 15–30 menit lagi ya.'} ⏳`;
  }

  return `Waduh Adit, limit Gemini API lagi kepakai penuh. ${etaText ? `Coba lagi sekitar ${etaText} ya.` : 'Aku belum dapat ETA pasti dari API, jadi coba lagi nanti ya; kalau perlu sekitar 15–30 menit.'} ⏳`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${seconds} detik`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} menit`;

  const hours = Math.ceil(minutes / 60);
  return `${hours} jam`;
}

/**
 * Safely extract text from Gemini response
 * Handles: blocked responses, empty candidates, safety filters, thrown errors
 */
function safeExtractText(result, modelName, mode) {
  try {
    const response = result?.response;
    if (!response) {
      console.warn(`[Gemini] No response object from ${modelName} (${mode})`);
      return null;
    }

    // Check if prompt was blocked
    const feedback = response.promptFeedback;
    if (feedback?.blockReason) {
      console.warn(`[Gemini] BLOCKED by ${feedback.blockReason} from ${modelName} (${mode})`);
      return null;
    }

    // Check candidates exist
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      console.warn(`[Gemini] No candidates from ${modelName} (${mode}). Feedback:`, JSON.stringify(feedback || {}));
      return null;
    }

    const finishReason = candidates[0]?.finishReason;
    if (finishReason === 'SAFETY' || finishReason === 'BLOCKED') {
      console.warn(`[Gemini] Candidate ${finishReason} from ${modelName} (${mode})`);
      return null;
    }

    const text = response.text();
    console.log(`[Gemini] ${mode} from ${modelName}: ${text?.length || 0} chars, finish=${finishReason}, preview=${(text || '').substring(0, 200)}`);
    return text || null;
  } catch (err) {
    console.error(`[Gemini] safeExtractText error (${modelName}/${mode}):`, err?.message);
    return null;
  }
}

function normalizeResponseMode(mode) {
  const candidate = String(mode || '').toLowerCase();
  if (candidate === 'concise' || candidate === 'detailed') {
    return candidate;
  }
  return 'balanced';
}

function resolveMaxOutputTokens(responseMode) {
  // Free-tier optimized: cukup untuk jawaban memuaskan tanpa buang token
  if (responseMode === 'concise') return 800;   // sapaan/short → ~600 karakter
  if (responseMode === 'detailed') return 3200;  // analisis mendalam → ~2400 karakter
  return 1800;                                   // balanced default → ~1350 karakter
}

function buildResponseStyleInstruction(responseMode) {
  if (responseMode === 'concise') {
    return '[Response style: Jawaban ringkas tapi tetap informatif, langsung ke poin inti, 3-4 kalimat.]';
  }

  if (responseMode === 'detailed') {
    return '[Response style: Jelaskan lebih detail, terstruktur dengan sub-poin, gunakan contoh konkret.]';
  }

  return '[Response style: Natural, conversational, substantif. Cukup 2-4 kalimat atau bullet poin singkat. Prioritas: jawab tuntas, jangan potong di tengah pikiran.]';
}

/**
 * Minta Gemini generate morning summary berdasarkan jadwal
 */
export async function generateMorningSummary(events, mode = null) {
  const eventsText = events.length > 0
    ? events.map(e => `- ${e.start} — ${e.end}: ${e.summary}`).join('\n')
    : '(Kosong, tidak ada event hari ini)';

  const prompt = `
Buatkan morning briefing untuk Adit hari ini.

Jadwal hari ini dari Google Calendar:
${eventsText}

${mode ? `Mode aktif: ${mode.toUpperCase()}` : 'Tidak ada mode khusus aktif.'}

Format briefing:
1. Sapaan pagi yang friendly
2. Ringkasan jadwal hari ini (bullet points)
3. Highlight prioritas utama hari ini
4. Satu kalimat motivasi singkat

Response dalam format JSON:
{
  "type": "chat",
  "reply": "... teks briefing ..."
}
`.trim();

  return askGemini(prompt, { mode, events, command: 'cron-morning' });
}

/**
 * Minta Gemini bantu weekly review
 */
export async function generateWeeklyReview(events, logs) {
  const eventsText = events.map(e => `- ${e.date} ${e.start}—${e.end}: ${e.summary}`).join('\n');
  const logsText = logs.map(l => `- [${l.command}] ${l.input || ''} → ${l.action || 'reply'}`).join('\n');

  const prompt = `
Buatkan weekly review untuk Adit minggu ini.

Event minggu ini:
${eventsText || '(tidak ada data)'}

Command logs minggu ini:
${logsText || '(tidak ada data)'}

Analisa:
1. Goal yang tercapai vs terlewat
2. Pola produktivitas
3. Rekomendasi untuk minggu depan
4. Overall score (1-10)

Response dalam format JSON:
{
  "type": "chat",
  "reply": "... teks weekly review ..."
}
`.trim();

  return askGemini(prompt, { command: 'review' });
}
