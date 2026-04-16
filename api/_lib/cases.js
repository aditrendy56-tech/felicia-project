import { getSupabase } from './supabase.js';

/**
 * Create a new case with title, category, entities, summary, details
 */
export async function createCase({
  title,
  category,
  entities = [],
  summary = '',
  details = [],
  relatedMemories = [],
}) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      console.error('[Cases] Supabase not configured');
      return null;
    }

    const payload = {
      title: title.trim(),
      category: category.trim(),
      entities: Array.isArray(entities) ? entities : [],
      summary: summary.trim(),
      details: Array.isArray(details) ? details : [],
      related_memories: Array.isArray(relatedMemories) ? relatedMemories : [],
      status: 'active',
    };

    console.log('[Cases] Creating case:', payload.title);

    const { data, error } = await supabase
      .from('felicia_cases')
      .insert(payload)
      .select('id, title, category, entities, summary, status, created_at');

    if (error) {
      console.error('[Cases] createCase error:', error.message);
      return null;
    }

    console.log('[Cases] Case created:', data?.[0]?.id);
    return data?.[0] || null;
  } catch (err) {
    console.error('[Cases] createCase exception:', err);
    return null;
  }
}

/**
 * Get all cases (active by default, or all if filter = null)
 */
export async function getCases(status = 'active') {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    let query = supabase.from('felicia_cases').select('*').order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Cases] getCases error:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Cases] getCases exception:', err);
    return [];
  }
}

/**
 * Get case by ID
 */
export async function getCaseById(caseId) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('felicia_cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (error) {
      console.error('[Cases] getCaseById error:', error.message);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error('[Cases] getCaseById exception:', err);
    return null;
  }
}

/**
 * Update case (title, category, summary, status, etc)
 */
export async function updateCase(caseId, updates) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const payload = {};
    if (updates.title) payload.title = updates.title.trim();
    if (updates.category) payload.category = updates.category.trim();
    if (updates.summary !== undefined) payload.summary = updates.summary.trim();
    if (updates.entities) payload.entities = updates.entities;
    if (updates.status) payload.status = updates.status;
    if (updates.details) payload.details = updates.details;
    if (updates.relatedMemories) payload.related_memories = updates.relatedMemories;
    payload.updated_at = new Date().toISOString();

    console.log('[Cases] Updating case:', caseId);

    const { data, error } = await supabase
      .from('felicia_cases')
      .update(payload)
      .eq('id', caseId)
      .select('id, title, category, status, updated_at');

    if (error) {
      console.error('[Cases] updateCase error:', error.message);
      return null;
    }

    console.log('[Cases] Case updated:', caseId);
    return data?.[0] || null;
  } catch (err) {
    console.error('[Cases] updateCase exception:', err);
    return null;
  }
}

/**
 * Add detail/note to case
 */
export async function addCaseDetail(caseId, detail) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const caseData = await getCaseById(caseId);
    if (!caseData) return null;

    const currentDetails = caseData.details || [];
    const newDetail = {
      timestamp: new Date().toISOString(),
      content: detail.trim(),
    };

    const updatedDetails = [...currentDetails, newDetail];

    return await updateCase(caseId, { details: updatedDetails });
  } catch (err) {
    console.error('[Cases] addCaseDetail exception:', err);
    return null;
  }
}

/**
 * Delete case (soft delete by setting status = 'deleted')
 */
export async function deleteCase(caseId) {
  try {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase
      .from('felicia_cases')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', caseId);

    if (error) {
      console.error('[Cases] deleteCase error:', error.message);
      return false;
    }

    console.log('[Cases] Case deleted (soft):', caseId);
    return true;
  } catch (err) {
    console.error('[Cases] deleteCase exception:', err);
    return false;
  }
}

/**
 * Search cases by keyword in title/summary/entities
 */
export async function searchCases(keyword) {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('felicia_cases')
      .select('*')
      .or(`title.ilike.%${keyword}%,summary.ilike.%${keyword}%`)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Cases] searchCases error:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Cases] searchCases exception:', err);
    return [];
  }
}

/**
 * Get cases by category
 */
export async function getCasesByCategory(category) {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('felicia_cases')
      .select('*')
      .eq('category', category)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Cases] getCasesByCategory error:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Cases] getCasesByCategory exception:', err);
    return [];
  }
}

/**
 * Extract entities dari text (simple: nama orang, kata kunci)
 * Bisa di-enhance dengan NLP later
 */
export function extractEntities(text) {
  // Simple pattern: capitalize words yang mungkin nama
  // TODO: bisa replace dengan actual NLP library nanti
  const words = text.split(/\s+/);
  const entities = words
    .filter((w) => /^[A-Z]/.test(w) && w.length > 2)
    .filter((v, i, a) => a.indexOf(v) === i); // unique
  return entities;
}

/**
 * ✨ Phase 2: Analyze message untuk detect case references
 * Return array of matching cases dengan relevance score
 */
export async function analyzeChatForCaseReference(message) {
  try {
    const cases = await getCases('active');
    if (!cases || cases.length === 0) return [];

    const matches = [];
    const messageLower = message.toLowerCase();

    cases.forEach(caseItem => {
      let relevanceScore = 0;

      // Check title
      if (messageLower.includes(caseItem.title.toLowerCase())) {
        relevanceScore += 100;
      }

      // Check entities
      if (caseItem.entities && Array.isArray(caseItem.entities)) {
        caseItem.entities.forEach(entity => {
          if (messageLower.includes(entity.toLowerCase())) {
            relevanceScore += 50;
          }
        });
      }

      // Check keywords dari summary
      if (caseItem.summary) {
        const keywords = caseItem.summary.split(' ').slice(0, 10);
        keywords.forEach(kw => {
          if (kw.length > 3 && messageLower.includes(kw.toLowerCase())) {
            relevanceScore += 20;
          }
        });
      }

      // Check category keywords
      const categoryKeywords = {
        financial: ['utang', 'bayar', 'uang', 'hutang', 'cicilan', 'investasi'],
        relationship: ['percintaan', 'cinta', 'couple', 'hubungan', 'pacaran', 'mantan'],
        health: ['sakit', 'kesehatan', 'dokter', 'sehat', 'penyakit', 'rumah sakit'],
        work: ['kerja', 'pekerjaan', 'project', 'tugas', 'bos', 'rekan kerja'],
      };

      if (categoryKeywords[caseItem.category]) {
        categoryKeywords[caseItem.category].forEach(kw => {
          if (messageLower.includes(kw)) {
            relevanceScore += 15;
          }
        });
      }

      if (relevanceScore > 0) {
        matches.push({
          id: caseItem.id,
          title: caseItem.title,
          category: caseItem.category,
          entities: caseItem.entities || [],
          relevanceScore,
        });
      }
    });

    // Sort by relevance score, return top 3
    return matches.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 3);
  } catch (error) {
    console.error('[Cases] Error analyzing chat for case reference:', error);
    return [];
  }
}

/**
 * ✨ Phase 2: Extract keywords dari case untuk matching
 */
export async function extractCaseKeywords(caseData) {
  const keywords = [];

  if (caseData.title) keywords.push(...caseData.title.split(' '));
  if (caseData.entities && Array.isArray(caseData.entities)) {
    keywords.push(...caseData.entities);
  }
  if (caseData.summary) {
    keywords.push(...caseData.summary.split(' ').slice(0, 20));
  }

  return keywords.filter(kw => kw && kw.length > 2);
}

/**
 * ✨ Phase 2: Get related cases berdasarkan shared entities/category
 */
export async function getRelatedCases(caseId) {
  try {
    const targetCase = await getCaseById(caseId);
    if (!targetCase) return [];

    const allCases = await getCases('active');
    const related = [];

    allCases.forEach(c => {
      if (c.id === caseId) return; // Skip self

      let relevance = 0;

      // Shared entities
      if (targetCase.entities && c.entities) {
        const sharedEntities = targetCase.entities.filter(e =>
          c.entities.includes(e)
        );
        relevance += sharedEntities.length * 50;
      }

      // Shared category
      if (targetCase.category === c.category) {
        relevance += 30;
      }

      if (relevance > 0) {
        related.push({
          id: c.id,
          title: c.title,
          category: c.category,
          relevance,
          reason: targetCase.entities?.some(e =>
            c.entities?.includes(e)
          ) ? `Sama-sama tentang ${targetCase.entities?.[0]}` : `Kategori ${c.category} sama`,
        });
      }
    });

    return related.sort((a, b) => b.relevance - a.relevance);
  } catch (error) {
    console.error('[Cases] Error getting related cases:', error);
    return [];
  }
}

/**
 * ✨ Phase 3: Extract structured case data dari message (heuristic)
 * Fallback ke simple parsing jika pattern match
 */
export async function extractCaseFromMessage(message) {
  try {
    const messageLower = message.toLowerCase();

    // Heuristic patterns
    // Pattern 1: "case [title]" atau "buat case [title]"
    const casePattern = /(?:case|buat case)\s+(.+?)(?:\s*[:,.]|$)/i;
    const caseMatch = message.match(casePattern);

    // Pattern 2: "utang dengan [name]" → financial case
    const utangPattern = /utang\s+(?:dengan|ke|sama)\s+(\w+)/i;
    const utangMatch = message.match(utangPattern);

    // Pattern 3: "percintaan [name]" → relationship case
    const cintaPattern = /percintaan|hubungan\s+(?:dengan|ke)\s+(\w+)/i;
    const cintaMatch = message.match(cintaPattern);

    // Pattern 4: "project [name]" → work case
    const projectPattern = /project\s+(.+?)(?:\s*[:,.]|$)/i;
    const projectMatch = message.match(projectPattern);

    let extracted = {
      title: null,
      category: 'general',
      entities: [],
      summary: message.slice(0, 150),
    };

    // Determine category + title based on pattern match
    if (utangMatch) {
      extracted.category = 'financial';
      extracted.title = `Utang dengan ${utangMatch[1]}`;
      extracted.entities = [utangMatch[1]];
    } else if (cintaMatch) {
      extracted.category = 'relationship';
      extracted.title = `Percintaan dengan ${cintaMatch[1]}`;
      extracted.entities = [cintaMatch[1]];
    } else if (projectMatch) {
      extracted.category = 'work';
      extracted.title = `Project ${projectMatch[1]}`;
      extracted.entities = extractEntities(projectMatch[1]);
    } else if (caseMatch) {
      extracted.title = caseMatch[1].trim();
      extracted.entities = extractEntities(message);
    }

    // If still no title, try simple entity extraction
    if (!extracted.title) {
      const entities = extractEntities(message);
      if (entities.length > 0) {
        // Guess category from keywords
        if (messageLower.includes('utang') || messageLower.includes('bayar')) {
          extracted.category = 'financial';
        } else if (messageLower.includes('cinta') || messageLower.includes('pacar')) {
          extracted.category = 'relationship';
        } else if (messageLower.includes('sakit') || messageLower.includes('kesehatan')) {
          extracted.category = 'health';
        } else if (messageLower.includes('kerja') || messageLower.includes('project')) {
          extracted.category = 'work';
        }
        extracted.entities = entities;
      }
    }

    return extracted.title ? extracted : null;
  } catch (error) {
    console.error('[Cases] Error extracting case from message:', error);
    return null;
  }
}

/**
 * ✨ Phase 3: Detect apakah message adalah update ke case existing
 */
export async function detectCaseUpdate(message, activeCases = []) {
  try {
    const messageLower = message.toLowerCase();

    for (const caseItem of activeCases) {
      const caseTitle = caseItem.title.toLowerCase();
      const caseEntities = (caseItem.entities || []).map(e => e.toLowerCase());

      // Check jika message mention case title atau entities
      if (messageLower.includes(caseTitle)) {
        return {
          isUpdate: true,
          caseId: caseItem.id,
          caseTitle: caseItem.title,
          detail: message,
        };
      }

      // Check entities
      for (const entity of caseEntities) {
        if (entity.length > 2 && messageLower.includes(entity)) {
          // Double check: jangan false positive untuk common words
          if (!['dan', 'yang', 'untuk', 'dengan', 'dari', 'ke', 'di'].includes(entity)) {
            return {
              isUpdate: true,
              caseId: caseItem.id,
              caseTitle: caseItem.title,
              detail: message,
            };
          }
        }
      }
    }

    return { isUpdate: false };
  } catch (error) {
    console.error('[Cases] Error detecting case update:', error);
    return { isUpdate: false };
  }
}

/**
 * ✨ Phase 3: Generate case summary untuk context injection
 */
export async function generateCaseSummary(caseId) {
  try {
    const caseData = await getCaseById(caseId);
    if (!caseData) return null;

    const detailCount = (caseData.details || []).length;
    const lastDetail = caseData.details?.[caseData.details.length - 1];
    const lastUpdate = lastDetail?.timestamp || caseData.updated_at;

    const summary = {
      id: caseData.id,
      title: caseData.title,
      category: caseData.category,
      status: caseData.status,
      entities: caseData.entities || [],
      createdAt: caseData.created_at,
      lastUpdate,
      detailCount,
      recentDetails: caseData.details?.slice(-3) || [],
      progress: `${detailCount} update`,
      summary: caseData.summary,
    };

    return summary;
  } catch (error) {
    console.error('[Cases] Error generating case summary:', error);
    return null;
  }
}
