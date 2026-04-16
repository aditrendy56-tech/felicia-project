// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Felicia — Web Chat Endpoint (Personal AI Assistant)
// POST /api/chat
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { askGemini } from './_lib/gemini.js';
import {
  getEventsToday,
  getEventsDate,
  createEvent,
  updateEvent,
  deleteEvent,
} from './_lib/calendar.js';
import { activateMode } from './_lib/mode.js';
import {
  logCommand,
  getActiveMode,
  saveMemory,
  getRecentMemories,
  checkDuplicateMemoryInDB,
  createChatThread,
  getChatThreads,
  saveChatMessage,
  getChatMessages,
  getScopedMemories,
  deleteChatThread,
  updateChatThreadTitle,
} from './_lib/supabase.js';
import {
  createCase,
  getCases,
  getCaseById,
  extractEntities,
  analyzeChatForCaseReference,
  getRelatedCases,
} from './_lib/cases.js';
import { DEFAULT_PROFILE_FACTS, getCanonicalProfile } from './_lib/profile.js';

const MEMORY_REPEAT_TRACKER = new Map();
const VALID_CHAT_TYPES = ['utama', 'refleksi', 'strategi'];

/**
 * Main handler — POST /api/chat
 * Pusat komando Felicia: personal AI assistant dengan calendar + memory integration
 * Supports: chat messages, thread management (list/create/delete)
 */
export default async function handler(req, res) {
  // ─── CORS headers ───
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ─── 1. Validasi API_SECRET ───
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token || token !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ─── 2. Route berdasarkan action ───
  const body = req.body || {};
  const routeAction = body.action || 'chat';

  // Thread management routes
  if (routeAction === 'list_threads') {
    return handleListThreads(body, res);
  }
  if (routeAction === 'create_thread') {
    return handleCreateThread(body, res);
  }
  if (routeAction === 'delete_thread') {
    return handleDeleteThread(body, res);
  }
  if (routeAction === 'get_messages') {
    return handleGetMessages(body, res);
  }
  if (routeAction === 'rename_thread') {
    return handleRenameThread(body, res);
  }
  if (routeAction === 'save_memory') {
    return handleSaveMemoryAction(body, res);
  }
  if (routeAction === 'get_events') {
    return handleGetEventsAction(body, res);
  }
  if (routeAction === 'set_mode') {
    return handleSetModeAction(body, res);
  }
  if (routeAction === 'create_event') {
    return handleCreateEventAction(body, res);
  }
  if (routeAction === 'delete_event') {
    return handleDeleteEventAction(body, res);
  }
  if (routeAction === 'reschedule') {
    return handleRescheduleAction(body, res);
  }
  if (routeAction === 'create_case') {
    return handleCreateCaseAction(body, res);
  }
  if (routeAction === 'get_cases') {
    return handleGetCasesAction(body, res);
  }
  if (routeAction === 'get_case_suggestions') {
    return handleGetCaseSuggestionsAction(body, res);
  }

  // Default: chat message
  return handleChatMessage(body, res);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// THREAD MANAGEMENT HANDLERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleListThreads(body, res) {
  try {
    const chatType = VALID_CHAT_TYPES.includes(body.chatType) ? body.chatType : null;
    const threads = await getChatThreads(chatType, body.limit || 30);
    return res.status(200).json({ threads });
  } catch (err) {
    console.error('[Chat] listThreads error:', err);
    return res.status(500).json({ error: 'Gagal mengambil daftar thread.' });
  }
}

async function handleCreateThread(body, res) {
  try {
    const chatType = VALID_CHAT_TYPES.includes(body.chatType) ? body.chatType : 'utama';
    const thread = await createChatThread(chatType, body.title || null);
    if (!thread) {
      return res.status(500).json({ error: 'Gagal membuat thread baru.' });
    }
    return res.status(200).json({ thread });
  } catch (err) {
    console.error('[Chat] createThread error:', err);
    return res.status(500).json({ error: 'Gagal membuat thread baru.' });
  }
}

async function handleDeleteThread(body, res) {
  try {
    if (!body.threadId) {
      return res.status(400).json({ error: 'threadId wajib diisi.' });
    }
    const deleted = await deleteChatThread(body.threadId);
    return res.status(200).json({ deleted });
  } catch (err) {
    console.error('[Chat] deleteThread error:', err);
    return res.status(500).json({ error: 'Gagal menghapus thread.' });
  }
}

async function handleGetMessages(body, res) {
  try {
    if (!body.threadId) {
      return res.status(400).json({ error: 'threadId wajib diisi.' });
    }
    const messages = await getChatMessages(body.threadId, body.limit || 30);
    return res.status(200).json({ messages });
  } catch (err) {
    console.error('[Chat] getMessages error:', err);
    return res.status(500).json({ error: 'Gagal mengambil pesan.' });
  }
}

async function handleRenameThread(body, res) {
  try {
    if (!body.threadId || !body.title) {
      return res.status(400).json({ error: 'threadId dan title wajib diisi.' });
    }
    await updateChatThreadTitle(body.threadId, body.title);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Chat] renameThread error:', err);
    return res.status(500).json({ error: 'Gagal rename thread.' });
  }
}

async function handleSaveMemoryAction(body, res) {
  try {
    const params = body.params || {};
    const rawContent = typeof params.content === 'string' ? params.content : body.content;
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';
    const title = typeof params.title === 'string' ? params.title.trim() : null;
    const category = typeof params.category === 'string'
      ? params.category
      : (typeof body.category === 'string' ? body.category : 'general');
    const chatType = VALID_CHAT_TYPES.includes(body.chatType) ? body.chatType : 'utama';

    if (!content) {
      return res.status(400).json({ error: 'Field "content" wajib diisi.' });
    }

    const [knownMemories, canonicalProfile] = await Promise.all([
      safeAsync(() => getScopedMemories(chatType, 20), []),
      safeAsync(getCanonicalProfile, DEFAULT_PROFILE_FACTS),
    ]);

    const memoryDecision = await decideMemorySave(
      { category, content },
      knownMemories,
      `ingat ya: ${content}`,
      canonicalProfile
    );

    if (!memoryDecision.shouldSave) {
      return res.status(200).json({
        ok: true,
        saved: false,
        note: memoryDecision.userNote || buildDuplicateMemoryFeedback(content),
      });
    }

    await saveMemory({ ...memoryDecision.memoryToSave, title });

    await safeAsync(() => logCommand({
      userId: 'web-chat',
      command: 'save_memory_direct',
      input: content,
      action: 'save_memory',
      response: (memoryDecision.userNote || 'Memory disimpan').substring(0, 200),
      status: 'success',
    }));

    return res.status(200).json({
      ok: true,
      saved: true,
      note: memoryDecision.userNote,
      memory: memoryDecision.memoryToSave,
    });
  } catch (err) {
    console.error('[Chat] saveMemoryAction error:', err);
    return res.status(500).json({ error: 'Gagal menyimpan memory.' });
  }
}

async function handleGetEventsAction(body, res) {
  try {
    const params = body.params || {};
    const date = typeof params.date === 'string' && params.date.trim().length > 0
      ? params.date.trim()
      : null;

    const events = date
      ? await safeAsync(() => getEventsDate(date), [])
      : await safeAsync(getEventsToday, []);

    return res.status(200).json({
      ok: true,
      date,
      events: Array.isArray(events) ? events : [],
    });
  } catch (err) {
    console.error('[Chat] getEventsAction error:', err);
    return res.status(500).json({ error: 'Gagal mengambil data jadwal.' });
  }
}

async function handleSetModeAction(body, res) {
  try {
    const params = body.params || {};
    const mode = typeof params.mode === 'string' ? params.mode.trim() : body.mode;

    if (!mode) {
      return res.status(400).json({ error: 'Field "mode" wajib diisi.' });
    }

    const result = await activateMode(mode);

    await safeAsync(() => logCommand({
      userId: 'web-chat',
      command: 'set_mode_direct',
      input: mode,
      action: 'set_mode',
      response: result.message.substring(0, 200),
      status: result.success ? 'success' : 'error',
    }));

    return res.status(200).json({
      ok: result.success,
      message: result.message,
      changes: result.changes || [],
    });
  } catch (err) {
    console.error('[Chat] setModeAction error:', err);
    return res.status(500).json({ error: 'Gagal mengaktifkan mode.' });
  }
}

async function handleCreateEventAction(body, res) {
  try {
    const params = body.params || {};
    const summary = typeof params.summary === 'string' ? params.summary.trim() : '';
    const startTime = typeof params.startTime === 'string' ? params.startTime.trim() : '';
    const endTime = typeof params.endTime === 'string' ? params.endTime.trim() : '';
    const description = typeof params.description === 'string' ? params.description.trim() : '';

    if (!summary || !startTime || !endTime) {
      return res.status(400).json({ error: 'Field summary, startTime, endTime wajib diisi.' });
    }

    const event = await createEvent(summary, startTime, endTime, description);

    if (!event) {
      return res.status(500).json({ error: 'Gagal membuat event di Google Calendar.' });
    }

    await safeAsync(() => logCommand({
      userId: 'web-chat',
      command: 'create_event_direct',
      input: summary,
      action: 'create_event',
      response: `Event "${summary}" berhasil dibuat`.substring(0, 200),
      status: 'success',
    }));

    return res.status(200).json({
      ok: true,
      event,
      message: `✅ Event "${summary}" berhasil ditambahkan ke Google Calendar!`,
    });
  } catch (err) {
    console.error('[Chat] createEventAction error:', err);
    return res.status(500).json({ error: 'Gagal membuat event.' });
  }
}

async function handleDeleteEventAction(body, res) {
  try {
    const params = body.params || {};
    const eventId = typeof params.eventId === 'string' ? params.eventId.trim() : '';

    if (!eventId) {
      return res.status(400).json({ error: 'Field "eventId" wajib diisi.' });
    }

    const deleted = await deleteEvent(eventId);

    if (!deleted) {
      return res.status(500).json({ error: 'Gagal menghapus event dari Google Calendar.' });
    }

    await safeAsync(() => logCommand({
      userId: 'web-chat',
      command: 'delete_event_direct',
      input: eventId,
      action: 'delete_event',
      response: 'Event berhasil dihapus',
      status: 'success',
    }));

    return res.status(200).json({
      ok: true,
      message: '✅ Event berhasil dihapus dari Google Calendar!',
    });
  } catch (err) {
    console.error('[Chat] deleteEventAction error:', err);
    return res.status(500).json({ error: 'Gagal menghapus event.' });
  }
}

async function handleRescheduleAction(body, res) {
  try {
    const params = body.params || {};
    const eventId = typeof params.eventId === 'string' ? params.eventId.trim() : '';
    const startTime = typeof params.startTime === 'string' ? params.startTime.trim() : '';
    const endTime = typeof params.endTime === 'string' ? params.endTime.trim() : '';
    const summary = typeof params.summary === 'string' ? params.summary.trim() : '';

    if (!eventId || !startTime || !endTime) {
      return res.status(400).json({ error: 'Field eventId, startTime, endTime wajib diisi.' });
    }

    const updated = await updateEvent(eventId, { startTime, endTime, summary: summary || undefined });

    if (!updated) {
      return res.status(500).json({ error: 'Gagal reschedule event di Google Calendar.' });
    }

    await safeAsync(() => logCommand({
      userId: 'web-chat',
      command: 'reschedule_direct',
      input: eventId,
      action: 'reschedule',
      response: `Event berhasil di-reschedule ke ${startTime}—${endTime}`.substring(0, 200),
      status: 'success',
    }));

    return res.status(200).json({
      ok: true,
      event: updated,
      message: `✅ Event berhasil di-reschedule ke ${updated.start}—${updated.end}!`,
    });
  } catch (err) {
    console.error('[Chat] rescheduleAction error:', err);
    return res.status(500).json({ error: 'Gagal reschedule event.' });
  }
}

async function handleCreateCaseAction(body, res) {
  try {
    const params = body.params || {};
    const title = typeof params.title === 'string' ? params.title.trim() : '';
    const category = typeof params.category === 'string' ? params.category.trim() : 'general';
    const summary = typeof params.summary === 'string' ? params.summary.trim() : '';
    const entities = Array.isArray(params.entities) ? params.entities : [];

    if (!title) {
      return res.status(400).json({ error: 'Field "title" wajib diisi.' });
    }

    // Extract entities dari summary jika tidak ada explicit entities
    const finalEntities = entities.length > 0 ? entities : extractEntities(summary);

    const newCase = await createCase({
      title,
      category,
      entities: finalEntities,
      summary,
      details: [],
      relatedMemories: [],
    });

    if (!newCase) {
      return res.status(500).json({ error: 'Gagal membuat case baru.' });
    }

    await safeAsync(() => logCommand({
      userId: 'web-chat',
      command: 'create_case_direct',
      input: title,
      action: 'create_case',
      response: `Case "${title}" berhasil dibuat`.substring(0, 200),
      status: 'success',
    }));

    return res.status(200).json({
      ok: true,
      case: newCase,
      message: `✅ Case "${title}" berhasil dibuat!`,
    });
  } catch (err) {
    console.error('[Chat] createCaseAction error:', err);
    return res.status(500).json({ error: 'Gagal membuat case.' });
  }
}

async function handleGetCasesAction(body, res) {
  try {
    const params = body.params || {};
    const status = typeof params.status === 'string' ? params.status : 'active';

    const cases = await getCases(status);

    return res.status(200).json({
      ok: true,
      cases,
      count: cases.length,
    });
  } catch (err) {
    console.error('[Chat] getCasesAction error:', err);
    return res.status(500).json({ error: 'Gagal mengambil daftar case.' });
  }
}

// ✨ Phase 2: Handle case suggestions
async function handleGetCaseSuggestionsAction(body, res) {
  try {
    const params = body.params || {};
    const message = typeof params.message === 'string' ? params.message.trim() : '';

    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }

    const suggestions = await analyzeChatForCaseReference(message);

    return res.status(200).json({
      ok: true,
      message,
      suggestions: suggestions.map(s => ({
        id: s.id,
        title: s.title,
        category: s.category,
        entities: s.entities,
        relevanceScore: s.relevanceScore,
      })),
      count: suggestions.length,
    });
  } catch (err) {
    console.error('[Chat] getCaseSuggestionsAction error:', err);
    return res.status(500).json({ error: 'Gagal menganalisis case suggestions.' });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHAT MESSAGE HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleChatMessage(body, res) {
  const { message, threadId, chatType: rawChatType } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Field "message" wajib diisi.' });
  }

  const pesan = message.trim();
  const chatType = VALID_CHAT_TYPES.includes(rawChatType) ? rawChatType : 'utama';

  // Auto-create thread jika belum ada
  let activeThreadId = threadId || null;
  if (!activeThreadId) {
    const newThread = await safeAsync(() => createChatThread(chatType, null), null);
    activeThreadId = newThread?.id || null;
  }

  try {
    const instantReply = buildInstantReply(pesan);
    if (instantReply) {
      if (activeThreadId) {
        await safeAsync(() => saveChatMessage(activeThreadId, { role: 'user', content: pesan }));
        await safeAsync(() => saveChatMessage(activeThreadId, { role: 'assistant', content: instantReply, action: 'instant_reply' }));
      }
      await safeAsync(() => logCommand({
        userId: 'web-chat',
        command: 'instant_reply',
        input: pesan,
        action: 'instant_reply',
        response: instantReply.substring(0, 200),
      }));

      return res.status(200).json({
        reply: instantReply,
        type: 'chat',
        action: null,
        threadId: activeThreadId,
        chatType,
      });
    }

    // ─── 3. Ambil semua konteks real secara paralel ───
    const [events, activeMode, conversationHistory, memories, canonicalProfile] = await Promise.all([
      safeAsync(getEventsToday, []),
      safeAsync(getActiveMode, null),
      activeThreadId
        ? safeAsync(() => getChatMessages(activeThreadId, 10), [])
        : Promise.resolve([]),
      safeAsync(() => getScopedMemories(chatType, 12), []),
      safeAsync(getCanonicalProfile, DEFAULT_PROFILE_FACTS),
    ]);

    const mode = activeMode?.mode || null;

    // ─── 4. Deterministic route — jawab tanpa Gemini jika bisa ───
    const deterministicResult = await tryDeterministicRoute(pesan, { events, activeMode });
    if (deterministicResult) {
      if (activeThreadId) {
        await safeAsync(() => saveChatMessage(activeThreadId, { role: 'user', content: pesan }));
        await safeAsync(() => saveChatMessage(activeThreadId, { role: 'assistant', content: deterministicResult.reply, action: 'deterministic' }));
      }
      await safeAsync(() => logCommand({
        userId: 'web-chat',
        command: 'deterministic',
        input: pesan,
        action: 'deterministic',
        response: deterministicResult.reply.substring(0, 200),
      }));
      return res.status(200).json({
        reply: deterministicResult.reply,
        type: 'chat',
        action: null,
        threadId: activeThreadId,
        chatType,
      });
    }

    // ─── 5. Simpan pesan user ke thread ───
    if (activeThreadId) {
      await safeAsync(() => saveChatMessage(activeThreadId, { role: 'user', content: pesan }));
    }

    // ─── 6. Tanya ke Gemini (multi-turn + full context) ───
    const profileContext = buildPersonalProfileContext(memories, canonicalProfile);

    const responseMode = inferResponseMode(pesan, chatType);

    // ✨ Phase 2: Case awareness detection
    const potentialCases = await analyzeChatForCaseReference(pesan);
    let caseContext = '';
    if (potentialCases && potentialCases.length > 0) {
      const caseSuggestions = potentialCases
        .map(c => `- ${c.title} (${c.category})${c.entities && c.entities.length > 0 ? ` [${c.entities.join(', ')}]` : ''}`)
        .join('\n');

      caseContext = `\n\n[CASE CONTEXT]\nPesan user mungkin related ke case:\n${caseSuggestions}\nJika relevan, mention case tersebut atau tanya apakah ini update untuk case itu.`;
    }

    const geminiResult = await askGemini(pesan, {
      mode,
      events,
      conversationHistory,
      memories,
      profileContext,
      responseMode,
      chatType,
      caseContext,
    });

    const geminiMeta = geminiResult?.meta || null;
    const commandStatus = geminiMeta?.errorType === 'quota' ? 'quota_limited' : (geminiMeta?.errorType === 'technical' ? 'error' : 'success');
    const commandErrorMessage = geminiMeta?.lastErrorMessage || null;

    // ─── 6. Handle response berdasarkan type ───
    let replyText = '';
    let actionType = 'chat';
    let actionName = null;
    let actionParams = {};

    if (geminiResult.type === 'action' && geminiResult.action) {
      // ═══ TYPE: ACTION — eksekusi aksi ke Calendar/Mode/Memory ═══
      actionType = 'action';
      actionName = geminiResult.action;
      actionParams = geminiResult.params || {};
      replyText = finalizeReplyText(ensureNaturalReply(geminiResult.reply), responseMode);

      console.log('[Chat] action:', actionName, 'params:', JSON.stringify(actionParams));
      const actionResult = await executeAction(actionName, actionParams, events, pesan, memories);
      if (actionResult) {
        replyText += `\n\n${actionResult}`;
      }
    } else {
      // ═══ TYPE: CHAT — balas natural, tidak ada aksi ═══
      // Blok ini HANYA jalan kalau Gemini TIDAK return action apapun.
      // Jadi tidak akan double-save dengan action: save_memory di atas.
      actionType = 'chat';
      replyText = finalizeReplyText(ensureNaturalReply(geminiResult.reply), responseMode);

      const inferredMemory = extractMemoryFromUserMessage(pesan);
      if (inferredMemory) {
        const memoryDecision = await decideMemorySave(inferredMemory, memories, pesan, canonicalProfile);
        if (!memoryDecision.shouldSave) {
          replyText += `\n\n${memoryDecision.userNote || buildDuplicateMemoryFeedback(inferredMemory.content)}`;
        } else {
          await safeAsync(() => saveMemory(memoryDecision.memoryToSave));
          replyText += `\n\n${memoryDecision.userNote}`;
        }
      }
    }

    // ─── 7. Simpan reply Felicia ke thread (source of truth tunggal) ───
    if (activeThreadId) {
      await safeAsync(() => saveChatMessage(activeThreadId, {
        role: 'assistant',
        content: replyText,
        action: actionName,
        params: actionParams,
      }));
    }

    // ─── 8. Log ke felicia_commands (response di-trim 200 chars) ───
    await safeAsync(() => logCommand({
      userId: 'web-chat',
      command: actionType,
      input: pesan,
      action: actionName || 'chat',
      response: replyText.substring(0, 200),
      status: commandStatus,
      errorMessage: commandErrorMessage,
    }));

    // ─── 9. Return response ───
    return res.status(200).json({
      reply: replyText,
      type: actionType,
      action: actionName,
      threadId: activeThreadId,
      chatType,
    });
  } catch (err) {
    console.error('[Chat] Error:', err);

    // PENTING: Jangan pernah return error mentah — selalu balas natural
    const fallbackReply = buildErrorReply(err);

    return res.status(200).json({
      reply: fallbackReply,
      type: 'chat',
      action: null,
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACTION EXECUTOR — Calendar / Mode / Memory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function executeAction(action, params, currentEvents, userMessage = '', knownMemories = []) {
  try {
    switch (action) {
      case 'create_event': {
        const { summary, startTime, endTime, description } = params;
        if (summary && startTime && endTime) {
          const created = await createEvent(summary, startTime, endTime, description || '');
          if (created) {
            return `✅ Event "${summary}" (${created.start}—${created.end}) berhasil ditambahkan ke Google Calendar!`;
          }
          return '⚠️ Gagal membuat event di Google Calendar. Mungkin ada masalah koneksi, tapi Felicia udah coba ya.';
        }
        return '⚠️ Data event belum lengkap — butuh nama event, waktu mulai, dan waktu selesai.';
      }

      case 'delete_event': {
        const wantsBulkDelete = isBulkDeleteIntent(params, userMessage);
        if (wantsBulkDelete) {
          const targetDate = resolveTargetDateForBulkDelete(params, userMessage);
          const eventsToDelete = targetDate
            ? await safeAsync(() => getEventsDate(targetDate), [])
            : currentEvents;

          if (eventsToDelete.length === 0) {
            return targetDate
              ? `📅 Tidak ada event untuk dihapus pada ${targetDate}.`
              : '📅 Tidak ada event hari ini untuk dihapus.';
          }

          if (!hasBulkDeleteConfirmation(userMessage, params)) {
            const previewDate = targetDate ? `tanggal ${targetDate}` : 'hari ini';
            const previewList = eventsToDelete
              .slice(0, 5)
              .map(e => `• ${e.start}—${e.end}: ${e.summary}`)
              .join('\n');
            return `⚠️ Adit, ini aksi berisiko karena akan menghapus ${eventsToDelete.length} event (${previewDate}).\n\nPreview:\n${previewList}${eventsToDelete.length > 5 ? '\n• ...' : ''}\n\nKalau yakin, balas: "konfirmasi hapus semua jadwal ${targetDate || 'hari ini'}".`;
          }

          let deletedCount = 0;
          for (const eventItem of eventsToDelete) {
            const deleted = await safeAsync(() => deleteEvent(eventItem.id), false);
            if (deleted) {
              deletedCount += 1;
            }
          }

          if (deletedCount === 0) {
            return '⚠️ Felicia sudah coba hapus massal, tapi belum ada event yang berhasil dihapus. Coba ulangi ya Adit.';
          }

          const failedCount = eventsToDelete.length - deletedCount;
          if (failedCount > 0) {
            return `✅ ${deletedCount} event berhasil dihapus.${failedCount > 0 ? ` ⚠️ ${failedCount} event gagal dihapus karena kendala teknis.` : ''}`;
          }

          return `✅ Semua event berhasil dihapus (${deletedCount} event).`;
        }

        let { eventId } = params;

        // Jika eventId tidak valid, coba cari dari summary/keyword
        if (!eventId || !isValidGoogleEventId(eventId)) {
          const searchTerm = params.summary || params.eventId || '';
          const found = findEventByKeyword(currentEvents, searchTerm);
          if (found) {
            eventId = found.id;
          } else {
            return `⚠️ Event "${searchTerm}" tidak ditemukan di kalender hari ini. Coba sebutkan nama event yang lebih spesifik ya Adit.`;
          }
        }

        const deleted = await deleteEvent(eventId);
        if (deleted) {
          return `✅ Event berhasil dihapus dari Google Calendar!`;
        }
        return '⚠️ Gagal menghapus event — mungkin eventnya sudah tidak ada di kalender.';
      }

      case 'reschedule': {
        let { eventId, startTime, endTime, summary } = params;

        if (!eventId || !isValidGoogleEventId(eventId)) {
          const searchTerm = summary || params.eventId || '';
          const found = findEventByKeyword(currentEvents, searchTerm);
          if (found) {
            eventId = found.id;
          } else {
            return '⚠️ Event yang mau di-reschedule tidak ditemukan di kalender.';
          }
        }

        const updated = await updateEvent(eventId, { startTime, endTime, summary });
        if (updated) {
          return `✅ Event berhasil di-reschedule ke ${updated.start}—${updated.end}!`;
        }
        return '⚠️ Gagal reschedule event. Coba lagi ya.';
      }

      case 'set_mode': {
        if (params.mode) {
          const modeResult = await activateMode(params.mode);
          return modeResult.message;
        }
        return '⚠️ Mode tidak valid. Pilih: drop, chaos, atau overwork.';
      }

      case 'save_memory': {
        if (params.content) {
          const memoryDecision = await decideMemorySave({
            category: params.category || 'general',
            content: params.content,
          }, knownMemories, userMessage);

          if (!memoryDecision.shouldSave) {
            return memoryDecision.userNote || buildDuplicateMemoryFeedback(params.content);
          }

          await saveMemory(memoryDecision.memoryToSave);
          return memoryDecision.userNote;
        }
        return null;
      }

      case 'get_events': {
        if (params.date) {
          const dateEvents = await safeAsync(() => getEventsDate(params.date), []);
          if (dateEvents.length === 0) {
            return `📅 Tidak ada event di tanggal ${params.date}.`;
          }
          const list = dateEvents.map(e => `• ${e.start}—${e.end}: ${e.summary}`).join('\n');
          return `📅 Jadwal tanggal ${params.date}:\n${list}`;
        }
        return null;
      }

      default:
        return null;
    }
  } catch (err) {
    console.error(`[Chat] executeAction error (${action}):`, err);
    // PENTING: Jangan throw — return pesan error yang natural
    return `⚠️ Ada masalah teknis saat menjalankan ${action}. Tapi tenang, Felicia tetap di sini. Coba lagi ya.`;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Safe async wrapper — jangan biarkan satu error menghancurkan seluruh flow
 */
async function safeAsync(fn, fallback = null) {
  try {
    return await (typeof fn === 'function' ? fn() : fn);
  } catch (err) {
    console.error('[Chat] safeAsync error:', err?.message || err);
    return fallback;
  }
}

/**
 * Cari event dari daftar current events berdasarkan keyword
 */
function findEventByKeyword(events, keyword) {
  if (!keyword || !events || events.length === 0) return null;

  const lower = keyword.toLowerCase();
  return events.find(e =>
    (e.summary || '').toLowerCase().includes(lower) ||
    (e.id || '').toLowerCase() === lower
  ) || null;
}

/**
 * Cek apakah eventId valid Google Calendar event ID
 */
function isValidGoogleEventId(eventId) {
  if (!eventId || typeof eventId !== 'string') return false;
  return /^[a-zA-Z0-9_-]{10,}$/.test(eventId);
}

/**
 * Pastikan reply selalu teks natural, bukan JSON mentah
 */
function ensureNaturalReply(reply) {
  if (typeof reply !== 'string' || !reply.trim()) {
    console.warn('[Chat] ensureNaturalReply: reply is empty/null:', { type: typeof reply, value: reply });
    return 'Oke Adit, Felicia proses ya. 👍';
  }

  const trimmed = reply.trim();

  // Deteksi kalau reply masih berupa JSON
  if (looksLikeJson(trimmed)) {
    console.warn('[Chat] ensureNaturalReply: detected JSON format, attempting parse');
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
        return parsed.reply.trim();
      }
      if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // fallthrough
    }
    // Coba extract reply field dari partial JSON
    const replyMatch = trimmed.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (replyMatch) {
      return replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    console.warn('[Chat] ensureNaturalReply: JSON fallback triggered');
    return 'Oke Adit, Felicia proses ya. 👍';
  }

  return trimmed;
}

function looksLikeJson(text) {
  const plain = text.trim();
  if (plain.startsWith('{') && (/"type"\s*:/i.test(plain) || /"action"\s*:/i.test(plain))) return true;
  if (/^```(?:json)?/i.test(plain) && (/"type"\s*:/i.test(plain) || /"action"\s*:/i.test(plain))) return true;
  return false;
}

function extractMemoryFromUserMessage(message) {
  if (!message || typeof message !== 'string') return null;

  const normalized = message.trim();
  const lower = normalized.toLowerCase();
  const triggers = [
    'inget ya',
    'ingat ya',
    'catat ya',
    'tolong catat',
    'jangan lupa',
    'save ini',
  ];

  if (!triggers.some(trigger => lower.includes(trigger))) {
    return null;
  }

  let content = normalized
    .replace(/^.*?(inget ya|ingat ya|catat ya|tolong catat|jangan lupa|save ini)\s*/i, '')
    .replace(/^(bahwa|kalau|kalo)\s+/i, '')
    .trim();

  if (!content) {
    content = normalized;
  }

  return {
    category: inferMemoryCategory(content),
    content,
  };
}

function inferMemoryCategory(content) {
  const text = String(content || '').toLowerCase();
  if (/goal|target|visi|misi|milestone/.test(text)) return 'goal';
  if (/teman|ortu|keluarga|partner|klien/.test(text)) return 'teman';
  if (/utang|tagihan|bayar|cicilan/.test(text)) return 'utang';
  if (/username|password|akun|nomor|alamat|jadwal/.test(text)) return 'info';
  return 'general';
}

async function decideMemorySave(memoryInput, knownMemories = [], userMessage = '', profileFacts = DEFAULT_PROFILE_FACTS) {
  const category = memoryInput?.category || 'general';
  const content = String(memoryInput?.content || '').trim();
  if (!content) {
    return {
      shouldSave: false,
      memoryToSave: null,
      userNote: '⚠️ Konten memori kosong, jadi belum Felicia simpan.',
    };
  }

  const immutableGuard = evaluateImmutableIdentityGuard(content, userMessage, profileFacts);
  if (!immutableGuard.allowed) {
    return {
      shouldSave: false,
      memoryToSave: null,
      userNote: immutableGuard.note,
    };
  }

  // Layer 1: cek cache lokal (cepat, dari data yang sudah di-fetch)
  const duplicateMemory = findSimilarMemory(knownMemories, content);
  if (duplicateMemory) {
    return {
      shouldSave: false,
      memoryToSave: null,
      userNote: buildDuplicateMemoryFeedback(content),
    };
  }

  // Layer 2: cek langsung ke DB — mencegah race condition di serverless
  // Ini handle kasus: request ke-2 datang sebelum getRecentMemories() sempat baca record dari request ke-1
  const existsInDB = await checkDuplicateMemoryInDB(content, category);
  if (existsInDB) {
    return {
      shouldSave: false,
      memoryToSave: null,
      userNote: buildDuplicateMemoryFeedback(content),
    };
  }

  const topicKey = buildMemoryTopicKey(content, category);
  const relatedMemory = findRelatedMemoryByTopic(knownMemories, topicKey, category);
  const memoryType = relatedMemory && hasChangeSignal(content) ? 'delta' : 'state';
  const structuredContent = addMemoryStructureTag(content, topicKey, memoryType);
  const relatedVersion = Number(relatedMemory?.version || 0);
  const nextVersion = relatedVersion > 0 ? relatedVersion + 1 : 1;

  return {
    shouldSave: true,
    memoryToSave: {
      category,
      content: structuredContent,
      topicKey,
      memoryType,
      source: 'chat',
      version: nextVersion,
      supersedesId: memoryType === 'state' ? (relatedMemory?.id || null) : null,
    },
    userNote: memoryType === 'delta'
      ? '📈 Noted Adit, ini Felicia simpan sebagai perkembangan baru dari poin sebelumnya.'
      : '🧠 Oke Adit, Felicia simpan itu sebagai konteks utama terbaru.',
  };
}

function buildMemoryTopicKey(content, category = 'general') {
  const text = normalizeMemoryText(content);
  if (!text) return `${category}_general`;

  if (/cepot|startup|produk|bisnis|coo/.test(text)) return `${category}_business`;
  if (/shopee|driver|order|income|penghasilan/.test(text)) return `${category}_income`;
  if (/belajar|skill|coding|javascript|node|ai|programming/.test(text)) return `${category}_learning`;
  if (/mindset|overthinking|cemas|percaya diri|rendah diri|mental/.test(text)) return `${category}_mindset`;
  if (/tidur|gym|sakit|capek|recovery|kesehatan/.test(text)) return `${category}_health`;
  if (/jadwal|kalender|deadline|meeting|event/.test(text)) return `${category}_schedule`;

  const words = text.split(' ').filter(word => word.length >= 4).slice(0, 2);
  const suffix = words.length > 0 ? words.join('_') : 'general';
  return `${category}_${suffix}`;
}

function addMemoryStructureTag(content, topicKey, type = 'state') {
  if (/^(STATE|DELTA)\[[^\]]+\]\s+/i.test(content)) {
    return content;
  }

  const label = type === 'delta' ? 'DELTA' : 'STATE';
  return `${label}[${topicKey}] ${content}`;
}

function hasChangeSignal(content) {
  const text = normalizeMemoryText(content);
  if (!text) return false;

  return /(update|berubah|sekarang|jadi|naik|turun|lebih|dari sebelumnya|dibanding|revisi|versi baru)/.test(text);
}

function findRelatedMemoryByTopic(memories = [], topicKey = '', category = 'general') {
  if (!topicKey) return null;

  const target = topicKey.toLowerCase();
  const byCategory = memories.filter(memory => String(memory?.category || '').toLowerCase() === category.toLowerCase());

  for (const memory of byCategory) {
    const directTopicKey = String(memory?.topic_key || '').toLowerCase();
    if (directTopicKey && directTopicKey === target) {
      return memory;
    }

    const memoryContent = String(memory?.content || '');
    const structuredMatch = memoryContent.match(/^(STATE|DELTA)\[([^\]]+)\]/i);
    const existingKey = structuredMatch ? String(structuredMatch[2] || '').toLowerCase() : '';
    if (existingKey && existingKey === target) {
      return memory;
    }
  }

  return null;
}

function findSimilarMemory(memories = [], candidateContent = '') {
  const targetNormalized = normalizeMemoryText(candidateContent);
  if (!targetNormalized) return null;

  for (const memory of memories) {
    const source = memory?.content || '';
    const sourceNormalized = normalizeMemoryText(source);
    if (!sourceNormalized) continue;

    if (sourceNormalized === targetNormalized) {
      return memory;
    }

    if (sourceNormalized.includes(targetNormalized) || targetNormalized.includes(sourceNormalized)) {
      if (Math.min(sourceNormalized.length, targetNormalized.length) >= 12) {
        return memory;
      }
    }

    const similarity = calcTokenSimilarity(sourceNormalized, targetNormalized);
    if (similarity >= 0.82) {
      return memory;
    }
  }

  return null;
}

function normalizeMemoryText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/^(state|delta)\[[^\]]+\]\s*/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcTokenSimilarity(a, b) {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

function buildDuplicateMemoryFeedback(content) {
  const normalizedKey = normalizeMemoryText(content);
  const nextCount = recordMemoryRepeat(normalizedKey);

  if (nextCount <= 1) {
    return '📝 Noted Adit, ini udah pernah kecatat dan Felicia masih paham kok. Kalau ada update detail baru, tinggal bilang ya.';
  }

  if (nextCount === 2) {
    return '📝 Adit, info ini masih sama seperti sebelumnya dan tetap Felicia pegang. Biar nggak bias, boleh kirim versi paling final dalam 1 kalimat ya.';
  }

  return '📝 Adit, kayaknya kita lagi keulang di poin yang sama. Felicia sudah paham inti informasinya; kalau ada revisi, kirim format: "update memory: ..." biar nggak salah paham.';
}

function evaluateImmutableIdentityGuard(content, userMessage = '', profileFacts = DEFAULT_PROFILE_FACTS) {
  const normalized = String(content || '').toLowerCase();
  if (!normalized) {
    return { allowed: true, note: null };
  }

  const canOverridePermanent = hasPermanentOverrideConfirmation(userMessage);

  const mentionsIdentity = /\b(nama|gender|jenis kelamin|domisili|alamat)\b/.test(normalized);
  if (!mentionsIdentity) {
    return { allowed: true, note: null };
  }

  const knownAliases = Array.isArray(profileFacts?.knownAliases) && profileFacts.knownAliases.length > 0
    ? profileFacts.knownAliases
    : DEFAULT_PROFILE_FACTS.knownAliases;

  const canonicalDomicile = String(profileFacts?.domicile || DEFAULT_PROFILE_FACTS.domicile).toLowerCase();

  const nameConflict = /\bnama\b/.test(normalized)
    && !knownAliases.some(alias => normalized.includes(String(alias).toLowerCase()));

  const genderConflict = /(gender|jenis kelamin|aku|saya|gue|gw)/.test(normalized)
    && /(perempuan|wanita|cewek)/.test(normalized);

  const domicileConflict = /(domisili|alamat|tinggal)/.test(normalized)
    && !normalized.includes(canonicalDomicile);

  if ((nameConflict || genderConflict || domicileConflict) && !canOverridePermanent) {
    return {
      allowed: false,
      note: '🛡️ Data identitas permanen tidak Felicia ubah otomatis. Kalau memang mau ubah manual, kirim format: "override permanen: <field>=<value>".',
    };
  }

  return { allowed: true, note: null };
}

function hasPermanentOverrideConfirmation(message = '') {
  const text = String(message || '').toLowerCase();
  return text.includes('override permanen:');
}

function buildPersonalProfileContext(memories = [], profileFacts = DEFAULT_PROFILE_FACTS) {
  const normalizedMemories = Array.isArray(memories) ? memories : [];

  const latestStateByTopic = new Map();
  const timeline = [];

  for (const memory of normalizedMemories) {
    const topicKey = String(memory?.topic_key || 'general').trim() || 'general';
    const type = String(memory?.memory_type || '').toLowerCase() || 'state';
    const content = String(memory?.content || '').replace(/^(STATE|DELTA)\[[^\]]+\]\s*/i, '').trim();

    if (!content) continue;

    if (type === 'state') {
      latestStateByTopic.set(topicKey, content);
    }

    timeline.push({
      category: memory?.category || 'general',
      type,
      content,
      createdAt: memory?.created_at || null,
    });
  }

  const canonicalProfile = {
    name: profileFacts?.name || DEFAULT_PROFILE_FACTS.name,
    knownAliases: Array.isArray(profileFacts?.knownAliases) && profileFacts.knownAliases.length > 0
      ? profileFacts.knownAliases
      : DEFAULT_PROFILE_FACTS.knownAliases,
    gender: profileFacts?.gender || DEFAULT_PROFILE_FACTS.gender,
    domicile: profileFacts?.domicile || DEFAULT_PROFILE_FACTS.domicile,
  };

  const profileLines = [
    `- Nama utama: ${canonicalProfile.name}`,
    `- Alias valid: ${canonicalProfile.knownAliases.join(', ')}`,
    `- Gender permanen: ${canonicalProfile.gender}`,
    `- Domisili utama: ${canonicalProfile.domicile}`,
  ];

  const dynamicState = [...latestStateByTopic.entries()]
    .slice(-8)
    .map(([topic, value]) => `- ${topic}: ${value}`)
    .join('\n') || '- (Belum ada state dinamis)';

  const recentTimeline = timeline
    .slice(-10)
    .map(item => `- [${item.category}] (${item.type}) ${item.content}`)
    .join('\n') || '- (Belum ada timeline update)';

  return {
    immutableProfile: profileLines.join('\n'),
    dynamicState,
    recentTimeline,
  };
}

function recordMemoryRepeat(normalizedKey) {
  if (!normalizedKey) {
    return 1;
  }

  const current = MEMORY_REPEAT_TRACKER.get(normalizedKey) || { count: 0, updatedAt: Date.now() };
  const nextValue = {
    count: current.count + 1,
    updatedAt: Date.now(),
  };
  MEMORY_REPEAT_TRACKER.set(normalizedKey, nextValue);

  pruneOldMemoryRepeatTrackerEntries();

  return nextValue.count;
}

function pruneOldMemoryRepeatTrackerEntries() {
  const now = Date.now();
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000;

  for (const [key, value] of MEMORY_REPEAT_TRACKER.entries()) {
    if (!value || typeof value.updatedAt !== 'number') {
      MEMORY_REPEAT_TRACKER.delete(key);
      continue;
    }

    if ((now - value.updatedAt) > maxAgeMs) {
      MEMORY_REPEAT_TRACKER.delete(key);
    }
  }

  const maxEntries = 500;
  if (MEMORY_REPEAT_TRACKER.size <= maxEntries) {
    return;
  }

  const sortedByOldest = [...MEMORY_REPEAT_TRACKER.entries()]
    .sort((left, right) => (left[1].updatedAt || 0) - (right[1].updatedAt || 0));

  const overflowCount = MEMORY_REPEAT_TRACKER.size - maxEntries;
  for (let index = 0; index < overflowCount; index += 1) {
    MEMORY_REPEAT_TRACKER.delete(sortedByOldest[index][0]);
  }
}

function isBulkDeleteIntent(params = {}, userMessage = '') {
  if (params?.all === true || params?.scope === 'all' || params?.target === 'all') {
    return true;
  }

  const msg = String(userMessage || '').toLowerCase();
  return /hapus\s+semua\s+(jadwal|event)|hapus\s+jadwal\s+semua|clear\s+jadwal/.test(msg);
}

function hasBulkDeleteConfirmation(userMessage = '', params = {}) {
  if (params?.confirmed === true || params?.confirm === true) {
    return true;
  }

  const msg = String(userMessage || '').toLowerCase();
  return msg.includes('konfirmasi') && /hapus\s+semua\s+(jadwal|event)|hapus\s+jadwal\s+semua/.test(msg);
}

function resolveTargetDateForBulkDelete(params = {}, userMessage = '') {
  if (typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    return params.date;
  }

  const msg = String(userMessage || '').toLowerCase();
  const baseDate = getWibDate();

  if (msg.includes('besok')) {
    return formatDateYmd(addDays(baseDate, 1));
  }
  if (msg.includes('lusa')) {
    return formatDateYmd(addDays(baseDate, 2));
  }
  if (msg.includes('hari ini')) {
    return formatDateYmd(baseDate);
  }

  return null;
}

function getWibDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function formatDateYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Build error reply yang natural — JANGAN pernah return "Felicia bingung"
 */
function buildErrorReply(err) {
  const msg = String(err?.message || '').toLowerCase();

  if (msg.includes('quota') || msg.includes('429') || msg.includes('rate limit')) {
    return 'Waduh Adit, Felicia lagi kena limit API nih. Tunggu beberapa menit terus coba lagi ya. Felicia tetap standby kok. ⏳';
  }

  if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('network')) {
    return 'Adit, koneksi Felicia lagi gangguan nih. Coba lagi sebentar ya, harusnya bentar lagi normal. 🔌';
  }

  if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('401') || msg.includes('403')) {
    return 'Ada masalah autentikasi di sistem Felicia. Adit coba cek API key-nya ya. 🔑';
  }

  return 'Maaf Adit, ada sedikit gangguan teknis. Tapi tenang, Felicia bakal coba lagi. Kirim ulang pesannya ya. 🙏';
}

function inferResponseMode(message = '', chatType = 'utama') {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return 'concise';

  // Trigger detailed — minta analisis, panduan lengkap, atau brainstorm dalam
  const detailedSignals = [
    'jelaskan detail', 'jelasin detail', 'rinci', 'mendalam',
    'step by step', 'langkah lengkap', 'analisa mendalam',
    'analisis', 'breakdown', 'review', 'roadmap', 'strategi',
    'brainstorm', 'evaluasi', 'pros cons', 'pros dan cons',
    'gimana caranya', 'bagaimana cara', 'tolong jelaskan',
  ];

  if (detailedSignals.some(signal => text.includes(signal))) {
    return 'detailed';
  }

  // Strategi/refleksi: default balanced (karena butuh kedalaman)
  if (chatType === 'strategi' || chatType === 'refleksi') {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return wordCount <= 4 ? 'concise' : 'balanced';
  }

  // Utama: lebih agresif concise (hemat quota)
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 8) {
    return 'concise';
  }

  return 'balanced';
}

function finalizeReplyText(reply, responseMode = 'balanced') {
  // Hard cap dihapus — biarkan Gemini selesaikan jawaban tanpa dipotong
  // Token limit di resolveMaxOutputTokens sudah cukup sebagai kontrol
  return String(reply || '').trim();
}

function buildInstantReply(message) {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return null;

  if (/^(hai|hi|halo|hello|p|woi|oy|oi)$/i.test(normalized)) {
    return 'Hai Adit 👋 Felicia standby. Kalau mau cepat, tinggal bilang: "jadwal hari ini", "status mode", atau "ingat ya ...".';
  }

  if (/^(makasih|terima kasih|thanks|thx|tq|thank you)$/i.test(normalized)) {
    return 'Sama-sama Adit 🤍';
  }

  if (/^(test|tes|testing)$/i.test(normalized)) {
    return 'Masuk kok Adit. Felicia online dan siap bantu.';
  }

  if (/^(gm|good morning|pagi|selamat pagi)$/i.test(normalized)) {
    return 'Pagi Adit ☀️ Semangat hari ini! Ada yang mau dikerjain bareng?';
  }

  if (/^(gn|good night|malam|selamat malam|tidur)$/i.test(normalized)) {
    return 'Malam Adit 🌙 Istirahat yang cukup ya. Besok Felicia standby lagi!';
  }

  return null;
}

/**
 * Deterministic route — handle intent yang jelas tanpa Gemini call.
 * Return { reply, action?, actionResult? } atau null kalau harus ke Gemini.
 */
async function tryDeterministicRoute(pesan, { events, activeMode }) {
  const lower = pesan.toLowerCase().trim();

  // --- Jadwal hari ini (tanpa Gemini) ---
  if (/^(jadwal|schedule|agenda)\s*(hari ini|today)?[?!.]*$/i.test(lower) || lower === 'jadwal') {
    if (!events || events.length === 0) {
      return { reply: 'Tidak ada event di kalender hari ini, Adit. Mau tambah jadwal?' };
    }
    const lines = events.map(e => `📌 ${e.start}–${e.end}: ${e.summary}`);
    const tipeHari = getTipeHariLabel();
    return {
      reply: `Jadwal kamu hari ini (${tipeHari}):\n\n${lines.join('\n')}\n\nMau ubah atau tambah sesuatu?`,
    };
  }

  // --- Status mode ---
  if (/^(status\s*mode|mode\s*(apa|aktif|sekarang)|cek\s*mode)[?!.]*$/i.test(lower)) {
    if (activeMode?.mode) {
      return { reply: `Mode aktif sekarang: **${activeMode.mode.toUpperCase()}** (sejak ${new Date(activeMode.activated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}). Mau ganti atau reset?` };
    }
    return { reply: 'Tidak ada mode khusus yang aktif sekarang, Adit. Semua berjalan normal. Mau set mode DROP/CHAOS/OVERWORK?' };
  }

  // --- Tipe hari ---
  if (/^(tipe hari|hari ini (apa|tipe)|ini hari apa)[?!.]*$/i.test(lower)) {
    const tipe = getTipeHariLabel();
    return { reply: `Hari ini tipe: **${tipe}**. ${getTipeHariExplanation(tipe)}` };
  }

  return null; // fallback ke Gemini
}

function getTipeHariLabel() {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const hari = days[now.getDay()];
  if (['Senin', 'Selasa', 'Kamis'].includes(hari)) return 'FULL BUILD';
  if (['Rabu', 'Jumat'].includes(hari)) return 'STABILIZE';
  return 'RECOVERY';
}

function getTipeHariExplanation(tipe) {
  const map = {
    'FULL BUILD': 'Hari ini belajar serius + ShopeeFood + Cepot deepwork + gym. Gas! 💪',
    'STABILIZE': 'Hari ini aktivitas ringan + review + istirahat. Jangan terlalu keras.',
    'RECOVERY': 'Hari santai, ShopeeFood minimal, recharge energi. Nikmatin aja.',
  };
  return map[tipe] || '';
}
