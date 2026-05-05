export function isRetryableError(err) {
  if (!err) return false;
  const message = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();

  // Network / transient
  if (/timeout|timed out|econnreset|ecancelled|econnrefused|network|networkerror|socket hang up/.test(message)) return true;
  if (/timeout|timedout|ecancelled|econnreset|econnrefused/.test(code)) return true;
  if (/(502|503|504)/.test(message) || /(502|503|504)/.test(code)) return true;

  // Quota/rate-limit sometimes transient (allow retry with backoff)
  if (message.includes('rate limit') || message.includes('quota') || message.includes('too many requests') || code === '429') return true;

  // Known non-retryable: validation, permission, authentication, bad request
  if (message.includes('validation') || message.includes('invalid') || message.includes('bad request') || message.includes('unprocessable')) return false;
  if (message.includes('permission') || message.includes('forbidden') || message.includes('not allowed') || message.includes('unauthorized') || /403|401/.test(code)) return false;

  // Default conservative: don't retry
  return false;
}

export default isRetryableError;
