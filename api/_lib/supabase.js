// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Felicia — Supabase Client + Logging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabaseClient = null;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset.');
}

export function getSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }

  return supabaseClient;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHAT THREADS — 3 semantic conversation types
// utama (daily ops), refleksi (emotional), strategi (planning)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_CHAT_TYPES = ['utama', 'refleksi', 'strategi'];

/**
 * Buat thread percakapan baru
 * Table: felicia_chat_threads (id uuid, chat_type text, title text, last_message_at timestamptz, created_at timestamptz)
 */
export async function createChatThread(chatType, title = null) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const type = VALID_CHAT_TYPES.includes(chatType) ? chatType : 'utama';
    const autoTitle = title || generateDefaultTitle(type);

    const { data, error } = await supabase
      .from('felicia_chat_threads')
      .insert({ chat_type: type, title: autoTitle, last_message_at: new Date().toISOString() })
      .select('id, chat_type, title, last_message_at, created_at')
      .single();

    if (error) {
      console.error('[Supabase] createChatThread error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[Supabase] createChatThread exception:', err);
    return null;
  }
}

function generateDefaultTitle(chatType) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const labels = { utama: 'Daily', refleksi: 'Refleksi', strategi: 'Strategi' };
  return `${labels[chatType] || 'Chat'} ${dateStr}`;
}

/**
 * Ambil daftar threads berdasarkan chatType, urut dari terbaru
 */
export async function getChatThreads(chatType = null, limit = 30) {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    let query = supabase
      .from('felicia_chat_threads')
      .select('id, chat_type, title, last_message_at, created_at')
      .order('last_message_at', { ascending: false })
      .limit(limit);

    if (chatType && VALID_CHAT_TYPES.includes(chatType)) {
      query = query.eq('chat_type', chatType);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Supabase] getChatThreads error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[Supabase] getChatThreads exception:', err);
    return [];
  }
}

/**
 * Update title thread
 */
export async function updateChatThreadTitle(threadId, title) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    await supabase
      .from('felicia_chat_threads')
      .update({ title })
      .eq('id', threadId);
  } catch (err) {
    console.error('[Supabase] updateChatThreadTitle exception:', err);
  }
}

/**
 * Hapus thread beserta pesannya
 */
export async function deleteChatThread(threadId) {
  try {
    const supabase = getSupabase();
    if (!supabase) return false;

    // Hapus pesan dulu
    await supabase
      .from('felicia_chat_messages')
      .delete()
      .eq('thread_id', threadId);

    const { error } = await supabase
      .from('felicia_chat_threads')
      .delete()
      .eq('id', threadId);

    if (error) {
      console.error('[Supabase] deleteChatThread error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Supabase] deleteChatThread exception:', err);
    return false;
  }
}

/**
 * Simpan pesan ke thread tertentu
 * Table: felicia_chat_messages (id uuid, thread_id uuid, role text, content text, action text, params jsonb, created_at timestamptz)
 */
export async function saveChatMessage(threadId, { role, content, action = null, params = null }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase
      .from('felicia_chat_messages')
      .insert({
        thread_id: threadId,
        role,
        content,
        action: action || null,
        params: params ? JSON.stringify(params) : null,
      });

    if (error) {
      console.error('[Supabase] saveChatMessage error:', error.message);
      return;
    }

    // Update last_message_at di thread
    await supabase
      .from('felicia_chat_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId);
  } catch (err) {
    console.error('[Supabase] saveChatMessage exception:', err);
  }
}

/**
 * Ambil pesan dari thread tertentu (default 30 terbaru, urut kronologis)
 */
export async function getChatMessages(threadId, limit = 30) {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('felicia_chat_messages')
      .select('role, content, action, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Supabase] getChatMessages error:', error.message);
      return [];
    }
    return (data || []).reverse();
  } catch (err) {
    console.error('[Supabase] getChatMessages exception:', err);
    return [];
  }
}

/**
 * Ambil memori yang relevan berdasarkan chatType (scoped memory)
 * - Shared core: semua memori category identity, values
 * - Scoped: filter by chat type category mapping
 * - Cross-link: max 5 items dari type lain yang relevan
 */
export async function getScopedMemories(chatType = 'utama', limit = 25) {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    // Core categories — selalu ditarik di semua type
    const coreCategories = ['identity', 'values', 'general', 'info'];

    // Scoped categories per chat type
    const scopeMap = {
      utama: ['goal', 'info', 'schedule', 'work', 'income', 'learning'],
      refleksi: ['mental', 'relationship', 'health', 'teman', 'spiritual'],
      strategi: ['goal', 'work', 'business', 'finance', 'learning', 'timeline'],
    };

    const scopedCategories = scopeMap[chatType] || scopeMap.utama;
    const allCategories = [...new Set([...coreCategories, ...scopedCategories])];

    // Ambil memori berdasar kategori yang relevan
    const extendedSelect = 'id, category, content, topic_key, memory_type, source, version, supersedes_id, created_at';
    const { data, error } = await supabase
      .from('felicia_memories')
      .select(extendedSelect)
      .in('category', allCategories)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) {
      return (data || []).reverse();
    }

    // Fallback jika schema belum support filter — ambil semua
    if (isSchemaColumnError(error)) {
      const fallback = await supabase
        .from('felicia_memories')
        .select('id, category, content, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      return (fallback.data || []).reverse();
    }

    // Jika error bukan schema, fallback ke getRecentMemories biasa
    console.error('[Supabase] getScopedMemories error:', error?.message);
    return [];
  } catch (err) {
    console.error('[Supabase] getScopedMemories exception:', err);
    return [];
  }
}

/**
 * Log setiap command yang masuk ke tabel felicia_commands
 */
export async function logCommand({ userId, command, input, action, response, status = 'success', errorMessage = null }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.from('felicia_commands').insert({
      user_id: userId,
      command,
      input: input || null,
      action: action || null,
      response: typeof response === 'string' ? response : JSON.stringify(response),
      status,
      error_message: errorMessage,
    });
    if (error) console.error('[Supabase] logCommand error:', error.message);
  } catch (err) {
    console.error('[Supabase] logCommand exception:', err);
  }
}

/**
 * Log aktivasi mode ke tabel felicia_modes
 */
export async function logMode({ mode, note }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.from('felicia_modes').insert({
      mode,
      note: note || null,
    });
    if (error) console.error('[Supabase] logMode error:', error.message);
  } catch (err) {
    console.error('[Supabase] logMode exception:', err);
  }
}

/**
 * Ambil mode aktif terakhir (dalam 24 jam terakhir)
 */
export async function getActiveMode() {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('felicia_modes')
      .select('*')
      .gte('activated_at', twentyFourHoursAgo)
      .order('activated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[Supabase] getActiveMode error:', error.message);
      return null;
    }
    return data && data.length > 0 ? data[0] : null;
  } catch (err) {
    console.error('[Supabase] getActiveMode exception:', err);
    return null;
  }
}

/**
 * Simpan pesan percakapan web chat ke tabel felicia_conversations
 */
export async function saveConversation({ role, content, action = null, params = null }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.from('felicia_conversations').insert({
      role,
      content,
      action: action || null,
      params: params ? JSON.stringify(params) : null,
    });
    if (error) console.error('[Supabase] saveConversation error:', error.message);
  } catch (err) {
    console.error('[Supabase] saveConversation exception:', err);
  }
}

/**
 * Ambil riwayat percakapan terbaru (default 20 pesan terakhir)
 * untuk dikirim ke Gemini sebagai konteks multi-turn
 */
export async function getRecentConversations(limit = 20) {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('felicia_conversations')
      .select('role, content, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Supabase] getRecentConversations error:', error.message);
      return [];
    }
    // Reverse agar urutan kronologis (lama → baru)
    return (data || []).reverse();
  } catch (err) {
    console.error('[Supabase] getRecentConversations exception:', err);
    return [];
  }
}

/**
 * Cek apakah konten memory sudah ada di DB (anti-duplicate serverless-safe)
 * Cocokkan dengan ILIKE untuk case-insensitive + trim whitespace
 */
export async function checkDuplicateMemoryInDB(content, category = null) {
  try {
    const supabase = getSupabase();
    if (!supabase) return false;

    // Normalize: hapus STATE[...]/DELTA[...] prefix kalau ada
    const normalized = String(content || '')
      .replace(/^(STATE|DELTA)\[[^\]]+\]\s*/i, '')
      .trim()
      .toLowerCase();

    if (!normalized) return false;

    let query = supabase
      .from('felicia_memories')
      .select('id, content')
      .ilike('content', `%${normalized}%`)
      .limit(5);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Supabase] checkDuplicateMemoryInDB error:', error.message);
      return false;
    }

    if (!data || data.length === 0) return false;

    // Verifikasi lebih ketat: minimal 80% token overlap
    for (const row of data) {
      const rowNorm = String(row.content || '')
        .replace(/^(STATE|DELTA)\[[^\]]+\]\s*/i, '')
        .trim()
        .toLowerCase();

      const tokensA = new Set(normalized.split(/\s+/));
      const tokensB = new Set(rowNorm.split(/\s+/));
      const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
      const union = new Set([...tokensA, ...tokensB]).size;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity >= 0.8) return true;
    }

    return false;
  } catch (err) {
    console.error('[Supabase] checkDuplicateMemoryInDB exception:', err);
    return false;
  }
}

/**
 * Simpan data/memori personal Adit ke tabel felicia_memories
 * Phase 2-ready: dukung metadata terstruktur + fallback schema lama
 */
export async function saveMemory({
  category,
  content,
  title = null,
  topicKey = null,
  memoryType = null,
  source = 'chat',
  version = null,
  supersedesId = null,
}) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const extendedPayload = {
      category: category || 'general',
      content,
      title,
      topic_key: topicKey,
      memory_type: memoryType,
      source,
      version,
      supersedes_id: supersedesId,
    };

    console.log('[Supabase] saveMemory attempt:', JSON.stringify(extendedPayload));

    const { data: insertedData, error } = await supabase
      .from('felicia_memories')
      .insert(extendedPayload)
      .select('id, category, content');

    if (!error) {
      console.log('[Supabase] saveMemory success, id:', insertedData?.[0]?.id);
      return;
    }

    console.error('[Supabase] saveMemory error:', error.code, error.message, error.details, error.hint);

    if (!isSchemaColumnError(error)) {
      return;
    }

    console.log('[Supabase] saveMemory fallback to minimal schema...');
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('felicia_memories')
      .insert({ category: category || 'general', content })
      .select('id');

    if (fallbackError) {
      console.error('[Supabase] saveMemory fallback error:', fallbackError.code, fallbackError.message);
    } else {
      console.log('[Supabase] saveMemory fallback success, id:', fallbackData?.[0]?.id);
    }
  } catch (err) {
    console.error('[Supabase] saveMemory exception:', err);
  }
}

/**
 * Ambil memori personal terbaru
 * Phase 2-ready: prefer kolom metadata baru, fallback ke schema lama
 */
export async function getRecentMemories(limit = 10) {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    const extendedSelect = 'id, category, content, topic_key, memory_type, source, version, supersedes_id, created_at';
    const extendedQuery = await supabase
      .from('felicia_memories')
      .select(extendedSelect)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!extendedQuery.error) {
      return (extendedQuery.data || []).reverse();
    }

    if (!isSchemaColumnError(extendedQuery.error)) {
      console.error('[Supabase] getRecentMemories error:', extendedQuery.error.message);
      return [];
    }

    const fallbackQuery = await supabase
      .from('felicia_memories')
      .select('id, category, content, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fallbackQuery.error) {
      console.error('[Supabase] getRecentMemories fallback error:', fallbackQuery.error.message);
      return [];
    }

    return (fallbackQuery.data || []).reverse().map(memory => ({
      ...memory,
      topic_key: null,
      memory_type: null,
      source: null,
      version: null,
      supersedes_id: null,
    }));
  } catch (err) {
    console.error('[Supabase] getRecentMemories exception:', err);
    return [];
  }
}

function isSchemaColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('column') && (
    message.includes('does not exist') ||
    message.includes('unknown') ||
    message.includes('not found')
  );
}

/**
 * Ambil log commands dalam rentang waktu tertentu (untuk weekly review)
 */
export async function getCommandLogs(fromDate, toDate) {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('felicia_commands')
      .select('*')
      .gte('created_at', fromDate)
      .lte('created_at', toDate)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Supabase] getCommandLogs error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[Supabase] getCommandLogs exception:', err);
    return [];
  }
}
