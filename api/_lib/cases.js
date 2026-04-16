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
