/**
 * Chat Orchestrator — Main coordinator for chat flow
 * Phase 1: Skeleton (coordinator brain)
 */

import { askGemini } from '../gemini.js';
import { buildSystemPrompt } from '../core/prompt-builder.js';
import { parseGeminiResponse } from '../core/intent-classifier.js';
import { buildInstantReply } from '../utils/instant-replies.js';
import { tryDeterministicRoute } from '../utils/deterministic-routes.js';
import { executeAction } from '../actions/index.js';
import { getEventsToday } from '../calendar.js';
import {
  createChatThread,
  getActiveMode,
  getChatMessages,
  getScopedMemories,
  logCommand,
  saveChatMessage,
} from '../supabase.js';
import { DEFAULT_PROFILE_FACTS, getCanonicalProfile } from '../profile.js';
import {
  analyzeChatForCaseReference,
  detectCaseUpdate,
  getCases,
} from '../cases.js';

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

    const [events, activeMode, conversationHistory, memories, canonicalProfile] = await Promise.all([
      safeAsync(getEventsToday, []),
      safeAsync(getActiveMode, null),
      activeThreadId
        ? safeAsync(() => getChatMessages(activeThreadId, 10), [])
        : Promise.resolve([]),
      safeAsync(() => getScopedMemories(chatType, 12), []),
      safeAsync(getCanonicalProfile, DEFAULT_PROFILE_FACTS),
    ]);

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

    const geminiResult = await askGemini(pesan, systemPrompt, {
      mode,
      events,
      conversationHistory,
      memories,
      profileContext,
      responseMode,
      chatType,
      caseContext,
    });

    const rawGeminiResponse = geminiResult?.rawResponse ?? geminiResult?.reply ?? geminiResult;
    const parsedResult = parseGeminiResponse(rawGeminiResponse);

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
      geminiMeta: geminiResult?.meta || null,
      parsed: parsedResult,
    };

    if (parsedResult?.type === 'action' && action) {
      const actionParams = parsedResult.params || {};
      const actionResult = await executeAction(action, actionParams, {
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

      if (typeof actionResult === 'string' && actionResult) {
        reply = reply ? `${reply}\n\n${actionResult}` : actionResult;
      } else if (actionResult && typeof actionResult === 'object') {
        if (typeof actionResult.reply === 'string' && actionResult.reply.trim()) {
          reply = reply ? `${reply}\n\n${actionResult.reply.trim()}` : actionResult.reply.trim();
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
        response: reply.substring(0, 200),
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
      response: reply.substring(0, 200),
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

function buildErrorReply(err) {
  const message = String(err?.message || err || '').toLowerCase();
  if (message.includes('quota') || message.includes('rate limit')) {
    return 'Maaf Adit, Felicia lagi kena limit sementara. Coba lagi sebentar ya. 🙏';
  }
  return 'Maaf Adit, Felicia lagi ada gangguan teknis. Coba lagi sebentar ya. 🙏';
}
