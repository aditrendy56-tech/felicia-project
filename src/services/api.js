/* ━━━ Felicia API Service ━━━ */

const API_BASE = '/api';
const AUTH_MISSING_MESSAGE = '🔐 API token belum diset. Login/isi token dulu agar data bisa dimuat.';
let lastUnauthorizedToken = null;
let sessionBootstrapPromise = null;

class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function createAuthRequiredError(message = AUTH_MISSING_MESSAGE) {
  return new ApiError(message, { status: 401, code: 'AUTH_REQUIRED' });
}

export function isAuthError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || '').toUpperCase();
  return status === 401 || code === 'AUTH_REQUIRED' || code === 'UNAUTHORIZED';
}

function buildHeaders({ includeLegacyToken = false } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const token = includeLegacyToken ? getLegacyToken() : null;
  if (token && !lastUnauthorizedToken) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function getLegacyToken() {
  if (typeof window === 'undefined') return null;

  try {
    const stored = sessionStorage.getItem('felicia_api_token');
    if (stored) return stored;

    const localStored = localStorage.getItem('felicia_api_token');
    if (localStored) return localStored;
  } catch {
    return import.meta.env.VITE_API_TOKEN || null;
  }

  return import.meta.env.VITE_API_TOKEN || null;
}

async function bootstrapSession() {
  if (typeof window === 'undefined') return false;
  if (sessionBootstrapPromise) return sessionBootstrapPromise;

  const token = getLegacyToken();
  if (!token || token === lastUnauthorizedToken) {
    return false;
  }

  sessionBootstrapPromise = fetch(`${API_BASE}/auth-session`, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders({ includeLegacyToken: true }),
  })
    .then((res) => {
      if (res.ok) {
        lastUnauthorizedToken = null;
        return true;
      }
      if (res.status === 401) {
        lastUnauthorizedToken = token;
      }
      return false;
    })
    .catch(() => false)
    .finally(() => {
      sessionBootstrapPromise = null;
    });

  return sessionBootstrapPromise;
}

async function request(path, { method = 'GET', body } = {}) {
  await bootstrapSession();

  let res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: buildHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    const legacyToken = getLegacyToken();
    const canTryBootstrap = Boolean(legacyToken && legacyToken !== lastUnauthorizedToken);
    if (canTryBootstrap) {
      const bootstrapped = await bootstrapSession();
      if (bootstrapped) {
        res = await fetch(`${API_BASE}${path}`, {
          method,
          credentials: 'include',
          headers: buildHeaders(),
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) {
      const token = getLegacyToken();
      if (token) {
        lastUnauthorizedToken = token;
      }
      if (!token) {
        throw createAuthRequiredError();
      }
      throw new ApiError(
        err.error || '🔐 Unauthorized. API token tidak cocok dengan server.',
        { status: 401, code: 'UNAUTHORIZED' }
      );
    }
    throw new ApiError(err.error || `HTTP ${res.status}`, { status: res.status });
  }

  lastUnauthorizedToken = null;

  return res.json();
}

async function post(path, body = {}) {
  return request(path, { method: 'POST', body });
}

async function get(path) {
  return request(path, { method: 'GET' });
}

/* ── Chat ── */

export async function sendChat({ message, chatType = 'utama', threadId = null, runMode = 'system' }) {
  return post('/chat', { action: 'chat', message, chatType, threadId, runMode });
}

export async function listThreads(chatType = null, limit = 30) {
  return post('/chat', { action: 'list_threads', chatType, limit });
}

export async function createThread(chatType = 'utama', title = null) {
  return post('/chat', { action: 'create_thread', chatType, title });
}

export async function deleteThread(threadId) {
  return post('/chat', { action: 'delete_thread', threadId });
}

export async function getMessages(threadId, limit = 30) {
  return post('/chat', { action: 'get_messages', threadId, limit });
}

export async function renameThread(threadId, title) {
  return post('/chat', { action: 'rename_thread', threadId, title });
}

export async function saveMemory({ content, category = 'general', title = null }) {
  return post('/chat', { action: 'save_memory', params: { content, category, title } });
}

export async function getEvents(date = null) {
  return post('/chat', { action: 'get_events', params: { date } });
}

export async function setMode(mode) {
  return post('/chat', { action: 'set_mode', params: { mode } });
}

export async function createEventAction({ summary, startTime, endTime, description = '' }) {
  return post('/chat', { action: 'create_event', params: { summary, startTime, endTime, description } });
}

export async function deleteEventAction(eventId) {
  return post('/chat', { action: 'delete_event', params: { eventId } });
}

export async function rescheduleEventAction({ eventId, startTime, endTime, summary = '' }) {
  return post('/chat', { action: 'reschedule', params: { eventId, startTime, endTime, summary } });
}

/* ── Cases ── */

export async function createCaseAction({ title, category = 'general', summary = '', entities = [] }) {
  return post('/chat', { action: 'create_case', params: { title, category, summary, entities } });
}

export async function getCasesAction(status = 'active') {
  return post('/chat', { action: 'get_cases', params: { status } });
}

// ✨ Phase 3: Get case suggestions
export async function getCaseSuggestions(message) {
  return post('/chat', { action: 'get_case_suggestions', params: { message } });
}

export async function createCaseAutoAction({ title, category = 'general', summary = '', entities = [] }) {
  return post('/chat', { action: 'create_case_auto', params: { title, category, summary, entities } });
}

export async function updateCaseAction(caseId, detail) {
  return post('/chat', { action: 'update_case', params: { caseId, detail } });
}

/* ── Quota ── */

export async function getQuotaStatus() {
  return get('/quota-status');
}

export async function getQuotaEta() {
  return get('/quota-eta');
}

export async function getSystemStatus() {
  return get('/system-status');
}

/* ── Profile ── */

export async function getProfile() {
  return get('/profile');
}

export async function updateProfile(profile) {
  return post('/profile', { profile });
}

/* ── Memory Import / Transcript ── */

export async function importMemoryItems(items, eventDate = null) {
  return post('/import-memory', { items, eventDate });
}

export async function convertTranscript({ transcript, eventDate = null, startDate = null, endDate = null, splitMode = 'auto' }) {
  return post('/convert-transcript', { transcript, source: 'web_transcript_import', eventDate, startDate, endDate, splitMode });
}
