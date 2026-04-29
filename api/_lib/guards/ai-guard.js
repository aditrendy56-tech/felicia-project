export function ensureAiMeta(meta = {}, fallback = {}) {
  const normalizedMeta = meta && typeof meta === 'object' ? { ...meta } : {};

  return {
    provider: normalizedMeta.provider || fallback.provider || 'unknown',
    model: normalizedMeta.model || fallback.model || null,
    mode: normalizedMeta.mode || fallback.mode || null,
    fallbackUsed: Boolean(normalizedMeta.fallbackUsed),
    attempt: Number.isFinite(normalizedMeta.attempt) ? normalizedMeta.attempt : null,
    errorType: normalizedMeta.errorType || null,
    lastErrorMessage: normalizedMeta.lastErrorMessage || null,
  };
}

export function validateAiOutput(parsedResult) {
  const structureCheck = validateAIResponseStructure(parsedResult);
  if (!structureCheck.ok) {
    return structureCheck;
  }

  if (!parsedResult || typeof parsedResult !== 'object') {
    return {
      ok: false,
      reason: 'AI output kosong atau invalid.',
    };
  }

  if (parsedResult.type === 'chat') {
    const reply = String(parsedResult.reply || '').trim();
    if (!reply) {
      return {
        ok: false,
        reason: 'AI tidak memberi reply chat yang valid.',
      };
    }
  }

  if (parsedResult.type === 'action') {
    const action = String(parsedResult.action || '').trim();
    if (!action) {
      return {
        ok: false,
        reason: 'AI memberi tipe action tanpa nama aksi.',
      };
    }
  }

  return {
    ok: true,
    reason: null,
  };
}

export function validateAIResponseStructure(parsedResult) {
  if (!parsedResult || typeof parsedResult !== 'object') {
    return {
      ok: false,
      reason: 'Struktur response AI tidak valid.',
    };
  }

  const type = String(parsedResult.type || '').trim();
  if (type !== 'chat' && type !== 'action') {
    return {
      ok: false,
      reason: 'Type response AI harus chat/action.',
    };
  }

  if (type === 'action') {
    const action = String(parsedResult.action || '').trim();
    if (!action) {
      return {
        ok: false,
        reason: 'Response action tanpa nama aksi.',
      };
    }
  }

  if (type === 'chat') {
    const reply = String(parsedResult.reply || '').trim();
    if (!reply) {
      return {
        ok: false,
        reason: 'Response chat tanpa reply.',
      };
    }
  }

  return {
    ok: true,
    reason: null,
  };
}

export function buildAiGuardReply(reason) {
  return `Felicia tahan dulu ya. ${reason || 'Output AI belum valid.'}`;
}

/**
 * Ask AI with retry + fallback strategy.
 * askFn: async function (message, systemPrompt, options) => geminiResult
 * parseFn: function to parse raw response into structured parsedResult
 */
export async function askWithRetries(askFn, parseFn, message, systemPrompt, options = {}) {
  const maxAttempts = Number.isFinite(options.maxAttempts) ? Math.max(1, options.maxAttempts) : 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const attemptOpts = { ...(options || {}), attempt };
      // On retries, make model/mode more deterministic
      if (attempt > 1) {
        attemptOpts.mode = attemptOpts.mode || 'concise';
        attemptOpts.forceJson = true;
        attemptOpts.temperature = Math.max(0, (attemptOpts.temperature || 0.2) - 0.05 * (attempt - 1));
      }

      const geminiResult = await askFn(message, systemPrompt, attemptOpts);
      const raw = geminiResult?.rawResponse ?? geminiResult?.reply ?? geminiResult;
      const parsed = parseFn(raw);
      const validation = validateAiOutput(parsed);
      const aiMeta = ensureAiMeta(geminiResult?.meta || {}, { provider: 'gemini' });

      if (validation.ok) {
        return { geminiResult, parsedResult: parsed, attempts: attempt, lastError: null, aiMeta };
      }

      // validation failed — record and decide to retry
      lastError = validation.reason || 'AI validation failed';
      if (attempt < maxAttempts) {
        // exponential backoff
        const waitMs = 300 * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, waitMs));
        continue;
      }

      return { geminiResult, parsedResult: parsed, attempts: attempt, lastError, aiMeta };
    } catch (err) {
      lastError = String(err?.message || err);
      if (attempt < maxAttempts) {
        const waitMs = 300 * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, waitMs));
        continue;
      }
      return { geminiResult: null, parsedResult: null, attempts: attempt, lastError, aiMeta: { provider: 'gemini', attempt } };
    }
  }
  return { geminiResult: null, parsedResult: null, attempts: 0, lastError: 'Unknown', aiMeta: { provider: 'gemini' } };
}
