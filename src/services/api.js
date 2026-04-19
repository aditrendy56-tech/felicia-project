/* ━━━ Felicia API Service ━━━ */

const API_BASE = '/api';

/**
 * Build headers dengan token aman
 * Coba fetch dari session/env dulu, fallback ke API_SECRET jika ada
 */
function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  const token = getSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Ambil session token dari sessionStorage atau environment
 */
function getSessionToken() {
  if (typeof window === 'undefined') return null;

  try {
    const stored = sessionStorage.getItem('felicia_api_token');
    if (stored) return stored;

    const localStored = localStorage.getItem('felicia_api_token');
    if (localStored) return localStored;
  } catch (e) {
    console.warn('[API] sessionStorage error:', e.message);
  }

  return import.meta.env.VITE_API_TOKEN || null;
}

async function post(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: buildHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ── Chat ── */

export async function sendChat({ message, chatType = 'utama', threadId = null }) {
  return post('/chat', { action: 'chat', message, chatType, threadId });
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
