/* ━━━ Felicia API Service ━━━ */

const API_BASE = '/api';
const TOKEN = 'b4d7e36bac038cd0d22c93a1d741159615908f1a87ee8fd3c25dce52c0002a19';

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

async function post(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers });
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
