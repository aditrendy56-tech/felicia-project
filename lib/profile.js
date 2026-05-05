import { getRecentMemories, saveMemory } from './supabase.js';

export const DEFAULT_PROFILE_FACTS = {
  name: 'M. Rendi Adhitya Atmaja Putra',
  knownAliases: ['Adit', 'Rendy', 'Rendi'],
  gender: 'laki-laki',
  domicile: 'Bandar Lampung',
};

const PROFILE_TOPIC_KEYS = {
  name: 'identity_name',
  aliases: 'identity_aliases',
  gender: 'identity_gender',
  domicile: 'identity_domicile',
};

export function normalizeProfileInput(input = {}, fallback = DEFAULT_PROFILE_FACTS) {
  const fallbackAliases = Array.isArray(fallback.knownAliases) ? fallback.knownAliases : [];

  const name = String(input.name || fallback.name || '').trim() || fallback.name;

  const aliasesRaw = Array.isArray(input.knownAliases)
    ? input.knownAliases
    : Array.isArray(input.aliases)
      ? input.aliases
      : String(input.aliases || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);

  const knownAliases = (aliasesRaw.length > 0 ? aliasesRaw : fallbackAliases)
    .map(alias => String(alias || '').trim())
    .filter(Boolean);

  const gender = String(input.gender || fallback.gender || '').trim() || fallback.gender;
  const domicile = String(input.domicile || fallback.domicile || '').trim() || fallback.domicile;

  return { name, knownAliases, gender, domicile };
}

function parseStructuredProfileValue(content = '', topicKey = '') {
  if (!content) return '';

  const structuredMatch = String(content).match(/^(?:STATE|DELTA)\[([^\]]+)\]\s+(.+)$/i);
  if (structuredMatch) {
    const key = String(structuredMatch[1] || '').trim().toLowerCase();
    const value = String(structuredMatch[2] || '').trim();
    if (topicKey && key === String(topicKey).toLowerCase()) {
      return value;
    }
    if (!topicKey) {
      return value;
    }
  }

  return String(content).trim();
}

export function extractProfileFromMemories(memories = [], fallback = DEFAULT_PROFILE_FACTS) {
  const profile = { ...fallback };

  for (const memory of memories) {
    const category = String(memory?.category || '').toLowerCase();
    const topicKey = String(memory?.topic_key || '').toLowerCase();
    if (category !== 'identity') continue;

    const rawContent = String(memory?.content || '').trim();
    if (!rawContent) continue;

    const resolved = parseStructuredProfileValue(rawContent, topicKey);

    if (topicKey === PROFILE_TOPIC_KEYS.name) {
      profile.name = resolved || profile.name;
    }

    if (topicKey === PROFILE_TOPIC_KEYS.aliases) {
      const aliases = resolved
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
      if (aliases.length > 0) {
        profile.knownAliases = aliases;
      }
    }

    if (topicKey === PROFILE_TOPIC_KEYS.gender) {
      profile.gender = resolved || profile.gender;
    }

    if (topicKey === PROFILE_TOPIC_KEYS.domicile) {
      profile.domicile = resolved || profile.domicile;
    }
  }

  return normalizeProfileInput(profile, fallback);
}

export async function getCanonicalProfile() {
  const memories = await getRecentMemories(200);
  return extractProfileFromMemories(memories, DEFAULT_PROFILE_FACTS);
}

export async function saveCanonicalProfile(profileInput = {}) {
  const normalized = normalizeProfileInput(profileInput, DEFAULT_PROFILE_FACTS);

  // Kumpulkan semua saveMemory ke dalam array untuk batch execution (atomicity pattern)
  const memoryUpdates = [
    {
      category: 'identity',
      content: `STATE[${PROFILE_TOPIC_KEYS.name}] ${normalized.name}`,
      topicKey: PROFILE_TOPIC_KEYS.name,
      memoryType: 'state',
      source: 'settings',
    },
    {
      category: 'identity',
      content: `STATE[${PROFILE_TOPIC_KEYS.aliases}] ${normalized.knownAliases.join(', ')}`,
      topicKey: PROFILE_TOPIC_KEYS.aliases,
      memoryType: 'state',
      source: 'settings',
    },
    {
      category: 'identity',
      content: `STATE[${PROFILE_TOPIC_KEYS.gender}] ${normalized.gender}`,
      topicKey: PROFILE_TOPIC_KEYS.gender,
      memoryType: 'state',
      source: 'settings',
    },
    {
      category: 'identity',
      content: `STATE[${PROFILE_TOPIC_KEYS.domicile}] ${normalized.domicile}`,
      topicKey: PROFILE_TOPIC_KEYS.domicile,
      memoryType: 'state',
      source: 'settings',
    },
  ];

  // Execute all saves in parallel + track successes (partial-save prevention)
  try {
    const results = await Promise.all(
      memoryUpdates.map(update => saveMemoryWithErrorTracking(update))
    );

    // Jika ada yang gagal, log warning tapi tetap return normalized (graceful degradation)
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.warn(`[Profile] saveCanonicalProfile: ${failures.length}/${memoryUpdates.length} saves failed`, failures);
      // Dalam production, bisa trigger retry atau alert, tapi jangan corrupt partial state
      if (failures.length === memoryUpdates.length) {
        throw new Error('Semua profile updates gagal, tidak ada yang disimpan.');
      }
    }

    return normalized;
  } catch (err) {
    console.error('[Profile] saveCanonicalProfile error:', err);
    throw err;
  }
}

async function saveMemoryWithErrorTracking(memoryData) {
  try {
    const result = await saveMemory(memoryData);
    return { success: !!result, data: result };
  } catch (err) {
    console.error('[Profile] saveMemoryWithErrorTracking error:', err.message);
    return { success: false, error: err.message };
  }
}
