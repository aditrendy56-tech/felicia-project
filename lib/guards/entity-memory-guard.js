/**
 * Entity-Aware Memory Retrieval — hybrid approach
 * Combines scoped retrieval + entity-based fallback
 * 
 * NO EMBEDDING COST — uses simple ILIKE queries + entity matching
 */

import { extractEntities, generateSearchQueries } from './entity-extractor.js';
import { getSupabase } from '../supabase.js';

/**
 * Get memories with entity-aware fallback
 * 
 * Flow:
 * 1. Get scoped memories (fast, by chatType categories)
 * 2. Extract entities dari user message
 * 3. If scoped results few, fetch entity-related memories dari other categories
 * 4. Merge & deduplicate
 * 5. Return top N by relevance
 * 
 * @param {string} userMessage - user's input message
 * @param {string} chatType - 'utama' | 'refleksi' | 'strategi'
 * @param {number} scopedLimit - how many scoped memories to fetch
 * @param {number} entityLimit - how many entity-matched memories to fetch
 * @returns {Array} merged memories, sorted by relevance
 */
export async function getMemoriesWithEntityFallback(userMessage = '', chatType = 'utama', scopedLimit = 12, entityLimit = 8) {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    // Step 1: Get scoped memories (by chatType categories)
    const coreCategories = ['identity', 'values', 'general', 'info'];
    const scopeMap = {
      utama: ['goal', 'info', 'schedule', 'work', 'income', 'learning'],
      refleksi: ['mental', 'relationship', 'health', 'teman', 'spiritual'],
      strategi: ['goal', 'work', 'business', 'finance', 'learning', 'timeline'],
    };

    const scopedCategories = scopeMap[chatType] || scopeMap.utama;
    const allScopedCategories = [...new Set([...coreCategories, ...scopedCategories])];

    const { data: scopedMemories, error: scopedError } = await supabase
      .from('felicia_memories')
      .select('id, category, content, topic_key, memory_type, created_at, normalized_content')
      .in('category', allScopedCategories)
      .order('created_at', { ascending: false })
      .limit(scopedLimit);

    let allMemories = scopedMemories && !scopedError ? (scopedMemories || []) : [];

    // Step 2: Extract entities from user message
    const entities = extractEntities(userMessage);
    const searchQueries = generateSearchQueries(entities);

    console.log('[MemoryRetrieval] Extracted entities:', { entities, searchQueries });

    // Step 3: Fetch entity-related memories from ANY category if scoped results are few
    if (searchQueries.length > 0 && allMemories.length < scopedLimit * 0.7) {
      // Search for memories that mention any entity (regardless of category)
      let entityMemories = [];

      for (const query of searchQueries.slice(0, 5)) {
        // Limit queries to avoid N+1 problem
        const normalized = normalizeForSearch(query);

        const { data: matched, error: matchError } = await supabase
          .from('felicia_memories')
          .select('id, category, content, topic_key, memory_type, created_at, normalized_content')
          .ilike('normalized_content', `%${normalized}%`) // ILIKE on normalized_content (cheap, no embedding)
          .order('created_at', { ascending: false })
          .limit(entityLimit / searchQueries.length); // distribute limit across queries

        if (!matchError && matched) {
          entityMemories.push(...matched);
        }
      }

      // Merge: scoped + entity memories, remove duplicates by ID
      const memoryMap = new Map();
      for (const mem of allMemories) {
        memoryMap.set(mem.id, { ...mem, source: 'scoped' });
      }
      for (const mem of entityMemories) {
        if (!memoryMap.has(mem.id)) {
          memoryMap.set(mem.id, { ...mem, source: 'entity' });
        }
      }

      allMemories = Array.from(memoryMap.values());
    }

    // Step 4: Sort by relevance (recently created first)
    allMemories.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Step 5: Return top results
    const result = allMemories.slice(0, scopedLimit + entityLimit);
    console.log(
      '[MemoryRetrieval] Final memories count:',
      `${result.length} (${result.filter(m => m.source === 'scoped').length} scoped + ${result.filter(m => m.source === 'entity').length} entity)`
    );

    return result;
  } catch (err) {
    console.error('[MemoryRetrieval] getMemoriesWithEntityFallback exception:', err);
    return [];
  }
}

/**
 * Normalize text for search (match normalized_content in DB)
 */
function normalizeForSearch(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Score memory by relevance to user message
 * Used for ranking if needed
 */
export function scoreMemoryRelevance(memory, userMessage = '', entities = {}) {
  const { content = '', category = '', created_at = null } = memory || {};
  let score = 0;

  // Recency bonus (newer memories score higher)
  const createdTime = new Date(created_at).getTime();
  const now = Date.now();
  const ageHours = (now - createdTime) / (1000 * 60 * 60);
  if (ageHours < 24) score += 0.3;
  else if (ageHours < 7 * 24) score += 0.15;
  else score += 0.05;

  // Category bonus (identity & values always relevant)
  if (category === 'identity' || category === 'values') score += 0.3;
  else if (category === 'general' || category === 'info') score += 0.1;

  // Entity match bonus
  const { names = [] } = entities;
  for (const name of names) {
    if (content.toLowerCase().includes(name)) {
      score += 0.2;
    }
  }

  // Message overlap bonus (if memory mentions user's key words)
  const messageWords = userMessage.toLowerCase().split(/\s+/).slice(0, 5);
  for (const word of messageWords) {
    if (word.length > 3 && content.toLowerCase().includes(word)) {
      score += 0.05;
    }
  }

  return Math.min(1, score);
}

export default getMemoriesWithEntityFallback;
