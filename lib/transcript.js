import { GoogleGenerativeAI } from '@google/generative-ai';

const TRANSCRIPT_MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const MAX_CONVERT_ITEMS = 40;

export async function convertTranscriptToMemorySeed(
  transcript,
  source = 'transcript_import',
  eventDate = null,
  startDate = null,
  endDate = null,
  splitMode = 'none',
) {
  const trimmedTranscript = String(transcript || '').trim();
  if (!trimmedTranscript) {
    return { items: [], meta: { source, method: 'empty' } };
  }

  const normalizedSplitMode = normalizeSplitMode(splitMode);
  const dateContext = buildDateContext({ eventDate, startDate, endDate });

  if (shouldSplitTranscript(trimmedTranscript, normalizedSplitMode)) {
    const chunks = splitTranscriptByPeriod(trimmedTranscript, normalizedSplitMode, dateContext);
    const combinedItems = [];

    for (const chunk of chunks) {
      const chunkDateContext = buildDateContext({
        eventDate: chunk.periodDate || dateContext.fallbackDate,
        startDate: dateContext.startDate,
        endDate: dateContext.endDate,
      });

      const converted = await convertSingleTranscriptChunk(chunk.text, source, chunkDateContext);
      combinedItems.push(...(converted.items || []));
    }

    const dedupedItems = dedupeSeedItems(combinedItems);
    const cappedResult = capItemsWithMeta(dedupedItems, MAX_CONVERT_ITEMS);

    return {
      items: cappedResult.items,
      meta: {
        source,
        eventDate: dateContext.fallbackDate,
        startDate: dateContext.startDate,
        endDate: dateContext.endDate,
        splitMode: normalizedSplitMode,
        chunkCount: chunks.length,
        method: 'split',
        extractedCount: cappedResult.items.length,
        totalBeforeCap: cappedResult.totalBeforeCap,
        cap: cappedResult.cap,
        capReached: cappedResult.capReached,
      },
    };
  }

  const singleResult = await convertSingleTranscriptChunk(trimmedTranscript, source, dateContext);
  const cappedResult = capItemsWithMeta(singleResult.items || [], MAX_CONVERT_ITEMS);

  return {
    ...singleResult,
    items: cappedResult.items,
    meta: {
      ...(singleResult.meta || {}),
      splitMode: normalizedSplitMode,
      extractedCount: cappedResult.items.length,
      totalBeforeCap: cappedResult.totalBeforeCap,
      cap: cappedResult.cap,
      capReached: cappedResult.capReached,
    },
  };
}

async function convertSingleTranscriptChunk(transcript, source, dateContext) {
  const trimmedTranscript = String(transcript || '').trim();
  if (!trimmedTranscript) {
    return { items: [], meta: { source, method: 'empty' } };
  }

  const aiResult = await tryConvertWithGemini(trimmedTranscript, source, dateContext);
  if (aiResult && Array.isArray(aiResult.items) && aiResult.items.length > 0) {
    return {
      items: normalizeSeedItems(aiResult.items, source, dateContext.fallbackDate),
      meta: {
        source,
        eventDate: dateContext.fallbackDate,
        startDate: dateContext.startDate,
        endDate: dateContext.endDate,
        method: 'gemini',
        extractedCount: aiResult.items.length,
      },
    };
  }

  const fallbackItems = buildHeuristicTranscriptItems(trimmedTranscript, source, dateContext.fallbackDate);
  return {
    items: fallbackItems,
    meta: {
      source,
      eventDate: dateContext.fallbackDate,
      startDate: dateContext.startDate,
      endDate: dateContext.endDate,
      method: 'heuristic',
      extractedCount: fallbackItems.length,
    },
  };
}

async function tryConvertWithGemini(transcript, source, dateContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildTranscriptPrompt(transcript, source, dateContext);

  let lastError = null;

  for (const modelName of TRANSCRIPT_MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(prompt);
      const raw = result.response.text();
      return JSON.parse(stripCodeFence(raw));
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    console.warn('[Transcript] Gemini conversion failed, fallback heuristic used:', lastError?.message || lastError);
  }

  return null;
}

function buildTranscriptPrompt(transcript, source, dateContext) {
  const eventDateInstruction = buildDateInstruction(dateContext);

  return `
Kamu adalah extractor memory untuk sistem personal AI bernama Felicia.

Tugasmu:
1. Baca transcript percakapan user dengan AI.
2. Ekstrak HANYA informasi penting tentang user, visi, tujuan, pola hidup, proyek, kondisi, dan perkembangan.
3. Output WAJIB JSON valid dengan format:
{
  "items": [
    {
      "category": "identity|values|goal|work|learning|health|finance|relationship|spiritual|timeline|general",
      "content": "STATE[...] ... atau DELTA[...] ...",
      "topicKey": "snake_case_topic",
      "memoryType": "state|delta",
      "source": "${source}"
    }
  ]
}

Aturan penting:
- STATE = fakta/kondisi utama yang relatif stabil atau status terbaru.
- DELTA = perubahan, progres, kejadian, atau perkembangan dari waktu ke waktu.
- Jangan ekstrak pesan kecil yang tidak berguna.
- Jangan ekstrak data yang jelas bercanda, kontradiktif, atau tidak konsisten.
- Data identitas permanen (nama/gender/domisi) hanya jika transcript benar-benar kuat dan konsisten.
- Maksimal 40 item paling penting.
- Gunakan Bahasa Indonesia.
- Pastikan topicKey pendek, jelas, snake_case.
- Untuk item yang punya konteks waktu, tambahkan prefix di content: DATE[YYYY-MM-DD] sebelum STATE/DELTA.

Tambahan konteks waktu:
${eventDateInstruction}

Transcript:
"""
${transcript}
"""
  `.trim();
}

function buildHeuristicTranscriptItems(transcript, source, eventDate) {
  const lines = transcript
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => line.length >= 20)
    .slice(0, 120);

  const items = [];
  const seenKeys = new Set();

  for (const line of lines) {
    const lowered = line.toLowerCase();
    const rule = inferRuleFromTranscriptLine(lowered);
    if (!rule) continue;

    const topicKey = rule.topicKey;
    if (seenKeys.has(`${rule.memoryType}:${topicKey}`)) {
      continue;
    }

    seenKeys.add(`${rule.memoryType}:${topicKey}`);
    items.push({
      category: rule.category,
      content: buildMemoryContentWithDate({
        content: `${rule.memoryType === 'delta' ? 'DELTA' : 'STATE'}[${topicKey}] ${sanitizeTranscriptLine(line)}`,
        eventDate,
      }),
      topicKey,
      memoryType: rule.memoryType,
      source,
    });

    if (items.length >= 20) {
      break;
    }
  }

  return items;
}

function inferRuleFromTranscriptLine(lowered) {
  if (/goal|tujuan|visi|jangka panjang|jangka pendek|roadmap/.test(lowered)) {
    return { category: 'goal', topicKey: 'goal_transcript', memoryType: 'state' };
  }
  if (/cepot|coo|startup|bisnis|automation|n8n|freelance|project/.test(lowered)) {
    return { category: 'work', topicKey: 'work_transcript', memoryType: 'state' };
  }
  if (/belajar|skill|javascript|node|ai|system design|programming/.test(lowered)) {
    return { category: 'learning', topicKey: 'learning_transcript', memoryType: 'state' };
  }
  if (/overwhelm|overthinking|mental|percaya diri|cemas|capek|lelah/.test(lowered)) {
    return { category: 'health', topicKey: 'health_mindset_transcript', memoryType: 'state' };
  }
  if (/sekarang|minggu ini|baru|akhirnya|dipindah|berhasil|gagal|sempat/.test(lowered)) {
    return { category: 'timeline', topicKey: 'timeline_transcript_update', memoryType: 'delta' };
  }
  if (/felicia|jarvis|persona|rex|wesker|voice|security/.test(lowered)) {
    return { category: 'values', topicKey: 'vision_felicia_transcript', memoryType: 'state' };
  }

  return null;
}

function normalizeSeedItems(items, source, fallbackEventDate = null) {
  return items
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const category = String(item.category || 'general').trim().toLowerCase() || 'general';
      const memoryType = String(item.memoryType || 'state').trim().toLowerCase() === 'delta' ? 'delta' : 'state';
      const topicKey = toSnakeCase(item.topicKey || `${category}_item`);
      const content = String(item.content || '').trim();
      const eventDate = normalizeEventDate(item.eventDate || fallbackEventDate);
      const prefixedContent = /^(STATE|DELTA)\[[^\]]+\]/i.test(content)
        ? content
        : `${memoryType === 'delta' ? 'DELTA' : 'STATE'}[${topicKey}] ${content}`;

      return {
        category,
        content: buildMemoryContentWithDate({
          content: prefixedContent,
          eventDate,
        }),
        topicKey,
        memoryType,
        source: String(item.source || source || 'transcript_import').trim(),
        eventDate,
      };
    })
    .filter(item => item.content.length > 12);
}

function buildMemoryContentWithDate({ content, eventDate }) {
  const clean = String(content || '').trim();
  if (!clean) return clean;

  const normalizedDate = normalizeEventDate(eventDate);
  if (!normalizedDate) {
    return clean;
  }

  if (/^DATE\[\d{4}-\d{2}-\d{2}\]/i.test(clean)) {
    return clean;
  }

  return `DATE[${normalizedDate}] ${clean}`;
}

function normalizeEventDate(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  return `${matched[1]}-${matched[2]}-${matched[3]}`;
}

function buildDateContext({ eventDate = null, startDate = null, endDate = null } = {}) {
  const normalizedEventDate = normalizeEventDate(eventDate);
  const normalizedStartDate = normalizeEventDate(startDate);
  const normalizedEndDate = normalizeEventDate(endDate);

  const hasRange = Boolean(normalizedStartDate && normalizedEndDate);
  const fallbackDate = normalizedEventDate || normalizedEndDate || normalizedStartDate || null;

  return {
    eventDate: normalizedEventDate,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    hasRange,
    fallbackDate,
  };
}

function buildDateInstruction(dateContext) {
  if (dateContext?.eventDate) {
    return `Gunakan tanggal konteks ini untuk item yang relevan: ${dateContext.eventDate}.`;
  }

  if (dateContext?.hasRange) {
    return `Transcript ini berada pada rentang ${dateContext.startDate} sampai ${dateContext.endDate}. Untuk item yang waktunya tidak eksplisit, boleh pakai tanggal terdekat yang masuk akal dalam rentang itu.`;
  }

  return 'Jika transcript menyebut tanggal/waktu jelas, gunakan itu. Jika tidak jelas, boleh tanpa tanggal konteks.';
}

function normalizeSplitMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'monthly' || mode === 'auto') {
    return mode;
  }
  return 'none';
}

function shouldSplitTranscript(transcript, splitMode) {
  if (splitMode === 'none') return false;
  if (splitMode === 'monthly') return true;

  const text = String(transcript || '');
  const lineCount = text.split(/\r?\n/).length;
  return text.length > 6000 || lineCount > 140;
}

function splitTranscriptByPeriod(transcript, splitMode, dateContext) {
  const lines = String(transcript || '').split(/\r?\n/);
  const chunks = [];

  let current = createChunk(null);

  for (const line of lines) {
    const marker = extractPeriodMarker(line, dateContext);

    if (marker && marker.periodKey !== current.periodKey && current.lines.length > 0) {
      chunks.push(finalizeChunk(current));
      current = createChunk(marker);
      continue;
    }

    if (marker && !current.periodKey) {
      current.periodKey = marker.periodKey;
      current.periodDate = marker.periodDate;
    }

    current.lines.push(line);
  }

  if (current.lines.length > 0) {
    chunks.push(finalizeChunk(current));
  }

  const filtered = chunks.filter(chunk => chunk.text.trim().length > 0);
  const hasPeriodChunks = filtered.some(chunk => Boolean(chunk.periodKey));

  if (!hasPeriodChunks || (splitMode === 'auto' && filtered.length === 1)) {
    return splitChunkBySize(String(transcript || ''), 2600, dateContext.fallbackDate);
  }

  return filtered;
}

function createChunk(marker = null) {
  return {
    periodKey: marker?.periodKey || null,
    periodDate: marker?.periodDate || null,
    lines: [],
  };
}

function finalizeChunk(chunk) {
  return {
    periodKey: chunk.periodKey,
    periodDate: chunk.periodDate,
    text: chunk.lines.join('\n').trim(),
  };
}

function splitChunkBySize(transcript, maxLength = 2600, fallbackDate = null) {
  const text = String(transcript || '').trim();
  if (!text) return [];

  const pieces = [];
  let cursor = 0;
  while (cursor < text.length) {
    const slice = text.slice(cursor, cursor + maxLength);
    pieces.push({
      periodKey: null,
      periodDate: fallbackDate || null,
      text: slice,
    });
    cursor += maxLength;
  }

  return pieces;
}

function extractPeriodMarker(line, dateContext) {
  const raw = String(line || '').trim();
  if (!raw) return null;

  const yearMonthMatch = raw.match(/(?:^|\b)(20\d{2})[-\/](0[1-9]|1[0-2])(?:\b|[-\/][0-3]\d\b)/);
  if (yearMonthMatch) {
    const year = yearMonthMatch[1];
    const month = yearMonthMatch[2];
    return {
      periodKey: `${year}-${month}`,
      periodDate: `${year}-${month}-01`,
    };
  }

  const monthMap = {
    januari: '01', january: '01', jan: '01',
    februari: '02', february: '02', feb: '02',
    maret: '03', march: '03', mar: '03',
    april: '04', apr: '04',
    mei: '05', may: '05',
    juni: '06', june: '06', jun: '06',
    juli: '07', july: '07', jul: '07',
    agustus: '08', august: '08', agu: '08', aug: '08',
    september: '09', sept: '09', sep: '09',
    oktober: '10', october: '10', okt: '10', oct: '10',
    november: '11', nov: '11',
    desember: '12', december: '12', des: '12', dec: '12',
  };

  const monthMatch = raw.toLowerCase().match(/\b(januari|january|jan|februari|february|feb|maret|march|mar|april|apr|mei|may|juni|june|jun|juli|july|jul|agustus|august|agu|aug|september|sept|sep|oktober|october|okt|oct|november|nov|desember|december|des|dec)\b(?:\s+(20\d{2}))?/i);
  if (!monthMatch) {
    return null;
  }

  const month = monthMap[monthMatch[1].toLowerCase()];
  const year = monthMatch[2] || inferYearFromDateContext(dateContext) || 'unknown';
  const periodKey = `${year}-${month}`;
  const periodDate = /^\d{4}$/.test(year) ? `${year}-${month}-01` : (dateContext?.fallbackDate || null);

  return {
    periodKey,
    periodDate,
  };
}

function inferYearFromDateContext(dateContext) {
  const sourceDate = dateContext?.endDate || dateContext?.startDate || dateContext?.eventDate || null;
  if (!sourceDate) return null;
  return String(sourceDate).slice(0, 4);
}

function dedupeSeedItems(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const category = String(item?.category || 'general').toLowerCase();
    const memoryType = String(item?.memoryType || 'state').toLowerCase();
    const topicKey = String(item?.topicKey || 'general_item').toLowerCase();
    const normalizedContent = String(item?.content || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    const fingerprint = `${category}|${memoryType}|${topicKey}|${normalizedContent}`;
    if (seen.has(fingerprint)) {
      continue;
    }

    seen.add(fingerprint);
    result.push(item);
  }

  return result;
}

function capItemsWithMeta(items = [], cap = MAX_CONVERT_ITEMS) {
  const list = Array.isArray(items) ? items : [];
  const safeCap = Number(cap) > 0 ? Number(cap) : MAX_CONVERT_ITEMS;
  const totalBeforeCap = list.length;
  const capReached = totalBeforeCap > safeCap;

  return {
    items: list.slice(0, safeCap),
    totalBeforeCap,
    cap: safeCap,
    capReached,
  };
}

function sanitizeTranscriptLine(line) {
  return String(line || '')
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/^(user|assistant|chatgpt|claude)\s*[:\-]/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSnakeCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'general_item';
}

function stripCodeFence(text) {
  return String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}