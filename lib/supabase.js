// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Felicia — Supabase Client + Logging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './utils/embeddings.js';

// Load .env.local if running in Node (for scripts like backfill)
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(currentDir, '../../.env.local');
dotenv.config({ path: envPath, override: true });

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
 * Buat thread percakapan baru (dengan idempotency untuk mencegah duplicate threads pada concurrent create)
 * Table: felicia_chat_threads (id uuid, chat_type text, title text, last_message_at timestamptz, created_at timestamptz)
 */
export async function createChatThread(chatType, title = null, idempotencyToken = null) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const type = VALID_CHAT_TYPES.includes(chatType) ? chatType : 'utama';
    const autoTitle = title || generateDefaultTitle(type);
    
    // Generate idempotency token dari title + type jika tidak diberikan
    const token = idempotencyToken || `thread_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Cek apakah thread dengan title + type sudah exist (recent 30 detik)
    const now = new Date();
    const thirtySecsAgo = new Date(now.getTime() - 30 * 1000).toISOString();
    
    const { data: existingThreads, error: checkError } = await supabase
      .from('felicia_chat_threads')
      .select('id, chat_type, title, created_at')
      .eq('chat_type', type)
      .eq('title', autoTitle)
      .gte('created_at', thirtySecsAgo)
      .limit(1);

    if (!checkError && existingThreads && existingThreads.length > 0) {
      console.log('[Supabase] createChatThread: existing thread found (idempotent), id:', existingThreads[0].id);
      return existingThreads[0];
    }

    const { data, error } = await supabase
      .from('felicia_chat_threads')
      .insert({ chat_type: type, title: autoTitle, last_message_at: new Date().toISOString() })
      .select('id, chat_type, title, last_message_at, created_at')
      .single();

    if (error) {
      // Handle UNIQUE constraint violation gracefully (concurrent create)
      if (error.code === '23505') {
        console.warn('[Supabase] createChatThread: duplicate detected, attempting recovery...');
        const { data: recoveryData } = await supabase
          .from('felicia_chat_threads')
          .select('id, chat_type, title, created_at')
          .eq('chat_type', type)
          .eq('title', autoTitle)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (recoveryData && recoveryData.length > 0) {
          console.log('[Supabase] createChatThread: recovery success, id:', recoveryData[0].id);
          return recoveryData[0];
        }
      }

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

    const responsePayload = typeof response === 'string' ? response : JSON.stringify(response);

    const { error } = await supabase.from('felicia_commands').insert({
      user_id: userId,
      command,
      input: input || null,
      action: action || null,
      response: responsePayload,
      status,
      error_message: errorMessage,
    });
    if (error) console.error('[Supabase] logCommand error:', error.message);

    // Observability upgrade (best-effort): write full trace to felicia_action_logs
    const parsed = parseLogResponse(response);
    const actionExecutionId = parsed?.actionExecutionId || (typeof response === 'object' && response?.data && response.data.actionExecutionId) || null;

    const { error: actionLogError } = await supabase
      .from('felicia_action_logs')
      .insert({
        user_id: userId || 'unknown',
        source: parsed?.source || inferLogSource(command),
        input: input || null,
        parsed_intent: action || command || null,
        action_executed: action || null,
        result: parsed?.preview || responsePayload?.slice(0, 500) || null,
        error: errorMessage || null,
        ai_provider_used: parsed?.ai_provider || null,
        fallback_used: Boolean(parsed?.ai_fallback_used),
        status: status || 'success',
        action_execution_id: actionExecutionId,
      });

    if (actionLogError && actionLogError.code !== '42P01') {
      console.error('[Supabase] logCommand action_logs error:', actionLogError.message);
    }
  } catch (err) {
    console.error('[Supabase] logCommand exception:', err);
  }
}

function parseLogResponse(response) {
  if (!response) return null;

  if (typeof response === 'object') {
    return response;
  }

  const text = String(response || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function inferLogSource(command = '') {
  const value = String(command || '').toLowerCase();
  if (value.includes('discord')) return 'discord';
  if (value.includes('api')) return 'api';
  return 'chat';
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
 * Mendukung signature lama: (content, category)
 * Signature baru: (content, { category, topicKey, lookbackDays, limit })
 */
export async function checkDuplicateMemoryInDB(content, options = null) {
  try {
    const supabase = getSupabase();
    if (!supabase) return false;

    const normalized = normalizeMemoryTextForMatch(content);

    if (!normalized) return false;

    const parsedOptions = parseDuplicateCheckOptions(options);
    const lookbackDays = Number.isFinite(parsedOptions.lookbackDays)
      ? Math.max(1, Math.min(365, parsedOptions.lookbackDays))
      : 180;
    const limit = Number.isFinite(parsedOptions.limit)
      ? Math.max(10, Math.min(300, parsedOptions.limit))
      : 100;
    const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('felicia_memories')
      .select('id, category, content, topic_key, memory_type, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (parsedOptions.category) {
      query = query.eq('category', parsedOptions.category);
    }

    if (parsedOptions.topicKey) {
      query = query.eq('topic_key', parsedOptions.topicKey);
    }

    let { data, error } = await query;

    if (error) {
      if (!isSchemaColumnError(error)) {
        console.error('[Supabase] checkDuplicateMemoryInDB error:', error.message);
        return false;
      }

      let fallbackQuery = supabase
        .from('felicia_memories')
        .select('id, category, content, created_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (parsedOptions.category) {
        fallbackQuery = fallbackQuery.eq('category', parsedOptions.category);
      }

      const fallbackRes = await fallbackQuery;
      if (fallbackRes.error) {
        console.error('[Supabase] checkDuplicateMemoryInDB fallback error:', fallbackRes.error.message);
        return false;
      }

      data = fallbackRes.data || [];
    }

    if (!data || data.length === 0) return false;

    for (const row of data) {
      const rowNorm = normalizeMemoryTextForMatch(row?.content || '');
      if (!rowNorm) continue;

      if (rowNorm === normalized) {
        return true;
      }

      if (Math.min(rowNorm.length, normalized.length) >= 18) {
        if (rowNorm.includes(normalized) || normalized.includes(rowNorm)) {
          return true;
        }
      }

      const similarity = calcTokenSimilarityForMatch(rowNorm, normalized);
      if (similarity >= 0.86) {
        return true;
      }

      if (normalized.length <= 12 || rowNorm.length <= 12) {
        continue;
      }
    }

    return false;
  } catch (err) {
    console.error('[Supabase] checkDuplicateMemoryInDB exception:', err);
    return false;
  }
}

function parseDuplicateCheckOptions(options) {
  if (typeof options === 'string') {
    return {
      category: options,
      topicKey: null,
      lookbackDays: 180,
      limit: 100,
    };
  }

  if (!options || typeof options !== 'object') {
    return {
      category: null,
      topicKey: null,
      lookbackDays: 180,
      limit: 100,
    };
  }

  return {
    category: typeof options.category === 'string' ? options.category : null,
    topicKey: typeof options.topicKey === 'string' ? options.topicKey : null,
    lookbackDays: Number(options.lookbackDays || 180),
    limit: Number(options.limit || 100),
  };
}

function normalizeMemoryTextForMatch(text) {
  return String(text || '')
    .replace(/^(STATE|DELTA)\[[^\]]+\]\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcTokenSimilarityForMatch(leftText, rightText) {
  const leftTokens = new Set(String(leftText || '').split(/\s+/).filter(token => token.length > 1));
  const rightTokens = new Set(String(rightText || '').split(/\s+/).filter(token => token.length > 1));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? (intersection / union) : 0;
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
  idempotencyToken = null,
}) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    // Generate idempotency token jika tidak diberikan (mencegah concurrent duplicates)
    const token = idempotencyToken || generateIdempotencyToken();
    
    // Normalize content untuk constraint unik (lowercase + trim + remove special chars)
    const normalizedContent = normalizeContentForDedup(content);

    const extendedPayload = {
      category: category || 'general',
      content,
      normalized_content: normalizedContent,
      title,
      topic_key: topicKey,
      memory_type: memoryType,
      source,
      version,
      supersedes_id: supersedesId,
      idempotency_token: token,
      attempt_count: 1,
    };

    console.log('[Supabase] saveMemory attempt:', JSON.stringify({ ...extendedPayload, content: '...' }), 'token:', token);

    const { data: insertedData, error } = await supabase
      .from('felicia_memories')
      .insert(extendedPayload)
      .select('id, category, content');

    if (!error) {
      console.log('[Supabase] saveMemory success, id:', insertedData?.[0]?.id, 'token:', token);
      const record = insertedData?.[0];

      // SEMANTIC: attempt to generate embedding and persist it (best-effort)
      try {
        const textForEmbedding = String(content || '').slice(0, 15000);
        const emb = await generateEmbedding(textForEmbedding);
        if (emb && Array.isArray(emb) && emb.length > 0) {
          // Best-effort update; ignore errors
          await supabase
            .from('felicia_memories')
            .update({ embedding: emb })
            .eq('id', record.id);
        }
      } catch (e) {
        console.warn('[Supabase] saveMemory: embedding generation/update failed:', e?.message || e);
      }

      return record;
    }

    // Handle UNIQUE constraint violation (duplicate) — return existing record instead
    if (error.code === '23505') {
      console.warn('[Supabase] saveMemory duplicate detected (UNIQUE constraint), attempting recovery...');
      const existingRecord = await supabase
        .from('felicia_memories')
        .select('id, category, content')
        .eq('normalized_content', normalizedContent)
        .eq('category', category || 'general')
        .eq('topic_key', topicKey)
        .single();
      
      if (existingRecord.data) {
        console.log('[Supabase] saveMemory duplicate recovery: returning existing id:', existingRecord.data.id);
        return existingRecord.data;
      }
    }

    console.error('[Supabase] saveMemory error:', error.code, error.message, error.details, error.hint);

    if (!isSchemaColumnError(error)) {
      return;
    }

    console.log('[Supabase] saveMemory fallback to minimal schema (no idempotency)...');
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('felicia_memories')
      .insert({ 
        category: category || 'general', 
        content,
        normalized_content: normalizedContent,
      })
      .select('id, category, content');

    if (fallbackError) {
      console.error('[Supabase] saveMemory fallback error:', fallbackError.code, fallbackError.message);
    } else {
      console.log('[Supabase] saveMemory fallback success, id:', fallbackData?.[0]?.id);
      return fallbackData?.[0];
    }
  } catch (err) {
    console.error('[Supabase] saveMemory exception:', err);
  }
}

function generateIdempotencyToken() {
  // Generate UUID v4 untuk idempotency token
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeContentForDedup(content) {
  if (!content) return '';
  return content
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // remove special chars
    .replace(/\s+/g, ' '); // normalize whitespace
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

/**
 * Create an action execution record (state machine entry)
 */
export async function createActionExecution({ userId = null, actionName = null, params = null, source = 'chat', threadId = null }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const payload = {
      user_id: userId || null,
      action_name: actionName || null,
      params: params ? JSON.stringify(params) : null,
      source: source || null,
      thread_id: threadId || null,
      status: 'pending',
      attempt_count: 0,
      steps: JSON.stringify([]),
    };

    const { data, error } = await supabase
      .from('felicia_action_executions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.code === '42P01') {
        // Table doesn't exist yet (migration not applied) — skip gracefully
        return null;
      }
      console.error('[Supabase] createActionExecution error:', error.message);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error('[Supabase] createActionExecution exception:', err);
    return null;
  }
}

/**
 * Create or return existing execution if idempotency_key provided and matching recent record
 */
export async function createOrGetActionExecution({ userId = null, actionName = null, params = null, source = 'chat', threadId = null, idempotencyKey = null, idempotencyWindowMinutes = 60 }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    if (idempotencyKey) {
      const since = new Date(Date.now() - Math.max(1, Number(idempotencyWindowMinutes)) * 60 * 1000).toISOString();
      const { data: found, error: findErr } = await supabase
        .from('felicia_action_executions')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!findErr && found && found.length > 0) {
        return found[0];
      }
    }

    const payload = {
      user_id: userId || null,
      action_name: actionName || null,
      params: params ? JSON.stringify(params) : null,
      source: source || null,
      thread_id: threadId || null,
      status: 'pending',
      attempt_count: 0,
      steps: JSON.stringify([]),
      idempotency_key: idempotencyKey || null,
    };

    const { data, error } = await supabase
      .from('felicia_action_executions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.code === '42P01') return null;
      console.error('[Supabase] createOrGetActionExecution error:', error.message);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error('[Supabase] createOrGetActionExecution exception:', err);
    return null;
  }
}

/**
 * Update action execution state
 */
export async function updateActionExecutionState(id, { status = null, attemptCount = null, startedAt = null, finishedAt = null, result = null, errorMessage = null } = {}) {
  try {
    const supabase = getSupabase();
    if (!supabase) return false;

    const payload = {};
    if (status) payload.status = status;
    if (Number.isFinite(attemptCount)) payload.attempt_count = attemptCount;
    if (startedAt) payload.started_at = startedAt;
    if (finishedAt) payload.finished_at = finishedAt;
    if (result !== null && result !== undefined) payload.result = typeof result === 'object' ? result : JSON.stringify(result);
    if (errorMessage) payload.error_message = errorMessage;

    if (Object.keys(payload).length === 0) return false;

    // Protect against overwriting a record that already reached `success`.
    // Only apply updates when the current DB status is NOT 'success'.
    const { data, error } = await supabase
      .from('felicia_action_executions')
      .update(payload)
      .eq('id', id)
      .neq('status', 'success')
      .select('*');

    if (error) {
      if (error.code === '42P01') return false;
      console.error('[Supabase] updateActionExecutionState error:', error.message);
      return false;
    }
    // If no rows were updated (data may be []), treat as not applied.
    if (!data || (Array.isArray(data) && data.length === 0)) return false;
    return true;
  } catch (err) {
    console.error('[Supabase] updateActionExecutionState exception:', err);
    return false;
  }
}

/**
 * Atomically set execution status from 'pending' -> given status.
 * Returns the updated record if applied, or null if the record was not in 'pending' state.
 */
export async function setActionExecutionStatusIfPending(id, { status = 'running', attemptCount = null, startedAt = null } = {}) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const payload = {};
    if (status) payload.status = status;
    if (Number.isFinite(attemptCount)) payload.attempt_count = attemptCount;
    if (startedAt) payload.started_at = startedAt;

    if (Object.keys(payload).length === 0) return null;

    const { data, error } = await supabase
      .from('felicia_action_executions')
      .update(payload)
      .eq('id', id)
      .eq('status', 'pending')
      .select('*')
      .single();

    if (error) {
      if (error.code === '42P01') return null;
      // If no rows matched because status wasn't 'pending', supabase returns 406 or similar; just return null
      // Log unexpected errors
      if (error.code) console.error('[Supabase] setActionExecutionStatusIfPending error:', error.message);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error('[Supabase] setActionExecutionStatusIfPending exception:', err);
    return null;
  }
}

/** Pending confirmations helpers **/
export async function createPendingConfirmation({ userId = null, threadId = null, actionName = null, params = null, ttlSeconds = 300 }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const expiresAt = new Date(Date.now() + (Number(ttlSeconds) * 1000)).toISOString();
    const { data, error } = await supabase
      .from('felicia_pending_confirmations')
      .insert({ user_id: userId || null, thread_id: threadId || null, action_name: actionName, params: params ? JSON.stringify(params) : null, expires_at: expiresAt })
      .select('*')
      .single();
    if (error) {
      console.error('[Supabase] createPendingConfirmation error:', error.message);
      return null;
    }
    return data || null;
  } catch (err) {
    console.error('[Supabase] createPendingConfirmation exception:', err);
    return null;
  }
}

export async function getPendingConfirmationForUser({ userId = null, threadId = null }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const now = new Date().toISOString();
    const query = supabase.from('felicia_pending_confirmations').select('*').eq('cleared', false).gte('expires_at', now).order('created_at', { ascending: false }).limit(1);
    if (threadId) query.eq('thread_id', threadId);
    if (userId) query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) {
      console.error('[Supabase] getPendingConfirmationForUser error:', error.message);
      return null;
    }
    return (data && data.length > 0) ? data[0] : null;
  } catch (err) {
    console.error('[Supabase] getPendingConfirmationForUser exception:', err);
    return null;
  }
}

export async function clearPendingConfirmation(id) {
  try {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.from('felicia_pending_confirmations').update({ cleared: true }).eq('id', id);
    if (error) {
      console.error('[Supabase] clearPendingConfirmation error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Supabase] clearPendingConfirmation exception:', err);
    return false;
  }
}

/**
 * Insert semantic step into felicia_action_steps (for future compound-action analytics)
 */
export async function insertActionStep(executionId, { stepName, attemptNumber = 1, status = 'pending', startedAt = null, finishedAt = null, durationMs = null, input = null, output = null, errorMessage = null }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const payload = {
      action_execution_id: executionId,
      step_name: stepName,
      attempt_number: attemptNumber,
      status,
      started_at: startedAt || new Date().toISOString(),
      finished_at: finishedAt,
      duration_ms: durationMs,
      input: input ? JSON.stringify(input) : null,
      output: output ? JSON.stringify(output) : null,
      error_message: errorMessage,
    };

    const { data, error } = await supabase
      .from('felicia_action_steps')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.code === '42P01') return null; // table doesn't exist yet
      console.error('[Supabase] insertActionStep error:', error.message);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error('[Supabase] insertActionStep exception:', err);
    return null;
  }
}

/**
 * SEMANTIC: Retrieve memories using vector similarity (pgvector + match_memories RPC)
 * Falls back to `getRecentMemories` when embedding generation fails or RPC returns empty
 */
export async function getSemanticMemories(userInput = '', limit = 10, matchThreshold = 0.60) {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    // Try to generate embedding for the query (best-effort)
    let queryEmb = null;
    try {
      const emb = await generateEmbedding(String(userInput || ''));
      if (emb && Array.isArray(emb) && emb.length > 0) queryEmb = emb;
    } catch (e) {
      console.warn('[Supabase] getSemanticMemories: embedding generation failed:', e?.message || e);
    }

    if (!queryEmb) {
      return await getRecentMemories(limit);
    }

    // Call RPC match_memories — returns ordered nearest neighbors
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: queryEmb,
      match_threshold: Number(matchThreshold || 0.60),
      match_count: Number(limit || 10),
    });

    if (error) {
      console.warn('[Supabase] getSemanticMemories rpc error:', error.message);
      return await getRecentMemories(limit);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return await getRecentMemories(limit);
    }

    return data || [];
  } catch (err) {
    console.error('[Supabase] getSemanticMemories exception:', err);
    return await getRecentMemories(limit);
  }
}