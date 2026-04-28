/**
 * Action Router — Dispatcher for all actions
 * Handles: create_event, delete_event, reschedule, set_mode, save_memory, 
 * get_events, create_case_auto, update_case
 */

import {
  createEvent,
  deleteEvent,
  updateEvent,
  getEventsToday,
  getEventsDate,
  getEventsRange,
} from '../calendar.js';

import {
  saveMemory,
  logMode,
  getActiveMode,
} from '../supabase.js';

import {
  createCase,
  getCases,
  updateCase as updateCaseDb,
  extractCaseFromMessage,
} from '../cases.js';

import {
  activateMode,
  isValidMode,
  getModeInfo,
} from '../mode.js';

/**
 * Main action executor dispatcher
 * Called from orchestrator when Gemini returns action-type response
 * 
 * @param {string} actionName - Action to execute (create_event, delete_event, etc.)
 * @param {object} params - Parameters for the action
 * @param {object} context - Full context: threadId, chatType, userId, message, events, memories, etc.
 * @returns {Promise<{reply, data}|string>} - Action result with optional reply
 */
export async function executeAction(actionName, params = {}, context = {}) {
  const {
    threadId,
    chatType,
    userId,
    message,
    activeMode,
  } = context;

  try {
    // ─────────────────────────────────────────────
    // CALENDAR ACTIONS
    // ─────────────────────────────────────────────

    if (actionName === 'create_event') {
      return await handleCreateEvent(params, context);
    }

    if (actionName === 'delete_event') {
      return await handleDeleteEvent(params, context);
    }

    if (actionName === 'reschedule') {
      return await handleRescheduleEvent(params, context);
    }

    if (actionName === 'get_events') {
      return await handleGetEvents(params, context);
    }

    // ─────────────────────────────────────────────
    // MODE & MODE-RELATED ACTIONS
    // ─────────────────────────────────────────────

    if (actionName === 'set_mode') {
      return await handleSetMode(params, context);
    }

    // ─────────────────────────────────────────────
    // MEMORY & CONTEXT ACTIONS
    // ─────────────────────────────────────────────

    if (actionName === 'save_memory') {
      return await handleSaveMemory(params, context);
    }

    // ─────────────────────────────────────────────
    // CASE MANAGEMENT ACTIONS
    // ─────────────────────────────────────────────

    if (actionName === 'create_case_auto') {
      return await handleCreateCaseAuto(params, context);
    }

    if (actionName === 'update_case') {
      return await handleUpdateCase(params, context);
    }

    // ─────────────────────────────────────────────
    // Unknown action
    // ─────────────────────────────────────────────

    throw new Error(`Unknown action: ${actionName}`);
  } catch (error) {
    console.error(`[ExecuteAction] ${actionName} error:`, error);

    return {
      reply: `Maaf Adit, Felicia gagal eksekusi "${actionName}". ${error?.message || 'Error tidak jelas.'}`,
      data: {
        actionName,
        error: error?.message || String(error),
      },
    };
  }
}

// ════════════════════════════════════════════════════════════════
// CALENDAR ACTION HANDLERS
// ════════════════════════════════════════════════════════════════

async function handleCreateEvent(params = {}, context = {}) {
  const summary = String(
    params?.summary || params?.title || params?.name || ''
  ).trim();
  const startRaw = params?.startTime || params?.start || params?.start_at || params?.dateTime;
  const endRaw = params?.endTime || params?.end || params?.end_at;
  const description = params?.description || '';

  const startTime = normalizeCalendarDateTime(startRaw);
  let endTime = normalizeCalendarDateTime(endRaw);

  if (!summary || !startTime) {
    throw new Error('Diperlukan: summary/title dan startTime');
  }

  if (!endTime) {
    endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
  }

  const result = await createEvent(
    summary,
    startTime,
    endTime,
    description
  );

  if (!result) {
    throw new Error('Gagal membuat event di Google Calendar');
  }

  const startStr = new Date(startTime).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
  });
  const endStr = new Date(endTime).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
  });

  return {
    reply: `✓ Event "${summary}" berhasil dibuat!\n📅 ${startStr} — ${endStr}`,
    data: {
      event: result,
      actionName: 'create_event',
    },
  };
}

async function handleDeleteEvent(params = {}, context = {}) {
  let { eventId } = params;
  const summaryHint = String(params?.summary || params?.title || '').trim().toLowerCase();

  if (!eventId && summaryHint) {
    const todayEvents = await getEventsToday();
    const matched = Array.isArray(todayEvents)
      ? todayEvents.find((event) => String(event?.summary || '').toLowerCase().includes(summaryHint))
      : null;
    if (matched?.id) {
      eventId = matched.id;
    }
  }

  if (!eventId) {
    throw new Error('Diperlukan: eventId (atau summary yang cocok)');
  }

  const result = await deleteEvent(eventId);

  if (!result) {
    throw new Error('Gagal menghapus event');
  }

  return {
    reply: `✓ Event berhasil dihapus!`,
    data: {
      deleted: true,
      actionName: 'delete_event',
    },
  };
}

async function handleRescheduleEvent(params = {}, context = {}) {
  const { eventId } = params;
  const startTime = normalizeCalendarDateTime(params?.startTime || params?.start || params?.start_at);
  const endTime = normalizeCalendarDateTime(params?.endTime || params?.end || params?.end_at);

  if (!eventId || !startTime || !endTime) {
    throw new Error('Diperlukan: eventId, startTime, endTime');
  }

  const result = await updateEvent(eventId, {
    startTime,
    endTime,
  });

  if (!result) {
    throw new Error('Gagal reschedule event');
  }

  const startStr = new Date(startTime).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
  });
  const endStr = new Date(endTime).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
  });

  return {
    reply: `✓ Event berhasil di-reschedule ke ${startStr} — ${endStr}!`,
    data: {
      event: result,
      actionName: 'reschedule',
    },
  };
}

function normalizeCalendarDateTime(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T09:00:00+07:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return `${raw}:00+07:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return `${raw}+07:00`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

async function handleGetEvents(params = {}, context = {}) {
  const { date } = params;
  const dateStr = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  const events = await getEventsDate(dateStr);

  if (!Array.isArray(events)) {
    throw new Error('Gagal mengambil event');
  }

  let reply = `📅 Event tanggal ${dateStr}:\n`;

  if (events.length === 0) {
    reply += '(Tidak ada event)';
  } else {
    reply += events
      .map((e) => {
        const start = e.start || '??:??';
        const end = e.end || '??:??';
        return `• ${e.summary} (${start}—${end})`;
      })
      .join('\n');
  }

  return {
    reply,
    data: {
      events,
      actionName: 'get_events',
    },
  };
}

// ════════════════════════════════════════════════════════════════
// MODE ACTION HANDLERS
// ════════════════════════════════════════════════════════════════

async function handleSetMode(params = {}, context = {}) {
  const { mode } = params;

  if (!mode) {
    throw new Error('Diperlukan: mode');
  }

  if (!isValidMode(mode)) {
    throw new Error('Mode invalid. Pilihan: drop, chaos, overwork, focus');
  }

  const result = await activateMode(mode);

  if (!result) {
    throw new Error('Gagal mengubah mode');
  }

  const modeLabels = {
    drop: '🔴 DROP - Libur total',
    chaos: '🟠 CHAOS - Santai asal jadi',
    overwork: '🟡 OVERWORK - Maksimal output',
    focus: '🔵 FOCUS - Fokus di satu hal',
  };

  return {
    reply: `✓ Mode diubah ke: ${modeLabels[mode]}`,
    data: {
      mode,
      actionName: 'set_mode',
    },
  };
}

// ════════════════════════════════════════════════════════════════
// MEMORY ACTION HANDLERS
// ════════════════════════════════════════════════════════════════

async function handleSaveMemory(params = {}, context = {}) {
  const {
    category,
    topicKey,
    memoryType,
    content,
  } = params;

  if (!category || !content) {
    throw new Error('Diperlukan: category, content');
  }

  const result = await saveMemory({
    category: category || 'general',
    topic_key: topicKey || category || 'general',
    memory_type: memoryType || 'state',
    content,
  });

  if (!result) {
    throw new Error('Gagal menyimpan memory');
  }

  return {
    reply: `✓ Memory "${category}" berhasil disimpan!`,
    data: {
      memory: result,
      actionName: 'save_memory',
    },
  };
}

// ════════════════════════════════════════════════════════════════
// CASE MANAGEMENT ACTION HANDLERS
// ════════════════════════════════════════════════════════════════

async function handleCreateCaseAuto(params = {}, context = {}) {
  const {
    title,
    description,
    category,
  } = params;

  if (!title) {
    throw new Error('Diperlukan: title');
  }

  const result = await createCase({
    title,
    category: category || 'general',
    summary: description || '',
  });

  if (!result) {
    throw new Error('Gagal membuat case');
  }

  return {
    reply: `✓ Case "${title}" berhasil dibuat!`,
    data: {
      case: result,
      actionName: 'create_case_auto',
    },
  };
}

async function handleUpdateCase(params = {}, context = {}) {
  const {
    caseId,
    status,
    notes,
    tags,
  } = params;

  if (!caseId) {
    throw new Error('Diperlukan: caseId');
  }

  const updates = {};
  if (status) updates.status = status;
  if (notes) updates.notes = notes;
  if (tags) updates.tags = tags;

  const result = await updateCaseDb(caseId, updates);

  if (!result) {
    throw new Error('Gagal update case');
  }

  return {
    reply: `✓ Case berhasil diupdate!`,
    data: {
      case: result,
      actionName: 'update_case',
    },
  };
}
