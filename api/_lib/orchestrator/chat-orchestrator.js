/**
 * Chat Orchestrator — Main coordinator for chat flow
 * Phase 1: Skeleton (coordinator brain)
 */

import { askGemini } from '../gemini.js';
import { buildSystemPrompt } from '../core/prompt-builder.js';
import { parseGeminiResponse } from '../core/intent-classifier.js';
import { buildInstantReply } from '../utils/instant-replies.js';
import { tryDeterministicRoute } from '../utils/deterministic-routes.js';
import { executeActionSafely } from '../actions/index.js';
import { getEventsToday } from '../calendar.js';
import {
  createChatThread,
  getActiveMode,
  getChatMessages,
  getScopedMemories,
  logCommand,
  saveChatMessage,
  createPendingConfirmation,
  getPendingConfirmationForUser,
  clearPendingConfirmation,
} from '../supabase.js';
import { DEFAULT_PROFILE_FACTS, getCanonicalProfile } from '../profile.js';
import {
  analyzeChatForCaseReference,
  detectCaseUpdate,
  getCases,
} from '../cases.js';

import {
  ensureAiMeta,
  validateAiOutput,
  buildAiGuardReply,
} from '../guards/ai-guard.js';
import { askWithRetries } from '../guards/ai-guard.js';

import {
  buildClarificationReply,
  getActionDecision,
} from '../guards/action-guard.js';

import {
  getRelevantMemories,
} from '../guards/memory-guard.js';

const VALID_CHAT_TYPES = ['utama', 'refleksi', 'strategi'];

export async function orchestrateChat(input) {
  const { message, threadId, chatType: rawChatType, userId } = input || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return {
      type: 'chat',
      reply: 'Field "message" wajib diisi.',
      action: null,
      data: { error: 'invalid_message' },
    };
  }

  const pesan = message.trim();
  const chatType = VALID_CHAT_TYPES.includes(rawChatType) ? rawChatType : 'utama';
  const actorId = userId || 'web-chat';

  let activeThreadId = threadId || null;
  if (!activeThreadId) {
    const newThread = await safeAsync(() => createChatThread(chatType, null), null);
    activeThreadId = newThread?.id || null;
  }

  const baseData = {
    threadId: activeThreadId,
    chatType,
    userId: actorId,
  };

  try {
    // Check pending confirmation first (soft-confirm flow)
    const pending = await getPendingConfirmationForUser({ userId: actorId, threadId: activeThreadId });
    if (pending && pending.action_name) {
      const normalized = String(pesan || '').trim().toLowerCase();
      const yes = ['ya', 'y', 'iya', 'yes', 'ok', 'oke', 'lanjut'];
      const no = ['tidak', 't', 'no', 'skip', 'batalkan', 'cancel'];
      if (yes.includes(normalized)) {
        // execute stored action
        await clearPendingConfirmation(pending.id);
        const storedParams = pending.params ? JSON.parse(pending.params) : {};
        const actionResult = await executeActionSafely(pending.action_name, storedParams, { ...baseData, threadId: activeThreadId, chatType, userId: actorId, message: pesan });
        const reply = (actionResult && actionResult.reply) ? actionResult.reply : (typeof actionResult === 'string' ? actionResult : 'Aksi selesai.');
        return {
          type: 'action',
          reply,
          action: pending.action_name,
          data: {
            ...baseData,
            executedFromPending: true,
            pendingId: pending.id,
            actionResult,
          },
        };
      }
      if (no.includes(normalized)) {
        await clearPendingConfirmation(pending.id);
        return {
          type: 'chat',
          reply: 'Oke, aku batalkan aksi tersebut. Kalau mau lagi, bilang aja ya.',
          action: null,
          data: { ...baseData, cancelledPending: true, pendingId: pending.id },
        };
      }
      // otherwise continue normal processing (user didn't answer yes/no)
    }
    const instantReply = buildInstantReply(pesan);
    if (instantReply) {
      if (activeThreadId) {
        await safeAsync(() => saveChatMessage(activeThreadId, { role: 'user', content: pesan }));
        await safeAsync(() => saveChatMessage(activeThreadId, { role: 'assistant', content: instantReply, action: 'instant_reply' }));
      }

      await safeAsync(() => logCommand({
        userId: actorId,
        command: 'instant_reply',
        input: pesan,
        action: 'instant_reply',
        response: instantReply.substring(0, 200),
      }));

      return {
        type: 'chat',
        reply: instantReply,
        action: null,
        data: {
          ...baseData,
          route: 'instant_reply',
        },
      };
    }

    const [events, activeMode, conversationHistory, allMemories, canonicalProfile] = await Promise.all([
      safeAsync(getEventsToday, []),
      safeAsync(getActiveMode, null),
      activeThreadId
        ? safeAsync(() => getChatMessages(activeThreadId, 10), [])
        : Promise.resolve([]),
      safeAsync(() => getScopedMemories(chatType, 12), []),
      safeAsync(getCanonicalProfile, DEFAULT_PROFILE_FACTS),
    ]);

    const memories = await getRelevantMemories(allMemories, pesan, 8);

    const deterministicResult = await tryDeterministicRoute(pesan, { events, activeMode });
    if (deterministicResult) {
      if (activeThreadId) {
        await safeAsync(() => saveChatMessage(activeThreadId, { role: 'user', content: pesan }));
        await safeAsync(() => saveChatMessage(activeThreadId, { role: 'assistant', content: deterministicResult.reply, action: 'deterministic' }));
      }

      await safeAsync(() => logCommand({
        userId: actorId,
        command: 'deterministic',
        input: pesan,
        action: 'deterministic',
        response: deterministicResult.reply.substring(0, 200),
      }));

      return {
        type: 'chat',
        reply: deterministicResult.reply,
        action: null,
        data: {
          ...baseData,
          route: 'deterministic',
          events,
          activeMode,
        },
      };
    }

    if (activeThreadId) {
      await safeAsync(() => saveChatMessage(activeThreadId, { role: 'user', content: pesan }));
    }

    const profileContext = buildPersonalProfileContext(memories, canonicalProfile);
    const responseMode = inferResponseMode(pesan, chatType);

    const potentialCases = await safeAsync(() => analyzeChatForCaseReference(pesan), []);
    let caseContext = '';
    if (potentialCases && potentialCases.length > 0) {
      const caseSuggestions = potentialCases
        .map(c => `- ${c.title} (${c.category})${c.entities && c.entities.length > 0 ? ` [${c.entities.join(', ')}]` : ''}`)
        .join('\n');

      caseContext = `\n\n[CASE CONTEXT]\nPesan user mungkin related ke case:\n${caseSuggestions}\nJika relevan, mention case tersebut atau tanya apakah ini update untuk case itu.`;
    }

    const activeCases = await safeAsync(() => getCases('active'), []);
    const caseUpdateDetection = await safeAsync(() => detectCaseUpdate(pesan, activeCases), { isUpdate: false });
    if (caseUpdateDetection?.isUpdate) {
      caseContext += `\n\n[CASE UPDATE DETECTED] Pesan ini appear to be update untuk case "${caseUpdateDetection.caseTitle}". Jika ya, gunakan action: "update_case".`;
    }

    const mode = activeMode?.mode || null;
    const systemPrompt = buildSystemPrompt(mode, events, memories, profileContext, chatType, caseContext);

    const { geminiResult, parsedResult, attempts, lastError, aiMeta } = await askWithRetries(
      askGemini,
      parseGeminiResponse,
      pesan,
      systemPrompt,
      {
        mode,
        events,
        conversationHistory,
        memories,
        profileContext,
        responseMode,
        chatType,
        caseContext,
        maxAttempts: 3,
      }
    );

    const aiValidation = validateAiOutput(parsedResult);

    if (!aiValidation.ok) {
      // AI output invalid — clear pending confirmation if new intent detected
      if (pending) {
        await safeAsync(() => clearPendingConfirmation(pending.id));
      }

      const guardedReply = buildAiGuardReply(aiValidation.reason);

      if (activeThreadId) {
        await safeAsync(() => saveChatMessage(activeThreadId, {
          role: 'assistant',
          content: guardedReply,
          action: 'ai_guard_blocked',
          params: { reason: aiValidation.reason },
        }));
      }

      await safeAsync(() => logCommand({
        userId: actorId,
        command: 'chat',
        input: pesan,
        action: 'ai_guard_blocked',
        response: buildCommandResponsePayload({
          reply: guardedReply,
          route: 'ai_guard',
          aiMeta,
          status: 'blocked',
          reason: aiValidation.reason,
        }),
        status: 'error',
        errorMessage: aiValidation.reason,
      }));

      return {
        type: 'chat',
        reply: guardedReply,
        action: null,
        data: {
          ...baseData,
          guard: 'ai',
          reason: aiValidation.reason,
          geminiMeta: aiMeta,
        },
      };
    }

    let reply = String(parsedResult?.reply || '').trim();
    let action = parsedResult?.type === 'action' ? parsedResult.action : null;
    let data = {
      ...baseData,
      systemPrompt,
      responseMode,
      events,
      activeMode,
      conversationHistory,
      memories,
      profileContext,
      caseContext,
      geminiMeta: aiMeta,
      parsed: parsedResult,
    };

    if (parsedResult?.type === 'action' && action) {
      const actionParams = parsedResult.params || {};

      // If new action detected and pending confirmation exists for different action, clear it
      if (pending && pending.action_name !== action) {
        await safeAsync(() => clearPendingConfirmation(pending.id));
      }

      const actionDecision = getActionDecision(parsedResult);
      if (actionDecision?.shouldClarify) {
        const clarificationReply = buildClarificationReply(action, actionDecision.mode);
        const quickConfirm = actionDecision.mode === 'soft_confirm' && Number(parsedResult.confidence) >= 0.7;

        if (activeThreadId) {
          await safeAsync(() => saveChatMessage(activeThreadId, {
            role: 'assistant',
            content: clarificationReply,
            action: 'clarify_action',
            params: {
              targetAction: action,
              confidence: parsedResult.confidence,
              decisionMode: actionDecision.mode,
              quickConfirm: quickConfirm,
            },
          }));
          // create pending confirmation record so follow-up replies are unambiguous
          try {
            await createPendingConfirmation({ userId: actorId, threadId: activeThreadId, actionName: action, params: actionParams, ttlSeconds: 300 });
          } catch (e) {
            // non-fatal
            console.warn('[Orchestrator] createPendingConfirmation failed', e?.message || e);
          }
        }

        await safeAsync(() => logCommand({
          userId: actorId,
          command: 'action_clarification',
          input: pesan,
          action,
          response: buildCommandResponsePayload({
            reply: clarificationReply,
            route: 'clarification',
            aiMeta,
            confidence: parsedResult.confidence,
            status: actionDecision.mode,
          }),
          status: 'success',
        }));

        return {
          type: 'chat',
          reply: clarificationReply,
          action: null,
          data: {
            ...data,
            clarified: true,
            confidence: parsedResult.confidence,
            decisionMode: actionDecision.mode,
            quickConfirm,
          },
        };
      }

      const actionResult = await executeActionSafely(action, actionParams, {
        ...baseData,
        threadId: activeThreadId,
        chatType,
        userId: actorId,
        message: pesan,
        events,
        activeMode,
        conversationHistory,
        memories,
        profileContext,
        responseMode,
        caseContext,
      });

      data = {
        ...data,
        actionResult,
      };

      if (typeof actionResult === 'string' && actionResult.trim()) {
        reply = actionResult.trim();
      } else if (actionResult && typeof actionResult === 'object') {
        if (typeof actionResult.reply === 'string' && actionResult.reply.trim()) {
          reply = actionResult.reply.trim();
        }
      }

      if (activeThreadId) {
        await safeAsync(() => saveChatMessage(activeThreadId, {
          role: 'assistant',
          content: reply,
          action,
          params: actionParams,
        }));
      }

      await safeAsync(() => logCommand({
        userId: actorId,
        command: 'action',
        input: pesan,
        action,
        response: buildCommandResponsePayload({
          reply,
          route: 'action',
          aiMeta,
          confidence: parsedResult?.confidence,
          actionResult,
        }),
        status: 'success',
      }));

      return {
        type: 'action',
        reply,
        action,
        data,
      };
    }

    if (activeThreadId) {
      await safeAsync(() => saveChatMessage(activeThreadId, {
        role: 'assistant',
        content: reply,
        action: null,
        params: {},
      }));
    }

    await safeAsync(() => logCommand({
      userId: actorId,
      command: 'chat',
      input: pesan,
      action: 'chat',
      response: buildCommandResponsePayload({
        reply,
        route: 'chat',
        aiMeta,
        confidence: parsedResult?.confidence,
      }),
      status: geminiResult?.meta?.errorType === 'quota' ? 'quota_limited' : (geminiResult?.meta?.errorType === 'technical' ? 'error' : 'success'),
      errorMessage: geminiResult?.meta?.lastErrorMessage || null,
    }));

    return {
      type: 'chat',
      reply,
      action: null,
      data,
    };
  } catch (error) {
    console.error('[ChatOrchestrator] Error:', error);

    return {
      type: 'chat',
      reply: buildErrorReply(error),
      action: null,
      data: {
        ...baseData,
        error: error?.message || String(error),
      },
    };
  }
}

async function safeAsync(fn, fallback = null) {
  try {
    return await (typeof fn === 'function' ? fn() : fn);
  } catch {
    return fallback;
  }
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

function inferResponseMode(message = '', chatType = 'utama') {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return 'concise';

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

  if (chatType === 'strategi' || chatType === 'refleksi') {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return wordCount <= 4 ? 'concise' : 'balanced';
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 8) {
    return 'concise';
  }

  return 'balanced';
}

function buildCommandResponsePayload({ reply, route, aiMeta, confidence = null, actionResult = null, status = null, reason = null }) {
  const textReply = String(reply || '').trim();

  return {
    preview: textReply.slice(0, 200),
    route: route || null,
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : null,
    ai_provider: aiMeta?.provider || null,
    ai_model: aiMeta?.model || null,
    ai_mode: aiMeta?.mode || null,
    ai_fallback_used: Boolean(aiMeta?.fallbackUsed),
    ai_attempt: Number.isFinite(aiMeta?.attempt) ? aiMeta.attempt : null,
    status: status || null,
    reason: reason || null,
    action_result_type: actionResult ? typeof actionResult : null,
  };
}

function buildErrorReply(err) {
  const message = String(err?.message || err || '').toLowerCase();
  if (message.includes('quota') || message.includes('rate limit')) {
    return 'Maaf Adit, Felicia lagi kena limit sementara. Coba lagi sebentar ya. 🙏';
  }
  return 'Maaf Adit, Felicia lagi ada gangguan teknis. Coba lagi sebentar ya. 🙏';
}
