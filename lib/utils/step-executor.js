/**
 * Semantic step-level execution tracking for compound actions
 * Structure: step = logical unit, attempts = retries within step
 */
export function initSteps() {
  return [];
}

/**
 * Create a new semantic step (e.g., "create_event", "link_case", "save_memory")
 */
export function createSemanticStep(stepName) {
  return {
    name: String(stepName || 'unknown'),
    attempts: [],
    started_at: new Date().toISOString(),
    finished_at: null,
    status: 'pending',
  };
}

/**
 * Record an attempt within a step
 */
export function recordAttempt(step, { attemptNumber, status = 'running', input = null }) {
  if (!step) return null;
  const attempt = {
    attempt_number: Number(attemptNumber) || 1,
    status: String(status || 'running'),
    started_at: new Date().toISOString(),
    finished_at: null,
    input,
    output: null,
    error: null,
  };
  if (!Array.isArray(step.attempts)) step.attempts = [];
  step.attempts.push(attempt);
  return attempt;
}

/**
 * Update an attempt within a step
 */
export function updateAttempt(attempt, { status = null, output = null, error = null }) {
  if (!attempt) return null;
  if (status) attempt.status = status;
  if (output !== undefined && output !== null) attempt.output = output;
  if (error) attempt.error = error;
  if (!attempt.finished_at && ['success', 'failed'].includes(status)) {
    attempt.finished_at = new Date().toISOString();
  }
  return attempt;
}

/**
 * Finalize a step (mark as success/failed, calculate duration)
 */
export function finalizeStep(step, { status = 'success', error = null }) {
  if (!step) return null;
  step.status = status;
  step.finished_at = new Date().toISOString();
  if (error) step.error = error;
  // calculate duration in ms
  if (step.started_at && step.finished_at) {
    const start = new Date(step.started_at).getTime();
    const end = new Date(step.finished_at).getTime();
    step.duration_ms = end - start;
  }
  return step;
}

/**
 * Add a semantic step to steps array
 */
export function addStep(steps, stepName) {
  if (!Array.isArray(steps)) steps = [];
  const step = createSemanticStep(stepName);
  steps.push(step);
  return { steps, step };
}

/**
 * Backward compatibility: record attempt as old-style step (for non-semantic usage)
 */
export function recordStep(steps, { name, status = 'pending', input = null, output = null, error = null }) {
  if (!Array.isArray(steps)) steps = [];
  const step = {
    name: String(name || 'unknown'),
    status: String(status || 'pending'),
    started_at: new Date().toISOString(),
    finished_at: null,
    input,
    output,
    error,
    duration_ms: null,
  };
  steps.push(step);
  return steps;
}

/**
 * Backward compatibility: update old-style step
 */
export function updateStep(steps, index, { status = null, output = null, error = null }) {
  if (!Array.isArray(steps) || !Number.isFinite(index) || index < 0 || index >= steps.length) return steps;
  const step = steps[index];
  if (status) step.status = status;
  if (output !== undefined && output !== null) step.output = output;
  if (error) step.error = error;
  if (!step.finished_at && ['success', 'failed'].includes(status)) {
    step.finished_at = new Date().toISOString();
    // calculate duration
    if (step.started_at && step.finished_at) {
      const start = new Date(step.started_at).getTime();
      const end = new Date(step.finished_at).getTime();
      step.duration_ms = end - start;
    }
  }
  return steps;
}

export async function executeStepWithState(execId, stepIndex, stepName, handler, { updateExecutionStateFn = null }) {
  if (updateExecutionStateFn) {
    // notify start
    await updateExecutionStateFn(execId, { status: 'running' });
  }
  try {
    const result = await handler();
    return { success: true, result };
  } catch (err) {
    return { success: false, error: String(err?.message || err) };
  }
}
