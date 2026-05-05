const DESTRUCTIVE_ACTIONS = new Set(['delete_event', 'reschedule']);

export const ACTION_CONFIDENCE_THRESHOLDS = {
  clarify: 0.55,
  execute: 0.82,
};

export function getActionDecision(parsedResult) {
  if (!parsedResult || parsedResult.type !== 'action') return false;

  const confidence = Number(parsedResult.confidence);
  if (!Number.isFinite(confidence)) {
    return {
      shouldClarify: true,
      mode: 'clarify',
      confidence: null,
    };
  }

  if (confidence < ACTION_CONFIDENCE_THRESHOLDS.clarify) {
    return {
      shouldClarify: true,
      mode: 'clarify',
      confidence,
    };
  }

  if (confidence < ACTION_CONFIDENCE_THRESHOLDS.execute) {
    return {
      shouldClarify: true,
      mode: 'soft_confirm',
      confidence,
    };
  }

  return {
    shouldClarify: false,
    mode: 'execute',
    confidence,
  };
}

export function validateActionExecution(actionName, params = {}, context = {}) {
  const action = String(actionName || '').trim();
  const parsedParams = params && typeof params === 'object' ? params : {};

  if (!action) {
    return blocked('Action kosong.', 'critical');
  }

  if (action === 'delete_event') {
    const eventId = String(parsedParams.eventId || '').trim();
    const summary = String(parsedParams.summary || parsedParams.title || '').trim();

    if (!eventId && summary.length < 3) {
      return blocked('Hapus event butuh eventId atau summary yang jelas.', 'high');
    }
  }

  if (action === 'reschedule') {
    const eventId = String(parsedParams.eventId || '').trim();
    const startTime = String(parsedParams.startTime || parsedParams.start || '').trim();
    const endTime = String(parsedParams.endTime || parsedParams.end || '').trim();

    if (!eventId || !startTime || !endTime) {
      return blocked('Reschedule butuh eventId, startTime, dan endTime.', 'high');
    }
  }

  if (action === 'create_event') {
    const summary = String(parsedParams.summary || parsedParams.title || '').trim();
    const startTime = String(parsedParams.startTime || parsedParams.start || '').trim();

    if (!summary || !startTime) {
      return blocked('Buat event butuh summary/title dan startTime.', 'medium');
    }
  }

  if (action === 'update_case') {
    const caseId = String(parsedParams.caseId || '').trim();
    if (!caseId) {
      return blocked('Update case butuh caseId.', 'medium');
    }
  }

  return {
    allowed: true,
    status: 'allow',
    severity: 'none',
    requiresConfirmation: DESTRUCTIVE_ACTIONS.has(action),
    reason: null,
  };
}

export function buildClarificationReply(actionName, mode = 'clarify') {
  const action = String(actionName || 'aksi ini');
  if (mode === 'soft_confirm') {
    return `Adit — aku yakin ini benar untuk "${action}", tapi mau konfirmasi cepat dulu. Balas ` + "'ya'" + ` untuk lanjut, atau 'tidak' untuk batalkan.`;
  }
  return `Adit, Felicia mau memastikan supaya nggak salah. Kamu yakin ingin lanjut aksi "${action}"?`;
}

export function buildBlockedActionReply(reason) {
  const message = String(reason || 'aksi belum lolos validasi');
  return `Felicia tahan dulu aksinya ya. ${message}`;
}

function blocked(reason, severity = 'medium') {
  return {
    allowed: false,
    status: 'block',
    severity,
    requiresConfirmation: false,
    reason,
  };
}
