import { getSemanticMemories } from './_lib/supabase.js';
import { setCorsHeaders, setSecurityHeaders, handleOptions } from './_lib/cors.js';

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return handleOptions(res, req);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query = '', limit = 10 } = req.body || {};
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Provide `query` in body' });

  try {
    const results = await getSemanticMemories(query, Number(limit || 10));
    return res.status(200).json({ ok: true, semantic: true, count: (results || []).length, results });
  } catch (err) {
    console.error('[DebugSemantic] error:', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
