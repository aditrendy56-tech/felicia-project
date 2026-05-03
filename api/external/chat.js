import { orchestrateChat } from '../_lib/orchestrator/chat-orchestrator.js';
import { getRelevantMemories } from '../_lib/guards/memory-guard.js';
import { setExternalCorsHeaders, validateExternalApiKey, handleOptions } from '../_lib/external-middleware.js';

export default async function handler(req, res) {
  try {
    // CORS for approved external clients
    setExternalCorsHeaders(req, res);

    // Handle preflight
    if (handleOptions(req, res)) return;

    // Simple API key auth
    if (!validateExternalApiKey(req, res)) {
      console.warn('[External Chat] Unauthorized request');
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const { message, threadId, source } = req.body || {};

    console.log('[External Chat] source:', source || 'unknown', 'message:', String(message || '').slice(0,200), 'threadId:', threadId || 'none');

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message_required' });
    }

    // Quick semantic check to determine whether relevant memories exist
    let memoryUsed = false;
    try {
      const mems = await getRelevantMemories([], String(message || ''), 5);
      memoryUsed = Array.isArray(mems) && mems.length > 0;
    } catch (e) {
      console.warn('[External Chat] getRelevantMemories failed:', e?.message || e);
    }

    // Forward to existing orchestrator (do not re-implement logic)
    const orchestratorResult = await orchestrateChat({ message, threadId, userId: source || 'voice-runtime' });

    const reply = String(orchestratorResult?.reply || '').trim();
    const returnedThreadId = orchestratorResult?.data?.threadId || threadId || null;

    return res.status(200).json({
      reply,
      threadId: returnedThreadId,
      memoryUsed: Boolean(memoryUsed),
    });
  } catch (error) {
    console.error('[External Chat] Error:', error);
    return res.status(500).json({ error: 'server_error' });
  }
}
