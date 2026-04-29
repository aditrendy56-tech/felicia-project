/**
 * Idempotency key normalization
 * Ensures deterministic hashing across retries
 */
export function normalizeForIdempotency(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    return normalizeObject(value);
  }
  return String(value);
}

function normalizeObject(obj) {
  if (Array.isArray(obj)) {
    return '[' + obj.map(normalizeForIdempotency).join(',') + ']';
  }
  // Sort keys for deterministic output
  const keys = Object.keys(obj).sort();
  const normalized = keys.map(k => {
    const val = obj[k];
    // Special handling for common fields
    if (k === 'startTime' || k === 'start_at' || k === 'start' || k === 'dateTime') {
      return `${k}:${normalizeDatetime(val)}`;
    }
    if (k === 'endTime' || k === 'end_at' || k === 'end') {
      return `${k}:${normalizeDatetime(val)}`;
    }
    return `${k}:${normalizeForIdempotency(val)}`;
  });
  return '{' + normalized.join(',') + '}';
}

function normalizeDatetime(value) {
  if (!value) return '';
  const str = String(value).trim();
  // Normalize dates to date + hour bucket (30 min windows)
  // e.g., 2026-04-30T10:15 → 2026-04-30T10:00 (morning slot)
  // e.g., 2026-04-30T10:45 → 2026-04-30T10:30 (afternoon slot)
  const match = str.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const [, date, hour, minute] = match;
    const mins = parseInt(minute, 10);
    const bucketMin = mins < 30 ? '00' : '30';
    return `${date}T${hour}:${bucketMin}`;
  }
  // fallback: just date
  const dateMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];
  return str.toLowerCase();
}

export default normalizeForIdempotency;
