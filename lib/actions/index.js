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

import {
  buildBlockedActionReply,
  validateActionExecution,
} from '../guards/action-guard.js';

import { createOrGetActionExecution, updateActionExecutionState, setActionExecutionStatusIfPending } from '../supabase.js';
import crypto from 'crypto';
import { isRetryableError } from '../utils/error-classifier.js';
import { normalizeForIdempotency } from '../utils/idempotency-normalizer.js';
import { initSteps, recordStep, updateStep } from '../utils/step-executor.js';

import {
  shouldPersistMemory,
} from '../guards/memory-guard.js';

/**
 * Main action executor dispatcher
 * Called from orchestrator when Gemini returns action-type response
 * 
 * @param {string} actionName - Action to execute (create_event, delete_event, etc.)
 * @param {object} params - Parameters for the action
 * @param {object} context - Full context: threadId, chatType, userId, message, events, memories, etc.
 * @returns {Promise<{reply, data}|string>} - Action result with optional reply
 */
export async function executeActionSafely(actionName, params = {}, context = {}) {
  const {
    threadId,
    chatType,
    userId,
    message,
    activeMode,
  } = context;

  try {
    const actionValidation = validateActionExecution(actionName, params, context);
    if (!actionValidation.allowed) {
      return {
        reply: buildBlockedActionReply(actionValidation.reason),
        data: {
          actionName,
          blocked: true,
          reason: actionValidation.reason,
        },
      };
    }

    // Helper: execute handler with execution-state tracking + retry for retryable errors
    async function executeHandlerWithState(fn) {
      // compute idempotency key from action + params + user (stable JSON stringify for deterministic keys)
      const normalizedParams = normalizeForIdempotency(params);
      function stableStringify(obj) {
        const replacer = (key, value) => value && typeof value === 'object' && !Array.isArray(value)
          ? Object.keys(value).sort().reduce((acc, k) => { acc[k] = value[k]; return acc; }, {})
          : value;
        return JSON.stringify(obj, replacer);
      }

      const idempotencyPayload = {
        action: actionName,
        params: normalizedParams,
        user: context.userId || 'anon',
      };
      const idempotencyInput = stableStringify(idempotencyPayload);
      const idempotencyKey = crypto.createHash('sha256').update(idempotencyInput).digest('hex').slice(0, 32);

      // Use normalized params as the stored params payload
      // Allow test injection via context.__mocks for createOrGetActionExecution
      const createOrGetExecFn = context?.__mocks?.createOrGetActionExecution || createOrGetActionExecution;
      const updateExecStateFn = context?.__mocks?.updateActionExecutionState || updateActionExecutionState;
      const setPendingFn = context?.__mocks?.setActionExecutionStatusIfPending || setActionExecutionStatusIfPending;

      const execRec = await createOrGetExecFn({ userId: context.userId || null, actionName, params: normalizedParams, source: context.chatType || 'api', threadId: context.threadId || null, idempotencyKey, idempotencyWindowMinutes: 60 });
      const execId = execRec?.id || null;

      // If execution already succeeded, return stored result immediately (clone before adding flags)
      if (execRec && String(execRec.status).toLowerCase() === 'success') {
        // execRec.result may be a JSON string or object; clone it before modifying
        let storedResult = execRec.result;
        try {
          if (typeof storedResult === 'string') storedResult = JSON.parse(storedResult);
        } catch (e) {
          // keep as-is
        }
        // Safe clone to avoid mutating DB-backed object
        let out = null;
        if (storedResult && typeof storedResult === 'object') {
          try { out = JSON.parse(JSON.stringify(storedResult)); } catch (e) { out = Object.assign({}, storedResult); }
        }
        if (out && typeof out === 'object') {
          if (!out.data) out.data = {};
          out.data.__executed = false;
          out.data.__reused = true;
          out.data.actionExecutionId = execRec.id;
          return out;
        }
        return { reply: 'Action previously completed', data: { actionExecutionId: execRec.id, __executed: false, __reused: true } };
      }

      // If execution is currently running, do not run again — return early
      if (execRec && String(execRec.status).toLowerCase() === 'running') {
        return {
          reply: 'Action is currently being processed',
          data: { actionExecutionId: execRec.id, __processing: true, __executed: false, __reused: false },
        };
      }
      let attempt = 0;
      const maxRetries = 3;
      let steps = initSteps();
      // Attempt to claim the execution record by moving it from 'pending' -> 'running' atomically.
      // If another worker already moved it to 'running' or 'success', createOrGetActionExecution above would have returned.
      if (execId) {
        const claimed = await setPendingFn(execId, { status: 'running', attemptCount: attempt + 1, startedAt: new Date().toISOString() });
        if (claimed) {
          // reflect updated attempt count if provided
          attempt = claimed.attempt_count || attempt + 1;
        } else {
          // Another worker claimed or status changed; re-check the current record
          const latest = await createOrGetExecFn({ userId: context.userId || null, actionName, params: normalizedParams, source: context.chatType || 'api', threadId: context.threadId || null, idempotencyKey, idempotencyWindowMinutes: 60 });
          if (latest && String(latest.status).toLowerCase() === 'success') {
            let storedResult = latest.result;
            try { if (typeof storedResult === 'string') storedResult = JSON.parse(storedResult); } catch (e) {}
            return storedResult || { reply: 'Action previously completed', data: { actionExecutionId: latest.id } };
          }
          if (latest && String(latest.status).toLowerCase() === 'running') {
            return { reply: 'Action is currently being processed', data: { actionExecutionId: latest.id } };
          }
          // Otherwise, proceed without claiming (fallback to normal loop); we'll attempt to update status below before executing
        }
      }

      while (true) {
        attempt += 1;
        if (execId) {
          // Attempt to mark running (will not overwrite success due to DB guard)
          await updateExecStateFn(execId, { status: 'running', attemptCount: attempt, startedAt: new Date().toISOString() });
        }

        try {
          steps = recordStep(steps, { name: `attempt_${attempt}`, status: 'running', input: { actionName, params } });
          const stepIdx = steps.length - 1;

          const result = await fn();

          steps = updateStep(steps, stepIdx, { status: 'success', output: result });

          // attach execution id to returned payload so logging can link
            let finalResult = result;
            if (finalResult && typeof finalResult === 'object') {
              if (!finalResult.data) finalResult.data = {};
              // mark that this run actually executed the handler
              finalResult.data.__executed = true;
              finalResult.data.__reused = false;
              finalResult.data.actionExecutionId = execId;
            } else if (typeof finalResult === 'string') {
              finalResult = { reply: finalResult, data: { actionExecutionId: execId, __executed: true, __reused: false } };
            }

          if (execId) {
            await updateExecStateFn(execId, { status: 'success', finishedAt: new Date().toISOString(), attemptCount: attempt, result: finalResult });
          }
          return finalResult;
        } catch (err) {
          const stepIdx = steps.length - 1;
          steps = updateStep(steps, stepIdx, { status: 'failed', error: String(err?.message || err) });

          const retryable = isRetryableError(err);
          if (execId) {
            await updateExecStateFn(execId, { attemptCount: attempt, errorMessage: String(err?.message || err) });
          }
          if (retryable && attempt < maxRetries) {
            const waitMs = 500 * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          if (execId) {
            await updateExecStateFn(execId, { status: 'failed', finishedAt: new Date().toISOString(), attemptCount: attempt, errorMessage: String(err?.message || err) });
          }
          throw err;
        }
      }
    }

    // ─────────────────────────────────────────────
    // CALENDAR ACTIONS
    // ─────────────────────────────────────────────

    if (actionName === 'create_event') {
      return await executeHandlerWithState(() => handleCreateEvent(params, context));
    }

    if (actionName === 'delete_event') {
      return await executeHandlerWithState(() => handleDeleteEvent(params, context));
    }

    if (actionName === 'reschedule') {
      return await executeHandlerWithState(() => handleRescheduleEvent(params, context));
    }

    if (actionName === 'get_events') {
      return await executeHandlerWithState(() => handleGetEvents(params, context));
    }

    // ─────────────────────────────────────────────
    // MODE & MODE-RELATED ACTIONS
    // ─────────────────────────────────────────────

    if (actionName === 'set_mode') {
      return await executeHandlerWithState(() => handleSetMode(params, context));
    }

    // ─────────────────────────────────────────────
    // MEMORY & CONTEXT ACTIONS
    // ─────────────────────────────────────────────

    if (actionName === 'save_memory') {
      return await executeHandlerWithState(() => handleSaveMemory(params, context));
    }

    // ─────────────────────────────────────────────
    // CASE MANAGEMENT ACTIONS
    // ─────────────────────────────────────────────

    if (actionName === 'create_case_auto') {
      return await executeHandlerWithState(() => handleCreateCaseAuto(params, context));
    }

    if (actionName === 'update_case') {
      return await executeHandlerWithState(() => handleUpdateCase(params, context));
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

export const executeAction = executeActionSafely;

// ════════════════════════════════════════════════════════════════
// CALENDAR ACTION HANDLERS
// ════════════════════════════════════════════════════════════════

async function handleCreateEvent(params = {}, context = {}) {
  const summary = String(
    params?.summary || params?.title || params?.name || ''
  ).trim();

  if (!summary) {
    throw new Error('Diperlukan: summary/title');
  }

  // MOCK MODE: Google Calendar disabled
  const randomDelay = 100 + Math.floor(Math.random() * 201);
  await new Promise((resolve) => setTimeout(resolve, randomDelay));

  const result = {
    id: `mock_${Math.random().toString(36).slice(2, 10)}`,
    summary,
  };

  return {
    reply: `✓ (MOCK) Event "${summary}" berhasil dibuat!`,
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
  const persistenceDecision = shouldPersistMemory(params, context);
  if (!persistenceDecision.allowed) {
    return {
      reply: `Felicia nggak simpan dulu ya. ${persistenceDecision.reason}`,
      data: {
        actionName: 'save_memory',
        skipped: true,
        reason: persistenceDecision.reason,
      },
    };
  }

  const {
    category,
    topicKey,
    memoryType,
    content,
    score,
    tier,
  } = persistenceDecision.normalized;

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
      memoryScore: score,
      memoryTier: tier,
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
