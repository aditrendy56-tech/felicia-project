import { checkDuplicateMemoryInDB, saveMemory } from './_lib/supabase.js';
import { setCorsHeaders, setSecurityHeaders, handleOptions } from './_lib/cors.js';

const MAX_IMPORT_ITEMS = 120;

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptions(res, req);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || token !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const requestEventDate = normalizeEventDate(body.eventDate);

  if (items.length === 0) {
    return res.status(400).json({
      error: 'Payload harus berisi array items',
      example: {
        items: [
          {
            category: 'goal',
            content: 'STATE[goal_business] Target 12 bulan: ...',
            topicKey: 'goal_business',
            memoryType: 'state',
          },
        ],
      },
    });
  }

  if (items.length > MAX_IMPORT_ITEMS) {
    return res.status(400).json({
      error: `Maksimal ${MAX_IMPORT_ITEMS} item per request.` ,
      maxItems: MAX_IMPORT_ITEMS,
      received: items.length,
    });
  }

  let imported = 0;
  let skipped = 0;
  const issues = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const category = String(item.category || 'general').trim() || 'general';
    const rawContent = String(item.content || '').trim();
    const itemEventDate = normalizeEventDate(item.eventDate) || requestEventDate;
    const content = addDateTag(rawContent, itemEventDate);
    const topicKey = item.topicKey ? String(item.topicKey).trim() : null;
    const memoryType = item.memoryType ? String(item.memoryType).trim().toLowerCase() : 'state';
    const source = item.source ? String(item.source).trim() : 'manual_import';

    if (!content) {
      skipped += 1;
      issues.push({ index, reason: 'content kosong' });
      continue;
    }

    const duplicate = await checkDuplicateMemoryInDB(content, category);
    if (duplicate) {
      skipped += 1;
      continue;
    }

    try {
      await saveMemory({
        category,
        content,
        topicKey,
        memoryType,
        source,
      });
      imported += 1;
    } catch (err) {
      skipped += 1;
      issues.push({ index, reason: String(err?.message || err) });
    }
  }

  return res.status(200).json({
    ok: true,
    imported,
    skipped,
    maxItems: MAX_IMPORT_ITEMS,
    received: items.length,
    issues,
  });
}

function normalizeEventDate(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  return `${matched[1]}-${matched[2]}-${matched[3]}`;
}

function addDateTag(content, eventDate) {
  const clean = String(content || '').trim();
  if (!clean) return clean;
  if (!eventDate) return clean;
  if (/^DATE\[\d{4}-\d{2}-\d{2}\]/i.test(clean)) return clean;
  return `DATE[${eventDate}] ${clean}`;
}
