const EPHEMERAL_CATEGORIES = new Set(['ephemeral', 'smalltalk', 'chat']);
const WORKING_CATEGORIES = new Set(['goal', 'finance', 'event', 'schedule', 'case', 'mode', 'work']);

const IGNORE_PATTERNS = [
  /^hai+$/i,
  /^halo+$/i,
  /^makasih+$/i,
  /^terima\s+kasih+$/i,
  /^ok(ay)?$/i,
  /^sip+$/i,
  /^wkwk+/i,
];

export function classifyMemoryTier({ category = '', memoryType = '' } = {}) {
  const normalizedCategory = String(category || '').toLowerCase();
  const normalizedType = String(memoryType || '').toLowerCase();

  if (normalizedType === 'ephemeral' || EPHEMERAL_CATEGORIES.has(normalizedCategory)) {
    return 'ephemeral';
  }

  if (normalizedType === 'working' || WORKING_CATEGORIES.has(normalizedCategory)) {
    return 'working';
  }

  return 'long-term';
}

export function calculateMemoryScore(content = '', userMessage = '') {
  return scoreMemory({
    content,
    type: 'generic',
    repetition: 0,
    importance: inferImportance(content, userMessage),
  });
}

export function scoreMemory({ content = '', type = 'generic', repetition = 0, importance = 0.5 } = {}) {
  const text = String(content || '').toLowerCase();

  let score = 0.15;

  if (text.length >= 20) score += 0.2;
  if (text.length >= 60) score += 0.1;
  if (text.length >= 120) score += 0.05;

  if (/\b(selalu|biasanya|prefer|tujuan|target|penting)\b/i.test(text)) {
    score += 0.2;
  }

  const normalizedRepetition = Math.max(0, Math.min(1, Number(repetition) / 5));
  score += normalizedRepetition * 0.15;

  const normalizedImportance = Math.max(0, Math.min(1, Number(importance)));
  score += normalizedImportance * 0.2;

  if (type === 'working') {
    score += 0.08;
  }

  if (type === 'long-term') {
    score += 0.12;
  }

  if (/\b(jam|jadwal|deadline|besok|hari ini)\b/i.test(text)) {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

export function shouldPersistMemory(params = {}, context = {}) {
  const category = String(params.category || 'general').trim();
  const content = sanitizeMemoryContent(params.content);
  const memoryType = String(params.memoryType || params.memory_type || '').trim();

  if (!content || content.length < 5) {
    return reject('Konten memory terlalu pendek.');
  }

  const shouldIgnore = IGNORE_PATTERNS.some((pattern) => pattern.test(content));
  if (shouldIgnore) {
    return reject('Konten terdeteksi small-talk, tidak disimpan sebagai memory.');
  }

  const tier = classifyMemoryTier({ category, memoryType });
  const repetition = getRepetitionSignal(context?.memories, content, category);
  const importance = inferImportance(content, context?.message || '');
  const score = scoreMemory({
    content,
    type: tier,
    repetition,
    importance,
  });

  if (tier === 'long-term' && score < 0.4) {
    return reject('Konten belum cukup kuat untuk long-term memory.');
  }

  return {
    allowed: true,
    reason: null,
    normalized: {
      category,
      content,
      topicKey: String(params.topicKey || params.topic_key || category || 'general').trim(),
      memoryType: memoryType || (tier === 'working' ? 'working' : 'state'),
      tier,
      score,
      repetition,
      importance,
    },
  };
}

import { getSemanticMemories } from '../supabase.js';

// Try semantic search first (pgvector + Gemini embeddings). If semantic search fails or
// returns no results, fall back to the original token-overlap + recency heuristic.
export async function getRelevantMemories(memories = [], userInput = '', limit = 5) {
  // SEMANTIC: try server-side semantic retrieval
  try {
    const sem = await getSemanticMemories(String(userInput || ''), Number(limit || 5));
    if (Array.isArray(sem) && sem.length > 0) {
      // RPC returns objects with content, category, title, memory_type
      return sem.map(item => ({
        ...item,
      }));
    }
  } catch (e) {
    console.warn('[MemoryGuard] Semantic retrieval failed, falling back to heuristic:', e?.message || e);
  }

  // FALLBACK: original heuristic ranking
  const inputTokens = tokenize(userInput);
  const normalizedInput = String(userInput || '').toLowerCase();

  const ranked = (Array.isArray(memories) ? memories : [])
    .map((memory) => {
      const content = String(memory?.content || '');
      const tokens = tokenize(content);
      const overlap = tokens.filter((token) => inputTokens.has(token)).length;
      const recencyBoost = getRecencyBoost(memory?.created_at);
      const phraseBoost = normalizedInput && content.toLowerCase().includes(normalizedInput.slice(0, Math.min(32, normalizedInput.length))) ? 2 : 0;
      const typeBoost = String(memory?.memory_type || '').toLowerCase() === 'state' ? 1 : 0.3;
      const relevance = overlap * 2 + recencyBoost + phraseBoost + typeBoost;
      return { memory, relevance };
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, Math.max(1, Number(limit) || 5))
    .map((entry) => entry.memory);

  return ranked;
}

export function sanitizeMemoryContent(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getRecencyBoost(createdAt) {
  if (!createdAt) return 0;
  const ts = new Date(createdAt).getTime();
  if (!Number.isFinite(ts)) return 0;

  const ageHours = (Date.now() - ts) / (1000 * 60 * 60);
  if (ageHours <= 24) return 2;
  if (ageHours <= 24 * 7) return 1;
  return 0;
}

function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9_]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

function reject(reason) {
  return {
    allowed: false,
    reason,
    normalized: null,
  };
}

function inferImportance(content = '', userMessage = '') {
  const text = `${String(content || '')} ${String(userMessage || '')}`.toLowerCase();
  let importance = 0.45;

  if (/\b(penting|urgent|prioritas|wajib|harus)\b/i.test(text)) importance += 0.25;
  if (/\b(target|goal|deadline|komitmen)\b/i.test(text)) importance += 0.2;
  if (/\b(selalu|kebiasaan|preferensi|identitas)\b/i.test(text)) importance += 0.15;

  return Math.max(0, Math.min(1, Number(importance.toFixed(2))));
}

function getRepetitionSignal(memories = [], content = '', category = 'general') {
  const source = Array.isArray(memories) ? memories : [];
  const normalizedContent = String(content || '').toLowerCase();
  const normalizedCategory = String(category || 'general').toLowerCase();

  let count = 0;
  for (const memory of source) {
    const existingCategory = String(memory?.category || '').toLowerCase();
    const existingContent = String(memory?.content || '').toLowerCase();

    if (existingCategory === normalizedCategory) {
      count += 1;
      continue;
    }

    if (normalizedContent && existingContent.includes(normalizedContent.slice(0, 20))) {
      count += 1;
    }
  }

  return count;
}
