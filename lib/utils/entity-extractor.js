/**
 * Entity Extractor — extract names, places, concepts dari user message
 * Simple regex-based approach (no heavy NLP library, no token cost)
 * 
 * Tujuan: mendeteksi entity (nama orang, tempat, konsep) untuk cross-thread memory linking
 */

/**
 * Extract entities dari user message
 * Returns: { names: [...], places: [...], concepts: [...] }
 */
export function extractEntities(message = '') {
  if (!message || typeof message !== 'string') return { names: [], places: [], concepts: [] };

  const text = String(message).trim();
  const names = [];
  const places = [];
  const concepts = [];

  // Pattern 1: Capitalized names (likely person names)
  // Detects: "Aji", "Budi", "Indonesia", etc.
  const nameMatches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g) || [];
  for (const match of nameMatches) {
    const normalized = match.toLowerCase().trim();
    if (normalized.length > 2 && !COMMON_WORDS.has(normalized)) {
      if (!names.includes(normalized)) {
        names.push(normalized);
      }
    }
  }

  // Pattern 2: Place names (words after "di", "ke", "dari", "di ", etc.)
  // Detects: "di Bandung", "ke Jakarta", "dari Lampung"
  const placePrepositions = /\b(di|ke|dari|di\s|ke\s|dari\s)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi;
  let placeMatch;
  while ((placeMatch = placePrepositions.exec(text)) !== null) {
    const place = placeMatch[2].toLowerCase().trim();
    if (place.length > 2 && !places.includes(place)) {
      places.push(place);
    }
  }

  // Pattern 3: Keywords for concepts (important business/personal terms)
  // Detects common personal/business keywords: utang, kasus, project, goal, target, budget, etc.
  const conceptMatches = text.match(/\b(utang|kasus|project|goal|target|budget|income|expense|task|deadline|meeting|contract|deal|client|vendor|supplier|strategy|plan|roadmap|milestone|sprint|ticket)\b/gi) || [];
  for (const match of conceptMatches) {
    const normalized = match.toLowerCase().trim();
    if (!concepts.includes(normalized)) {
      concepts.push(normalized);
    }
  }

  return {
    names: names.slice(0, 5), // limit to 5 to avoid noise
    places: places.slice(0, 5),
    concepts: concepts.slice(0, 8),
  };
}

/**
 * Extract all meaningful keywords dari message
 * Returns array of keywords untuk searching
 */
export function extractKeywords(message = '') {
  if (!message || typeof message !== 'string') return [];

  const text = String(message).toLowerCase().trim();

  // Split by whitespace & punctuation
  const words = text
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  // Deduplicate
  return [...new Set(words)].slice(0, 10);
}

/**
 * Generate search queries untuk entity-based memory search
 * Combina entity names + concepts untuk maksimal recall
 */
export function generateSearchQueries(entities = {}) {
  const { names = [], places = [], concepts = [] } = entities;
  const queries = [];

  // Query 1: Any name mentioned
  if (names.length > 0) {
    queries.push(...names);
  }

  // Query 2: Any place mentioned
  if (places.length > 0) {
    queries.push(...places);
  }

  // Query 3: Any concept mentioned
  if (concepts.length > 0) {
    queries.push(...concepts);
  }

  // Remove duplicates
  return [...new Set(queries)];
}

// Common English + Indonesian words to ignore
const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'this', 'that', 'these', 'those',
  'yang', 'itu', 'ini', 'ke', 'di', 'dari', 'untuk', 'dengan', 'dan', 'atau', 'tapi',
  'saya', 'kamu', 'dia', 'kami', 'mereka', 'siapa', 'apa', 'mana', 'berapa',
  'adalah', 'tidak', 'ya', 'iya', 'ok', 'oke', 'bagus', 'baik',
]);

// Stop words (high-frequency, low-information words)
const STOP_WORDS = new Set([
  ...COMMON_WORDS,
  'ada', 'punya', 'buat', 'udah', 'sudah', 'belum', 'kalo', 'kalau', 'gitu', 'gimana', 'jadi',
  'terus', 'nah', 'nih', 'duh', 'wah', 'wow', 'yaudah', 'iya', 'iyalah', 'deh', 'lah',
]);

export default extractEntities;
